import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import { InputException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { IUploadRequest } from "./interface/upload-request-interface";
import { DatasetUploadMetadata } from "../model/dataset-upload-meta";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import { MetadataEntity } from "../database/entity/metadata-entity";
import appContext from "../app-context";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import workflowDatabaseService from "../orchestrator/services/workflow-database-service";
import jobService from "./job-service";
import { IJobService } from "./interface/job-service-interface";
import { CreateJobDTO } from "../model/job-dto";
import { JobStatus, JobType, TDEIDataType } from "../model/jobs-get-query-params";
import tdeiCoreService from "./tdei-core-service";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import { IFlexService } from "./interface/flex-service-interface";

class FlexService implements IFlexService {
    constructor(public jobServiceInstance: IJobService, public tdeiCoreServiceInstance: ITdeiCoreService) { }
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
            let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);
            let metadata = await this.tdeiCoreServiceInstance.getMetadataDetailsById(tdei_dataset_id);

            if (!dataset.data_type && dataset.data_type !== TDEIDataType.flex)
                throw new InputException(`${tdei_dataset_id} is not a flex dataset.`);

            if (dataset.status === 'Publish')
                throw new InputException(`${tdei_dataset_id} already publised.`);

            // Check if there is a record with the same date
            const queryResult = await dbClient.query(metadata.getOverlapQuery(TDEIDataType.flex, dataset.tdei_project_group_id, dataset.tdei_service_id));
            if (queryResult.rowCount && queryResult.rowCount > 0) {
                const recordId = queryResult.rows[0]["tdei_dataset_id"];
                throw new OverlapException(recordId);
            }

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.flex,
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
            let workflow_identifier = "FLEX_PUBLISH_VALIDATION_REQUEST_WORKFLOW";
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
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile.buffer), "gtfsflex");

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.flex,
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
            let workflow_identifier = "FLEX_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
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
            const service = await this.tdeiCoreServiceInstance.getServiceById(uploadRequestObject.tdei_service_id);
            if (!service) {
                // Service not found exception.
                throw new ServiceNotFoundException(uploadRequestObject.tdei_service_id);
            }
            else if (service!.owner_project_group != uploadRequestObject.tdei_project_group_id) {
                throw new InputException(`${uploadRequestObject.tdei_project_group_id} id not associated with the tdei_service_id`);
            }

            //Validate metadata
            const metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const metaObj = DatasetUploadMetadata.from(metadata);
            let validation_errors = await this.tdeiCoreServiceInstance.validateObject(metaObj);
            if (!["v2.0"].includes(metaObj.schema_version))
                validation_errors = validation_errors + " " + "Schema version is not supported. Please use v2.0 schema version."
            if (validation_errors) {
                throw new InputException(`Metadata validation failed with below reasons : \n${validation_errors}`);
            }

            // write schema checking here.

            //Check for unique name and version combination
            if (await this.tdeiCoreServiceInstance.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
                throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            // Generate unique UUID for the upload request 
            const uid = storageService.generateRandomUUID();

            //Upload the files to the storage
            const storageFolderPath = storageService.getFolderPath(uploadRequestObject.tdei_project_group_id, uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, uploadRequestObject.datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(uploadRequestObject.datasetFile[0].buffer), "gtfsflex")
            // Upload the metadata file  
            const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
            const metadataUploadUrl = await storageService.uploadFile(metadataStorageFilePath, 'text/json', Readable.from(uploadRequestObject.metadataFile[0].buffer), "gtfsflex");
            // Upload the changeset file  
            let changesetUploadUrl = "";
            if (uploadRequestObject.changesetFile) {
                const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.txt');
                changesetUploadUrl = await storageService.uploadFile(changesetStorageFilePath, 'text/plain', Readable.from(uploadRequestObject.changesetFile[0].buffer), "gtfsflex");
            }

            // Insert dataset version into database
            const datasetEntity = new DatasetEntity();
            datasetEntity.tdei_dataset_id = uid;
            datasetEntity.data_type = TDEIDataType.flex;
            datasetEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            datasetEntity.tdei_project_group_id = uploadRequestObject.tdei_project_group_id;
            datasetEntity.derived_from_dataset_id = uploadRequestObject.derived_from_dataset_id;
            datasetEntity.changeset_url = changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "";
            datasetEntity.metadata_url = decodeURIComponent(metadataUploadUrl);
            datasetEntity.dataset_url = decodeURIComponent(datasetUploadUrl);
            datasetEntity.uploaded_by = uploadRequestObject.user_id;
            datasetEntity.updated_by = uploadRequestObject.user_id;
            await this.tdeiCoreServiceInstance.createDataset(datasetEntity);

            // Insert metadata into database
            const metadataEntity = MetadataEntity.from(metadata);
            metadataEntity.tdei_dataset_id = uid;
            metadataEntity.schema_version = metadata.schema_version;
            await this.tdeiCoreServiceInstance.createMetadata(metadataEntity);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.flex,
                job_type: JobType["Dataset-Upload"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_service_id: uploadRequestObject.tdei_service_id,
                    dataset_name: metadataEntity.name,
                    dataset_version: metadataEntity.version,
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
            let workflow_identifier = "FLEX_UPLOAD_VALIDATION_REQUEST_WORKFLOW";
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
     * @param tdei_dataset_id - The ID of the OswStream.
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the OswStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    async getFlexStreamById(tdei_dataset_id: string): Promise<FileEntity[]> {
        let fileEntities: FileEntity[] = [];
        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

        if (dataset.data_type && dataset.data_type !== TDEIDataType.flex)
            throw new InputException(`${tdei_dataset_id} is not a flex dataset.`);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.metadata_url)));
        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.dataset_url)));
        if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null)
            fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.changeset_url)));

        return fileEntities;
    }
}

const flexService: IFlexService = new FlexService(jobService, tdeiCoreService);
export default flexService;

