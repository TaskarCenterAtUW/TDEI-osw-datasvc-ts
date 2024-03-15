import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { ConfidenceJobResponse } from "../model/job-request-response/osw-confidence-job-response";
import { IUploadRequest } from "./interface/upload-request-interface";
import { OswUploadMeta } from "../model/osw-upload-meta";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import { MetadataEntity } from "../database/entity/metadata-entity";
import appContext from "../app-context";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import workflowDatabaseService from "../orchestrator/services/workflow-database-service";
import { OSWConfidenceJobRequest } from "../model/job-request-response/osw-confidence-job-request";
import { OswFormatJobRequest } from "../model/job-request-response/osw-format-job-request";
import { IOswService } from "./interface/osw-service-interface";
import { ServiceRequest } from "../model/backend-request-interface";
import jobService from "./job-service";
import { IJobService } from "./interface/job-service-interface";
import { CreateJobDTO } from "../model/job-dto";
import { JobStatus, JobType, TDEIDataType } from "../model/jobs-get-query-params";
import tdeiCoreService from "./tdei-core-service";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";

class OswService implements IOswService {
    constructor(public jobServiceInstance: IJobService, public generalServiceInstance: ITdeiCoreService) { }

    /**
     * Processes a format request by uploading a file, creating a job, triggering a workflow, and returning the job ID.
     * @param source The source format of the file.
     * @param target The target format to convert the file to.
     * @param uploadedFile The file to be uploaded.
     * @param user_id The ID of the user making the request.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during the process.
     */
    async processFormatRequest(source: string, target: string, uploadedFile: Express.Multer.File, user_id: string): Promise<string> {
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
            const source_url = await storageService.uploadFile(uploadPath, fileType, Readable.from(uploadedFile!.buffer))
            console.log('Uplaoded to ', source_url);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Reformat"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    source_format: source,
                    target_format: target,
                    file_upload_name: uploadedFile!.originalname
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            let workflow_identifier = "OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW";
            const oswFormatRequest = OswFormatJobRequest.from({
                jobId: job_id.toString(),
                source: source,
                target: target,
                sourceUrl: source_url
            });

            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: oswFormatRequest
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            // Send the job_id back to the user.
            return Promise.resolve(job_id.toString());

        } catch (error) {
            throw error;
        }
    }

    /**
     * Calculates the confidence for a given TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param user_id - The ID of the user.
     * @returns A Promise that resolves to the ID of the created job.
     * @throws If there is an error calculating the confidence.
     */
    async calculateConfidence(tdei_dataset_id: string, user_id: string): Promise<string> {
        // Check and get the record for the same in the database
        try {
            const oswRecord = await this.generalServiceInstance.getDatasetDetailsById(tdei_dataset_id)
            // Create a job in the database for the same.
            //TODO: Have to add these based on some of the input data.

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Confidence-Calculate"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id,
                    trigger_type: 'manual'
                },
                tdei_project_group_id: oswRecord.tdei_project_group_id,
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            const confidenceRequestMsg = new OSWConfidenceJobRequest();
            confidenceRequestMsg.jobId = job_id.toString();
            confidenceRequestMsg.data_file = oswRecord.dataset_url;
            //TODO: Once this is done, get the things moved.
            confidenceRequestMsg.meta_file = oswRecord.metadata_url;
            confidenceRequestMsg.trigger_type = 'manual';

            //Compose the meessage
            let workflow_identifier = "OSW_ON_DEMAND_CONFIDENCE_METRIC_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: confidenceRequestMsg
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            // Send the jobId back to the user.
            return Promise.resolve(job_id.toString());
        }
        catch (error) {
            console.log("Error calculating confidence ", error);
            return Promise.reject(error);
        }
    }

    /**
     * Processes a publish request for a TDEI dataset.
     * 
     * @param user_id - The ID of the user making the request.
     * @param tdei_dataset_id - The ID of the TDEI dataset to publish.
     * @returns A Promise that resolves when the publish request is processed successfully.
     * @throws {InputException} If the dataset is already published.
     * @throws {OverlapException} If there is a record with the same date.
     * @throws {Error} If an error occurs during the processing of the publish request.
     */
    async processPublishRequest(user_id: string, tdei_dataset_id: string): Promise<string> {
        try {
            let dataset = await this.generalServiceInstance.getDatasetDetailsById(tdei_dataset_id);
            let metadata = await this.generalServiceInstance.getMetadataDetailsById(tdei_dataset_id);

            if (dataset.status === 'Publish')
                throw new InputException(`${tdei_dataset_id} already publised.`)

            // Check if there is a record with the same date
            const queryResult = await dbClient.query(metadata.getOverlapQuery(dataset.tdei_project_group_id, dataset.tdei_service_id));
            if (queryResult.rowCount && queryResult.rowCount > 0) {
                const recordId = queryResult.rows[0]["tdei_dataset_id"];
                throw new OverlapException(recordId);
            }

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Publish"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id
                },
                tdei_project_group_id: dataset.tdei_project_group_id,
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            let workflow_identifier = "OSW_PUBLISH_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: {
                    user_id: user_id, // Required field for message authorization
                    tdei_project_group_id: dataset.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: dataset.dataset_url
                }
            });
            //Delete exisitng workflow if exists
            let trigger_workflow = appContext.orchestratorServiceInstance!.getWorkflowByIdentifier(workflow_identifier);
            workflowDatabaseService.obseleteAnyExistingWorkflowHistory(tdei_dataset_id, trigger_workflow?.group!);
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes a dataset flattening request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param override - A boolean indicating whether to override existing records.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws {InputException} If the request is prohibited while the record is in the Publish state or if the dataset is already flattened without the override flag.
     */
    async processDatasetFlatteningRequest(user_id: string, tdei_dataset_id: string, override: boolean): Promise<string> {
        try {
            let dataset = await this.generalServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (dataset.status === 'Publish')
                throw new InputException(`Request is prohibited while the record is in the Publish state.`);

            if (!override) {
                const checkRecordsQueryObject = {
                    text: `SELECT id  
                    from content.edge 
                    WHERE 
                    tdei_dataset_id = $1 LIMIT 1`.replace(/\n/g, ""),
                    values: [tdei_dataset_id]
                };

                // Check if there is a record with the same date
                const queryResult = await dbClient.query(checkRecordsQueryObject);
                if (queryResult.rowCount && queryResult.rowCount > 0) {
                    throw new InputException(`${tdei_dataset_id} already flattened. If you want to override, please use the override flag.`);
                }
            }
            else {
                //Delete the existing records
                const deleteRecordsQueryObject = {
                    text: `SELECT delete_dataset_records_by_id($1)`.replace(/\n/g, ""),
                    values: [tdei_dataset_id]
                };
                await dbClient.query(deleteRecordsQueryObject);
            }

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Flatten"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id
                },
                tdei_project_group_id: dataset.tdei_project_group_id,
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            let workflow_identifier = "ON_DEMAND_DATASET_FLATTENING_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: {
                    data_type: "osw",
                    file_upload_path: dataset.dataset_url,
                    tdei_dataset_id: tdei_dataset_id
                }
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
     * @param backendRequest The backend request to process.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    async processBackendRequest(backendRequest: ServiceRequest): Promise<string> {
        try {

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Queries"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters
                },
                tdei_project_group_id: '',
                user_id: backendRequest.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            //Compose the meessage
            let workflow_identifier = "BACKEND_SERVICE_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters
                }
            });

            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes a validation-only request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param datasetFile - The dataset file to be uploaded and processed.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    async processValidationOnlyRequest(user_id: string, datasetFile: any): Promise<string> {
        try {

            //Upload the files to the storage
            const uid = storageService.generateRandomUUID();
            const storageFolderPath = storageService.getValidationJobPath(uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, datasetFile.originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile.buffer))

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Validate"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    file_upload_name: datasetFile.originalname
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            //Compose the meessage
            let workflow_identifier = "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: {
                    user_id: user_id, // Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes the upload request and performs various validations and operations.
     * 
     * @param uploadRequestObject - The upload request object containing the necessary information.
     * @returns A promise that resolves to the generated unique dataset ID.
     * @throws {InputException} If any validation fails or required data is missing.
     * @throws {ServiceNotFoundException} If the service associated with the request is not found.
     * @throws {Error} If any other error occurs during the process.
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
            const service = await this.generalServiceInstance.getServiceById(uploadRequestObject.tdei_service_id);
            if (!service) {
                // Service not found exception.
                throw new ServiceNotFoundException(uploadRequestObject.tdei_service_id);
            }
            else if (service!.owner_project_group != uploadRequestObject.tdei_project_group_id) {
                throw new InputException(`${uploadRequestObject.tdei_project_group_id} id not associated with the tdei_service_id`);
            }

            //Validate metadata
            const metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const oswdto = OswUploadMeta.from(metadata);
            let validation_errors = await this.generalServiceInstance.validateObject(oswdto);
            if (validation_errors) {
                throw new InputException(`Metadata validation failed with below reasons : \n${validation_errors}`);
            }

            //Check for unique name and version combination
            if (await this.generalServiceInstance.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
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
            const oswEntity = new DatasetEntity();
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
            await this.generalServiceInstance.createDataset(oswEntity);

            // Insert metadata into database
            const oswMetadataEntity = MetadataEntity.from(metadata);
            oswMetadataEntity.tdei_dataset_id = uid;
            oswMetadataEntity.schema_version = metadata.schema_version;
            await this.generalServiceInstance.createMetadata(oswMetadataEntity);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Upload"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    dataset_file_upload_name: uploadRequestObject.datasetFile[0].originalname,
                    metadata_file_upload_name: uploadRequestObject.metadataFile[0].originalname,
                    changeset_file_upload_name: uploadRequestObject.changesetFile ? uploadRequestObject.changesetFile[0].originalname : ""
                },
                response_props: {
                    tdei_dataset_id: uid
                },
                tdei_project_group_id: uploadRequestObject.tdei_project_group_id,
                user_id: uploadRequestObject.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            let workflow_identifier = "OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: workflow_identifier,
                data: {
                    user_id: uploadRequestObject.user_id,// Required field for message authorization
                    tdei_project_group_id: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            //Return the tdei_dataset_id
            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Retrieves the OswStream by its ID.
     * @param id - The ID of the OswStream.
     * @param format - The format of the OswStream (default is "osw").
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the OswStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
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
}

const oswService: IOswService = new OswService(jobService, tdeiCoreService);
export default oswService;

