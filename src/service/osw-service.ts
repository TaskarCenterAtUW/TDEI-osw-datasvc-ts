import { Geometry, Feature } from "geojson";
import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException, JobIdNotFoundException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams, RecordStatus } from "../model/osw-get-query-params";
import { OswConfidenceJob } from "../database/entity/osw-confidence-job-entity";
import { OSWConfidenceResponse } from "../model/osw-confidence-response";
import { OswFormatJob } from "../database/entity/osw-format-job-entity";
import { OswFormatJobResponse } from "../model/osw-format-job-response";
import { IUploadRequest } from "./interface/upload-request-interface";
import { OswUploadMeta } from "../model/osw-upload-meta";
import { ValidationError, validate } from "class-validator";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import { OswMetadataEntity } from "../database/entity/osw-metadata";
import appContext from "../app-context";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { OswValidationJobs } from "../database/entity/osw-validate-jobs";
import workflowDatabaseService from "../orchestrator/services/workflow-database-service";
import { Utility } from "../utility/utility";
import { environment } from "../environment/environment";
import fetch from "node-fetch";
import { ServiceDto } from "../model/service-dto";
import { ProjectGroupRoleDto } from "../model/project-group-role-dto";
import { OSWConfidenceRequest } from "../model/osw-confidence-request";
import { OswFormatJobRequest } from "../model/osw-format-job-request";
import { IOswService } from "./interface/osw-service-interface";
import { DatasetFlatteningJob } from "../database/entity/dataset-flattening-job";
import { BackendJob } from "../database/entity/backend-job";
import { ServiceRequest } from "../model/backend-request-interface";
import { BackendServiceJobResponse } from "../model/backend-service-job-response";
import { DataFlatteningJobResponse } from "../model/data-flattening-job-response";

class OswService implements IOswService {
    constructor() { }

    /**
     * Invalidate the record
     * @param user_id 
     * @param tdei_record_id 
     */
    async invalidateRecordRequest(user_id: any, tdei_record_id: string): Promise<boolean> {
        try {
            const queryResult = await dbClient.query(OswVersions.getDeleteRecordQuery(tdei_record_id, user_id));
            if (queryResult.rowCount && queryResult.rowCount > 0) {
                return Promise.resolve(true);
            }

            throw new InputException(`${tdei_record_id} not found.`);

        } catch (error) {
            console.error("Error invalidating the record", error);
            throw error;
        }
    }

    /**
         * On-demand format request
         * @param source 
         * @param target 
         * @param uploadedFile 
         * @param user_id 
         */
    async processFormatRequest(source: string, target: string, uploadedFile: Express.Multer.File, user_id: any): Promise<string> {
        try {
            // Get the upload path
            const uid = storageService.generateRandomUUID();
            const folderPath = storageService.getFormatJobPath(uid);
            const uploadPath = path.join(folderPath, uploadedFile!.originalname)
            const extension = path.extname(uploadedFile!.originalname)
            let fileType = 'application/xml'
            if (extension == 'zip') {
                fileType = 'application/zip'
            }
            const remoteUrl = await storageService.uploadFile(uploadPath, fileType, Readable.from(uploadedFile!.buffer))
            console.log('Uplaoded to ', remoteUrl);
            const oswformatJob = new OswFormatJob();
            oswformatJob.created_at = new Date();
            oswformatJob.source = source; //TODO: Validate the input enums 
            oswformatJob.target = target; //TODO: Validate the input enums
            oswformatJob.source_url = remoteUrl;
            oswformatJob.status = 'started';
            oswformatJob.requested_by = user_id;

            const jobId = await this.createOSWFormatJob(oswformatJob);
            // Send the same to service bus.
            oswformatJob.job_id = parseInt(jobId);

            //Compose the meessage
            let workflow_identifier = "OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW";
            const oswFormatRequest = OswFormatJobRequest.from({
                jobId: oswformatJob.job_id.toString(),
                source: oswformatJob.source,
                target: oswformatJob.target,
                sourceUrl: oswformatJob.source_url
            });
            let queueMessage = QueueMessage.from({
                messageId: jobId,
                messageType: workflow_identifier,
                data: oswFormatRequest
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            // Send the jobId back to the user.
            return Promise.resolve(jobId);

        } catch (error) {
            throw error;
        }
    }

    /**
     * Calculates on-demand confidence matrics for given tdei_record_id
     */
    async calculateConfidence(tdeiRecordId: string, user_id: string): Promise<string> {
        // Check and get the record for the same in the database
        try {
            const oswRecord = await this.getOSWRecordById(tdeiRecordId)
            // Create a job in the database for the same.
            //TODO: Have to add these based on some of the input data.
            const confidence_job = new OswConfidenceJob()
            confidence_job.tdei_dataset_id = tdeiRecordId;
            confidence_job.trigger_type = 'manual';
            confidence_job.created_at = new Date();
            confidence_job.updated_at = new Date();
            confidence_job.status = 'started';
            confidence_job.cm_last_calculated_at = new Date();
            confidence_job.user_id = user_id;
            confidence_job.cm_version = 'v1.0';
            const jobId = await this.createOSWConfidenceJob(confidence_job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            const confidenceRequestMsg = new OSWConfidenceRequest();
            confidenceRequestMsg.jobId = jobId; // skip tdei-record-id
            confidenceRequestMsg.data_file = oswRecord.dataset_url;
            //TODO: Once this is done, get the things moved.
            confidenceRequestMsg.meta_file = oswRecord.metadata_url;
            confidenceRequestMsg.trigger_type = 'manual' //release
            //this.eventBusService.publishConfidenceRequest(confidenceRequestMsg);

            //Compose the meessage
            let workflow_identifier = "OSW_ON_DEMAND_CONFIDENCE_METRIC_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: tdeiRecordId,
                messageType: workflow_identifier,
                data: confidenceRequestMsg
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            // Send the jobId back to the user.
            return Promise.resolve(jobId);
        }
        catch (error) {
            console.log("Error calculating confidence ", error);
            return Promise.reject(error);
        }
    }
    /**
   * Publishes the osw record
   * @param tdei_record_id 
   */
    async processPublishRequest(user_id: string, tdei_record_id: string): Promise<void> {
        try {
            let osw_version = await this.getOSWRecordById(tdei_record_id);
            let osw_metadata = await this.getOSWMetadataById(tdei_record_id);

            if (osw_version.status === 'Publish')
                throw new InputException(`${tdei_record_id} already publised.`)

            // Check if there is a record with the same date
            const queryResult = await dbClient.query(osw_metadata.getOverlapQuery(osw_version.tdei_project_group_id, osw_version.tdei_service_id));
            if (queryResult.rowCount && queryResult.rowCount > 0) {
                const recordId = queryResult.rows[0]["tdei_record_id"];
                throw new OverlapException(recordId);
            }

            //Compose the meessage
            let workflow_identifier = "OSW_PUBLISH_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: tdei_record_id,
                messageType: workflow_identifier,
                data: {
                    user_id: user_id, // Required field for message authorization
                    tdei_project_group_id: osw_version.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: osw_version.dataset_url
                }
            });
            //Delete exisitng workflow if exists
            let trigger_workflow = appContext.orchestratorServiceInstance!.getWorkflowByIdentifier(workflow_identifier);
            workflowDatabaseService.obseleteAnyExistingWorkflowHistory(tdei_record_id, trigger_workflow?.group!);
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes the dataset flattening request
     * @param user_id 
     * @param tdei_record_id 
     * @param override 
     * @returns 
     */
    async processDatasetFlatteningRequest(user_id: string, tdei_record_id: string, override: boolean): Promise<string> {
        try {
            let osw_version = await this.getOSWRecordById(tdei_record_id);
            if (!override) {
                const checkRecordsQueryObject = {
                    text: `SELECT id  
                    from content.edge 
                    WHERE 
                    tdei_dataset_id = $1 LIMIT 1`.replace(/\n/g, ""),
                    values: [tdei_record_id]
                };

                // Check if there is a record with the same date
                const queryResult = await dbClient.query(checkRecordsQueryObject);
                if (queryResult.rowCount && queryResult.rowCount > 0) {
                    throw new InputException(`${tdei_record_id} already flattened. If you want to override, please use the override flag.`);
                }
            }
            else {
                //Delete the existing records
                const deleteRecordsQueryObject = {
                    text: `SELECT delete_dataset_records_by_id($1)`.replace(/\n/g, ""),
                    values: [tdei_record_id]
                };
                await dbClient.query(deleteRecordsQueryObject);
            }

            //Create job 
            let flatterningJob = DatasetFlatteningJob.from({
                status: "IN-PROGRESS",
                requested_by: user_id,
                tdei_dataset_id: tdei_record_id
            });

            const insertQuery = flatterningJob.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const job_id = result.rows[0].job_id;

            //Compose the meessage
            let workflow_identifier = "ON_DEMAND_DATASET_FLATTENING_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id,
                messageType: workflow_identifier,
                data: {
                    data_type: "osw",
                    file_upload_path: osw_version.dataset_url,
                    tdei_dataset_id: tdei_record_id
                }
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes the dataset flattening request
     * @param user_id 
     * @param tdei_record_id 
     * @param override 
     * @returns 
     */
    async processBackendRequest(backendRequest: ServiceRequest): Promise<string> {
        try {

            //Create job 
            let backendJob = BackendJob.from({
                status: "IN-PROGRESS",
                requested_by: backendRequest.user_id
            });

            const insertQuery = backendJob.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const job_id = result.rows[0].job_id;

            //Compose the meessage
            let workflow_identifier = "BACKEND_SERVICE_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id,
                messageType: workflow_identifier,
                data: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters
                }
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id);
        } catch (error) {
            throw error;
        }
    }

    /**
   * Processes the validation only request
   * @param tdei_record_id 
   */
    async processValidationOnlyRequest(user_id: string, datasetFile: any): Promise<string> {
        try {

            //Upload the files to the storage
            const uid = storageService.generateRandomUUID();
            const storageFolderPath = storageService.getValidationJobPath(uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, datasetFile.originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile.buffer))


            let validationJob = OswValidationJobs.from({
                upload_url: datasetUploadUrl,
                status: "In-progress",
                requested_by: user_id
            });

            const insertQuery = validationJob.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const job_id = result.rows[0].job_id;

            //Compose the meessage
            let workflow_identifier = "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id,
                messageType: workflow_identifier,
                data: {
                    user_id: user_id, // Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id);
        } catch (error) {
            throw error;
        }
    }

    /**
    * Processes the upload request and returns the unique tdei_record_id to represent the request
    * @param uploadRequestObject 
    */
    async processUploadRequest(uploadRequestObject: IUploadRequest): Promise<string> {
        try {

            //validate derived dataset id
            if (uploadRequestObject.derived_from_dataset_id.length > 0) {
                const query = {
                    text: 'Select * from content.dataset WHERE tdei_dataset_id = $1',
                    values: [uploadRequestObject.derived_from_dataset_id],
                }

                const result = await dbClient.query(query);
                if (result.rowCount == 0) {
                    throw new InputException("Derived dataset id not found");
                }
            }

            //Validate service_id 
            const service = await this.getServiceById(uploadRequestObject.tdei_service_id, uploadRequestObject.tdei_project_group_id);
            if (!service) {
                // Service not found exception.
                throw new ServiceNotFoundException(uploadRequestObject.tdei_service_id);
            }
            else if (service.tdei_project_group_id != uploadRequestObject.tdei_project_group_id) {
                throw new InputException(`${uploadRequestObject.tdei_project_group_id} id not associated with the tdei_service_id`);
            }

            //Validate metadata
            const metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const oswdto = OswUploadMeta.from(metadata);
            await this.validateMetadata(oswdto);

            //Check for unique name and version combination
            if (await this.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
                throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            // Generate unique UUID for the upload request 
            const uid = storageService.generateRandomUUID();

            //Upload the files to the storage
            const storageFolderPath = storageService.getFolderPath(uploadRequestObject.tdei_project_group_id, uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, uploadRequestObject.datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(uploadRequestObject.datasetFile[0].buffer))
            // Upload the metadata file  
            const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
            const metadataUploadUrl = await storageService.uploadFile(metadataStorageFilePath, 'text/json', Readable.from(uploadRequestObject.metadataFile[0].buffer));
            // Upload the changeset file  
            let changesetUploadUrl = "";
            if (uploadRequestObject.changesetFile) {
                const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.txt');
                changesetUploadUrl = await storageService.uploadFile(changesetStorageFilePath, 'text/plain', Readable.from(uploadRequestObject.changesetFile[0].buffer));
            }

            // Insert osw version into database
            const oswEntity = new OswVersions();
            oswEntity.tdei_dataset_id = uid;
            oswEntity.data_type = 'osw';
            oswEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            oswEntity.tdei_project_group_id = uploadRequestObject.tdei_project_group_id;
            oswEntity.derived_from_dataset_id = uploadRequestObject.derived_from_dataset_id;
            oswEntity.changeset_url = changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "";
            oswEntity.metadata_url = decodeURIComponent(metadataUploadUrl);
            oswEntity.dataset_url = decodeURIComponent(datasetUploadUrl);
            oswEntity.uploaded_by = uploadRequestObject.user_id;
            oswEntity.updated_by = uploadRequestObject.user_id;
            await this.createOsw(oswEntity);

            // Insert metadata into database
            const oswMetadataEntity = OswMetadataEntity.from(metadata);
            oswMetadataEntity.tdei_dataset_id = uid;
            oswMetadataEntity.schema_version = metadata.osw_schema_version;
            await this.createOswMetadata(oswMetadataEntity);

            //TODO:: test data to be removed while PR
            let temp_tdei_project_group_id = 'c552d5d1-0719-4647-b86d-6ae9b25327b7';
            uploadRequestObject.tdei_project_group_id = temp_tdei_project_group_id;

            //Compose the meessage
            let workflow_identifier = "OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: uid,
                messageType: workflow_identifier,
                data: {
                    user_id: uploadRequestObject.user_id,// Required field for message authorization
                    tdei_project_group_id: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            //Return the tdei_record_id
            return Promise.resolve(uid);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Gets the service details for given projectGroupId and serviceid
     * @param serviceId service id uniquely represented by TDEI system
     * @param projectGroupId oraganization id uniquely represented by TDEI system
     * @returns 
     */
    async getServiceById(serviceId: string, projectGroupId: string): Promise<ServiceDto | undefined> {
        try {
            const secretToken = await Utility.generateSecret();
            const result = await fetch(`${environment.serviceUrl}?tdei_service_id=${serviceId}&tdei_project_group_id=${projectGroupId}&service_type=osw&page_no=1&page_size=1`, {
                method: 'get',
                headers: { 'Content-Type': 'application/json', 'x-secret': secretToken }
            });

            const data: [] = await result.json();

            if (result.status != undefined && result.status != 200)
                throw new Error(await result.json());

            if (data.length == 0)
                throw new Error();

            return Promise.resolve(ServiceDto.from(data.pop()));
        } catch (error: any) {
            console.error(error);
            return Promise.resolve(undefined);
        }
    }

    /**
    * Gets the user associated project groups
    * @param user_id 
    * @returns 
    */
    async getUserProjectGroups(user_id: string): Promise<ProjectGroupRoleDto[] | undefined> {
        try {
            const secretToken = await Utility.generateSecret();
            const result = await fetch(`${environment.userProjectGroupRolesUrl}/${user_id}`, {
                method: 'get',
                headers: { 'Content-Type': 'application/json', 'x-secret': secretToken }
            });

            const data: [] = await result.json();

            if (result.status != undefined && result.status != 200)
                throw new Error(await result.json());

            let projectGroupRoleList: ProjectGroupRoleDto[] = [];

            data.forEach(x => {
                projectGroupRoleList.push(new ProjectGroupRoleDto(x));
            });

            return Promise.resolve(projectGroupRoleList);
        } catch (error: any) {
            console.error(error);
            return Promise.resolve(undefined);
        }
    }

    /**
     * Validates the metadata
     * @param metadataObj 
     */
    async validateMetadata(metadataObj: OswUploadMeta): Promise<void> {

        const metadata_result = await validate(metadataObj);

        if (metadata_result.length) {
            console.log('Metadata validation failed');
            console.log(metadata_result);
            // Need to send these as response
            const message = metadata_result.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException('Input validation failed with below reasons : \n' + message);
        }
    }

    async getAllOsw(user_id: string, params: OswQueryParams): Promise<OswDTO[]> {
        //Builds the query object. All the query consitions can be build in getQueryObject()
        //TODO:: QUERY FROM UNIFY DB
        let userProjectGroups = await this.getUserProjectGroups(user_id);

        if (params.status && params.status == RecordStatus["Pre-Release"] && !userProjectGroups && !params.isAdmin)
            throw new InputException("To fetch `Pre-Release` versions, User should belong to Project group/s");

        const queryObject = params.getQueryObject(userProjectGroups ? userProjectGroups!.map(x => x.tdei_project_group_id) : []);

        const queryConfig = <QueryConfig>{
            text: queryObject.getQuery(),
            values: queryObject.getValues()
        }
        const result = await dbClient.query(queryConfig);

        const list: OswDTO[] = [];
        result.rows.forEach(x => {
            const osw = OswDTO.from(x);
            osw.tdei_record_id = x.tdei_dataset_id;
            osw.osw_schema_version = x.schema_version;
            if (osw.dataset_area) {
                const polygon = JSON.parse(x.polygon2) as Geometry;
                osw.dataset_area = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            geometry: polygon,
                            properties: {}
                        } as Feature
                    ]
                }
            }
            list.push(osw);
        })
        return Promise.resolve(list);
    }

    async getOswStreamById(id: string, format: string = "osw"): Promise<FileEntity[]> {
        let fileEntities: FileEntity[] = [];
        const query = {
            text: 'Select status, dataset_url, osm_url, changeset_url, metadata_url from content.dataset WHERE tdei_dataset_id = $1',
            values: [id],
        }

        const osw = await dbClient.query(query);

        if (osw.rowCount == 0)
            throw new HttpException(404, "File not found");

        if (osw.rows[0].status == "Deleted")
            throw new HttpException(404, "Request record is deleted");

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        var url: string = '';
        if (format == "osm") {
            if (osw.rows[0].osm_url && osw.rows[0].osm_url != '')
                url = decodeURIComponent(osw.rows[0].osm_url);
            else
                throw new HttpException(404, "Requested OSM file format not found");
        } else if (format == "osw") {
            url = decodeURIComponent(osw.rows[0].dataset_url);
        }
        else {
            //default osw
            url = decodeURIComponent(osw.rows[0].dataset_url);
        }

        fileEntities.push(await storageClient.getFileFromUrl(url));
        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(osw.rows[0].metadata_url)));
        if (osw.rows[0].changeset_url && osw.rows[0].changeset_url != "" && osw.rows[0].changeset_url != null)
            fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(osw.rows[0].changeset_url)));

        return fileEntities;
    }

    /**
     * Validates the unique name and version combination
     * @param name 
     * @param version 
     * @returns 
     */
    async checkMetaNameAndVersionUnique(name: string, version: string): Promise<Boolean> {
        try {
            const queryObject = {
                text: `Select * FROM content.metadata 
                WHERE name=$1 AND version=$2`.replace(/\n/g, ""),
                values: [name, version],
            }

            let result = await dbClient.query(queryObject);

            //If record exists then throw error
            if (result.rowCount)
                return Promise.resolve(true);

            return Promise.resolve(false);
        } catch (error) {
            console.error("Error checking the name and version", error);
            return Promise.resolve(true);
        }
    }

    /**
     * Creates the new version of osw file in the TDEI system
     * @param oswInfo 
     * @returns 
     */
    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.dataset_url = decodeURIComponent(oswInfo.dataset_url!);

            await dbClient.query(oswInfo.getInsertQuery());

            const osw = OswDTO.from(oswInfo);
            return Promise.resolve(osw);
        } catch (error) {

            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswInfo.tdei_dataset_id);
            }

            console.error("Error saving the osw version", error);
            return Promise.reject(error);
        }
    }

    /**
     * Creates the metadata entry for new osw version
     * @param oswMetadataEntity 
     * @returns 
     */
    async createOswMetadata(oswMetadataEntity: OswMetadataEntity): Promise<void> {
        try {
            await dbClient.query(oswMetadataEntity.getInsertQuery());
            return Promise.resolve();
        } catch (error) {
            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswMetadataEntity.tdei_dataset_id);
            }

            console.error("Error saving the osw metadata", error);
            return Promise.reject(error);
        }
    }

    async getOSWRecordById(id: string): Promise<OswVersions> {
        const query = {
            text: `Select * from content.dataset WHERE tdei_dataset_id = $1`,
            values: [id],
        }

        const result = await dbClient.query(query);
        if (result.rowCount == 0)
            throw new HttpException(404, "Record not found");

        if (result.rows[0].status == "Deleted")
            throw new HttpException(400, "Request record is invalid/deleted");

        const record = result.rows[0];
        const osw = OswVersions.from(record);

        return osw;
    }

    /**
     * Fetches osw metadata for given tdei_record_id
     * @param id 
     * @returns 
     */
    async getOSWMetadataById(id: string): Promise<OswMetadataEntity> {
        const query = {
            text: 'Select * from content.metadata WHERE tdei_dataset_id = $1',
            values: [id],
        }

        const result = await dbClient.query(query);
        if (result.rowCount == 0)
            throw new HttpException(404, "Record not found");
        const record = result.rows[0];
        const metadata = OswMetadataEntity.from(record);
        return metadata;
    }

    async createOSWConfidenceJob(info: OswConfidenceJob): Promise<string> {
        try {
            const query = info.getInsertQuery()
            const result = await dbClient.query(query)
            const inserted_jobId = result.rows[0]['job_id']; // Get the jobId and return it back
            if (inserted_jobId == undefined) {
                throw new Error("Confidence job creation failed");
            }
            return inserted_jobId;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async getOSWConfidenceJob(jobId: string): Promise<OswConfidenceJob> {
        try {
            const query = {
                text: 'SELECT * from content.confidence_job where job_id = $1',
                values: [jobId],
            }
            const result = await dbClient.query(query);
            if (result.rowCount == 0) {
                return Promise.reject(new JobIdNotFoundException(jobId))
            }
            const job = OswConfidenceJob.from(result.rows[0])
            return job;

        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    async getDatasetFlatteningJob(jobId: string): Promise<DatasetFlatteningJob> {
        try {
            const query = {
                text: 'SELECT * from content.dataset_flattern_job where job_id = $1',
                values: [jobId],
            }
            const result = await dbClient.query(query);
            if (result.rowCount == 0) {
                return Promise.reject(new JobIdNotFoundException(jobId))
            }
            const job = DatasetFlatteningJob.from(result.rows[0])
            return job;
        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    async getBackendJob(jobId: string): Promise<BackendJob> {
        try {
            const query = {
                text: 'SELECT * from content.backend_job where job_id = $1',
                values: [jobId],
            }
            const result = await dbClient.query(query);
            if (result.rowCount == 0) {
                return Promise.reject(new JobIdNotFoundException(jobId))
            }
            const job = BackendJob.from(result.rows[0])
            return job;
        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    async updateConfidenceMetric(info: OSWConfidenceResponse): Promise<string> {
        try {
            console.log('Updating status for ', info.jobId);
            const updateQuery = info.getUpdateJobQuery();
            const result = await dbClient.query(updateQuery);

            if (result.rowCount === 0) {
                // Handle the case when no rows were updated. Write appropriate logic here.
                console.error('No rows were updated during the formatter job update.');
                throw new Error("Error updating confidence job");
            }

            const tdeiRecordId = result.rows[0]['tdei_record_id'];
            if (tdeiRecordId != undefined) {
                console.log('Updating OSW records');
                const oswUpdateQuery = info.getRecordUpdateQuery(tdeiRecordId);
                await dbClient.query(oswUpdateQuery);
            }

            return info.jobId.toString();
        }
        catch (error) {
            console.error('Error updating the formatter job.', error);
            return Promise.reject(error);
        }
    }

    async createOSWFormatJob(info: OswFormatJob): Promise<string> {

        try {
            console.log(' Creating formatting job');
            const insertQuery = info.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const jobId = result.rows[0]['job_id'];
            if (jobId == undefined) {
                throw new Error("Formatting job creation failed");
            }
            return jobId;
        }
        catch (error) {
            return Promise.reject(error);
        }
    }

    async updateBackendServiceJob(info: BackendServiceJobResponse): Promise<void> {
        console.log('Updating formatter job info');
        try {
            const updateQuery = BackendJob.getUpdateStatusQuery(info.job_id, info.status, info.file_upload_path, info.message);
            const result = await dbClient.query(updateQuery);

            if (result.rowCount === 0) {
                // Handle the case when no rows were updated. Write appropriate logic here.
                console.error('No rows were updated during the backend service job update.');
                throw new Error("Error updating backend service job");
            }

            console.log(`Backend service job successfully updated with jobId: ${info.job_id}`);
            return Promise.resolve();
        } catch (error) {
            console.error('Error while updating backend service job', error);
            return Promise.reject(error);
        }
    }

    async updateDatasetFlatteningJob(info: DataFlatteningJobResponse): Promise<void> {
        console.log('Updating formatter job info');
        try {
            const updateQuery = DatasetFlatteningJob.getUpdateStatusQuery(info.ref_id, info.status, info.message);
            const result = await dbClient.query(updateQuery);

            if (result.rowCount === 0) {
                // Handle the case when no rows were updated. Write appropriate logic here.
                console.error('No rows were updated during the dataset flattening job update.');
                throw new Error("Error updating formatting job");
            }

            console.log(`Dataset flattening job successfully updated with jobId: ${info.ref_id}`);
            return Promise.resolve();
        } catch (error) {
            console.error('Error while updating dataset flattening job', error);
            return Promise.reject(error);
        }
    }

    async updateOSWFormatJob(info: OswFormatJobResponse): Promise<void> {
        console.log('Updating formatter job info');
        try {
            const updateQuery = OswFormatJob.getUpdateStatusQuery(info.jobId, info.status, info.formattedUrl, info.message);
            const result = await dbClient.query(updateQuery);

            if (result.rowCount === 0) {
                // Handle the case when no rows were updated. Write appropriate logic here.
                console.error('No rows were updated during the formatter job update.');
                throw new Error("Error updating formatting job");
            }

            console.log(`Formatter job successfully updated with jobId: ${info.jobId}`);
            return Promise.resolve();
        } catch (error) {
            console.error('Error while updating formatter job', error);
            return Promise.reject(error);
        }
    }

    async getOSWFormatJob(jobId: string): Promise<OswFormatJob> {
        try {
            const query = {
                text: 'SELECT * from content.formatting_job where job_id = $1',
                values: [jobId],
            }
            const result = await dbClient.query(query);
            if (result.rowCount == 0) {
                return Promise.reject(new JobIdNotFoundException(jobId))
            }
            const job = OswFormatJob.from(result.rows[0])
            return job;
        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    /**
     * Gets the status of the on-demand validation job
     * @param job_id 
     * @returns 
     */
    async getOSWValidationJob(job_id: string): Promise<OswValidationJobs> {
        try {
            const query = {
                text: 'SELECT * from content.validation_job where job_id = $1',
                values: [job_id],
            }
            const result = await dbClient.query(query);
            if (result.rowCount == 0) {
                return Promise.reject(new JobIdNotFoundException(job_id))
            }
            const job = OswValidationJobs.from(result.rows[0])
            return job;
        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    getFileEntity(fullUrl: string): Promise<FileEntity> {
        const storageClient = Core.getStorageClient();
        return storageClient!.getFileFromUrl(fullUrl);

    }
}

const oswService: IOswService = new OswService();
export default oswService;

