import { Geometry, Feature } from "geojson";
import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException, JobIdNotFoundException } from "../exceptions/http/http-exceptions";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";
import { IOswService } from "./interface/Osw-service-interface";
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
import appContext from "../server";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { OswValidationJobs } from "../database/entity/osw-validate-jobs";

class OswService implements IOswService {
    constructor() { }

    /**
   * Publishes the osw record
   * @param tdei_record_id 
   */
    async processPublishRequest(user_id: string, tdei_record_id: string): Promise<void> {
        try {
            //
            let osw_version = await this.getOSWRecordById(tdei_record_id);
            //Compose the meessage
            let workflow_identifier = "OSW_PUBLISH_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: tdei_record_id,
                messageType: workflow_identifier,
                data: {
                    userId: user_id, // Required field for message authorization
                    projectGroupId: osw_version.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: osw_version.download_osw_url
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance.triggerWorkflow(workflow_identifier, queueMessage);

            return Promise.resolve();
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
            const uploadStoragePath = path.join(storageFolderPath, datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile[0].buffer))


            let validationJob = OswValidationJobs.from({
                upload_url: datasetUploadUrl,
                status: "In-progress"
            });

            const insertQuery = validationJob.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const job_id = result.rows[0]['job_id'];

            //Compose the meessage
            let workflow_identifier = "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: job_id,
                messageType: workflow_identifier,
                data: {
                    userId: user_id, // Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance.triggerWorkflow(workflow_identifier, queueMessage);

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
            //Validate metadata
            const metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const oswdto = OswUploadMeta.from(metadata);
            await this.validateMetadata(oswdto);

            //Check for unique name and version combination
            await this.checkMetaNameAndVersionUnique(metadata.name, metadata.version);

            // Generate unique UUID for the upload request 
            const uid = storageService.generateRandomUUID();

            //Upload the files to the storage
            const storageFolderPath = storageService.getFolderPath(uploadRequestObject.tdei_service_id, uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, uploadRequestObject.datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(uploadRequestObject.datasetFile[0].buffer))
            // Upload the metadata file  
            const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
            const metadataUploadUrl = await storageService.uploadFile(metadataStorageFilePath, 'text/json', uploadRequestObject.metadataFile[0].buffer);
            // Upload the changeset file  
            let changesetUploadUrl = "";
            if (uploadRequestObject.changesetFile) {
                const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.txt');
                changesetUploadUrl = await storageService.uploadFile(changesetStorageFilePath, 'text/plain', uploadRequestObject.changesetFile[0].buffer);
            }

            // Insert metadata into database
            const oswMetadataEntity = OswMetadataEntity.from(metadata);
            oswMetadataEntity.tdei_record_id = uid;
            await this.createOswMetadata(oswMetadataEntity);

            // Insert osw version into database
            const oswEntity = new OswVersions();
            oswEntity.tdei_record_id = uid;
            oswEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            oswEntity.download_changeset_url = changesetUploadUrl ?? null;
            oswEntity.download_metadata_url = metadataUploadUrl;
            oswEntity.download_osw_url = datasetUploadUrl;
            oswEntity.uploaded_by = uploadRequestObject.user_id;
            await this.createOsw(oswEntity);

            //Compose the meessage
            let workflow_identifier = "OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW";
            let queueMessage = QueueMessage.from({
                messageId: uid,
                messageType: workflow_identifier,
                data: {
                    userId: uploadRequestObject.user_id,// Required field for message authorization
                    projectGroupId: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
                    file_upload_path: datasetUploadUrl
                }
            });
            //Trigger the workflow
            await appContext.orchestratorServiceInstance.triggerWorkflow(workflow_identifier, queueMessage);

            //Return the tdei_record_id
            return Promise.resolve(uid);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validates the metadata
     * @param metadataObj 
     */
    private async validateMetadata(metadataObj: OswUploadMeta) {

        const metadata_result = await validate(metadataObj);

        if (metadata_result.length) {
            console.log('Metadata validation failed');
            console.log(metadata_result);
            // Need to send these as response
            const message = metadata_result.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException('Input validation failed with below reasons : \n' + message);
        }
    }

    async getAllOsw(params: OswQueryParams): Promise<OswDTO[]> {
        //Builds the query object. All the query consitions can be build in getQueryObject()
        const queryObject = params.getQueryObject();

        const queryConfig = <QueryConfig>{
            text: queryObject.getQuery(),
            values: queryObject.getValues()
        }

        const result = await dbClient.query(queryConfig);

        const list: OswDTO[] = [];
        result.rows.forEach(x => {
            const osw = OswDTO.from(x);
            if (osw.polygon) {
                const polygon = JSON.parse(x.polygon2) as Geometry;
                osw.polygon = {
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

    async getOswStreamById(id: string, format: string = "osw"): Promise<FileEntity> {
        const query = {
            text: 'Select file_upload_path, download_osm_url from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        const osw = await dbClient.query(query);

        if (osw.rowCount == 0)
            throw new HttpException(404, "File not found");

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        var url: string = '';
        if (format == "osm") {
            if (osw.rows[0].download_osm_url && osw.rows[0].download_osm_url != '')
                url = decodeURIComponent(osw.rows[0].download_osm_url);
            else
                throw new HttpException(404, "Requested OSM file format not found");
        } else if (format == "osw") {
            url = decodeURIComponent(osw.rows[0].file_upload_path);
        }
        else {
            //default osw
            url = decodeURIComponent(osw.rows[0].file_upload_path);
        }

        return storageClient.getFileFromUrl(url);
    }

    /**
     * Validates the unique name and version combination
     * @param name 
     * @param version 
     * @returns 
     */
    private async checkMetaNameAndVersionUnique(name: string, version: string): Promise<Boolean> {
        try {
            const queryObject = {
                text: `Select * FROM public.osw_metadata 
                WHERE name=$1 AND version=$2`.replace(/\n/g, ""),
                values: [name, version],
            }

            let result = await dbClient.query(queryObject);

            //If record exists then throw error
            if (result.rowCount)
                throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error saving the osw version", error);
            return Promise.reject(false);
        }
    }

    /**
     * Creates the new version of osw file in the TDEI system
     * @param oswInfo 
     * @returns 
     */
    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.download_osw_url = decodeURIComponent(oswInfo.download_osw_url!);

            await dbClient.query(oswInfo.getInsertQuery());

            const osw = OswDTO.from(oswInfo);
            return Promise.resolve(osw);
        } catch (error) {

            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswInfo.tdei_record_id);
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
    private async createOswMetadata(oswMetadataEntity: OswMetadataEntity): Promise<void> {
        try {
            await dbClient.query(oswMetadataEntity.getInsertQuery());
            return Promise.resolve();
        } catch (error) {
            console.error("Error saving the osw metadata", error);
            return Promise.reject(error);
        }
    }

    // async updateOsw(oswInfo: OswVersions): Promise<OswDTO> {
    //     try {
    //         oswInfo.download_osw_url = decodeURIComponent(oswInfo.download_osw_url!);
    //         oswInfo.download_osm_url = decodeURIComponent(oswInfo.download_osm_url!);

    //         await dbClient.query(oswInfo.getUpdateQuery());

    //         const osw = OswDTO.from(oswInfo);
    //         return Promise.resolve(osw);
    //     } catch (error) {
    //         console.error("Error updating the osw version", error);
    //         return Promise.reject(error);
    //     }
    // }

    async getOSWRecordById(id: string): Promise<OswVersions> {
        const query = {
            text: 'Select * from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        const result = await dbClient.query(query);
        if (result.rowCount == 0)
            throw new HttpException(404, "Record not found");
        const record = result.rows[0];
        console.log(record);
        const osw = OswVersions.from(record);

        return osw;
    }

    async createOSWConfidenceJob(info: OswConfidenceJob): Promise<string> {
        try {
            const query = info.getInsertQuery()
            const result = await dbClient.query(query)
            const inserted_jobId = result.rows[0]['jobid']; // Get the jobId and return it back
            return inserted_jobId;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async getOSWConfidenceJob(jobId: string): Promise<OswConfidenceJob> {
        try {
            const query = {
                text: 'SELECT * from public.osw_confidence_jobs where jobId = $1',
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

    async updateConfidenceMetric(info: OSWConfidenceResponse): Promise<string> {
        try {
            console.log('Updating status for ', info.jobId);
            const updateQuery = info.getUpdateJobQuery();
            const result = await dbClient.query(updateQuery);
            const tdeiRecordId = result.rows[0]['tdei_record_id'];
            if (tdeiRecordId != undefined) {
                console.log('Updating OSW records');
                const oswUpdateQuery = info.getRecordUpdateQuery(tdeiRecordId);
                const queryResult = await dbClient.query(oswUpdateQuery);
            }

            return info.jobId.toString();
        }
        catch (error) {
            Promise.reject(error);
        }
        return ''
    }

    async createOSWFormatJob(info: OswFormatJob): Promise<string> {

        try {
            console.log(' Creating formatting job');
            const insertQuery = info.getInsertQuery();

            const result = await dbClient.query(insertQuery);
            const jobId = result.rows[0]['jobid'];
            if (jobId == undefined) {
                return ''; //TODO: Throw insert exception
            }
            return jobId;
        }
        catch (error) {
            return Promise.reject(error);
        }
    }

    async updateOSWFormatJob(info: OswFormatJobResponse): Promise<string> {
        console.log(' Updating formatter job info');
        try {
            const updateQuery = OswFormatJob.getUpdateStatusQuery(info.jobId, info.status, info.formattedUrl, info.message)
            const result = await dbClient.query(updateQuery);
            if (result.rowCount == 0) {
                // Something went wrong. Write the stuff here.
                return '';
            }
            return info.jobId;
        }
        catch (error) {
            console.log('Error while updating formatter job')
            console.log(error);
            Promise.reject(error);
        }
        return '';
    }

    async getOSWFormatJob(jobId: string): Promise<OswFormatJob> {

        try {
            const query = {
                text: 'SELECT * from public.osw_formatting_jobs where jobId = $1',
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
}

const oswService: IOswService = new OswService();
export default oswService;
