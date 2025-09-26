import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import { InputException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { IUploadRequest } from "./interface/upload-request-interface";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import appContext from "../app-context";
import jobService from "./job-service";
import { IJobService } from "./interface/job-service-interface";
import { CreateJobDTO } from "../model/job-dto";
import { JobStatus, JobType, TDEIDataType } from "../model/jobs-get-query-params";
import tdeiCoreService from "./tdei-core-service";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import { IPathwaysService } from "./interface/pathways-service-interface";
import { MetadataModel } from "../model/metadata.model";
import { TdeiDate } from "../utility/tdei-date";
import { WorkflowName } from "../constants/app-constants";
import { Utility } from "../utility/utility";
import AdmZip from "adm-zip";
import HttpException from "../exceptions/http/http-base-exception";
import { DownloadStatsEntity } from "../database/entity/download-stats";

class PathwaysService implements IPathwaysService {
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

            if (dataset.data_type && dataset.data_type !== TDEIDataType.pathways)
                throw new InputException(`${tdei_dataset_id} is not a pathways dataset.`);

            if (dataset.status === 'Publish')
                throw new InputException(`${tdei_dataset_id} already publised.`);

            // Check if there is a record with the same date
            // const queryResult = await dbClient.query(dataset.getOverlapQuery(TDEIDataType.pathways, dataset.tdei_project_group_id, dataset.tdei_service_id));
            // if (queryResult.rowCount && queryResult.rowCount > 0) {
            //     const recordId = queryResult.rows[0]["tdei_dataset_id"];
            //     throw new OverlapException(recordId);
            // }

            //Validate the metadata dates
            tdeiCoreService.validateDatasetDates(dataset);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.pathways,
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
            // let workflow_identifier = "PATHWAYS_PUBLISH_VALIDATION_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         user_id: user_id, // Required field for message authorization
            //         tdei_project_group_id: dataset.tdei_project_group_id,// Required field for message authorization
            //         file_upload_path: dataset.dataset_url
            //     }
            // });
            // //Delete exisitng workflow if exists
            // let trigger_workflow = appContext.orchestratorServiceInstance!.getWorkflowByIdentifier(workflow_identifier);
            // workflowDatabaseService.obseleteAnyExistingWorkflowHistory(tdei_dataset_id, trigger_workflow?.group!);
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.pathways_publish;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,
                tdei_project_group_id: dataset.tdei_project_group_id,
                dataset_url: dataset.latest_dataset_url,
                tdei_dataset_id: tdei_dataset_id,
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

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
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile.buffer), "gtfspathways")

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.pathways,
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
            // let workflow_identifier = "PATHWAYS_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         user_id: user_id, // Required field for message authorization
            //         file_upload_path: datasetUploadUrl
            //     }
            // });
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.pathways_validation_only;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,
                dataset_url: datasetUploadUrl,
                file_upload_name: datasetFile.originalname
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

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
                    throw new HttpException(404, "Derived dataset id not found");
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
            let metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const metaObj = MetadataModel.from(metadata);
            await this.tdeiCoreServiceInstance.validateMetadata(metaObj, TDEIDataType.pathways);


            // //Check for unique name and version combination
            // if (await this.tdeiCoreServiceInstance.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
            //     throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            // Generate unique UUID for the upload request 
            const uid = storageService.generateRandomUUID();

            //Upload the files to the storage
            const storageFolderPath = storageService.getFolderPath(uploadRequestObject.tdei_project_group_id, uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, uploadRequestObject.datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(uploadRequestObject.datasetFile[0].buffer), "gtfspathways")
            // Upload the metadata file  
            const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
            const metadataUploadUrl = await storageService.uploadFile(metadataStorageFilePath, 'text/json', Readable.from(uploadRequestObject.metadataFile[0].buffer), "gtfspathways");
            // Upload the changeset file  
            let changesetUploadUrl = "";
            if (uploadRequestObject.changesetFile) {
                let zipBuffer = uploadRequestObject.changesetFile[0].buffer;
                if (uploadRequestObject.changesetFile[0].originalname.endsWith('.osc')) {
                    const zip = new AdmZip();
                    zip.addFile(uploadRequestObject.changesetFile[0].originalname, uploadRequestObject.changesetFile[0].buffer);
                    zipBuffer = zip.toBuffer();
                }
                const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.zip');
                changesetUploadUrl = await storageService.uploadFile(changesetStorageFilePath, 'application/zip', Readable.from(zipBuffer), "gtfspathways");
            }

            // Insert dataset version into database
            const datasetEntity = new DatasetEntity();
            datasetEntity.tdei_dataset_id = uid;
            datasetEntity.data_type = TDEIDataType.pathways;
            datasetEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            datasetEntity.tdei_project_group_id = uploadRequestObject.tdei_project_group_id;
            datasetEntity.derived_from_dataset_id = uploadRequestObject.derived_from_dataset_id;
            datasetEntity.changeset_url = changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "";
            datasetEntity.metadata_url = decodeURIComponent(metadataUploadUrl);
            datasetEntity.dataset_url = decodeURIComponent(datasetUploadUrl);
            datasetEntity.uploaded_by = uploadRequestObject.user_id;
            datasetEntity.updated_by = uploadRequestObject.user_id;

            // Calculate total size of files inside the uploaded ZIP
            datasetEntity.upload_file_size_bytes = Utility.calculateTotalSize(uploadRequestObject.datasetFile)
            //flatten the metadata to level 1
            metadata = MetadataModel.flatten(metadata);
            metadata.collection_date = TdeiDate.UTC(metadata.collection_date);

            if (metadata.valid_from && metadata.valid_from.trim() != "")
                metadata.valid_from = TdeiDate.UTC(metadata.valid_from);
            else
                metadata.valid_from = null;

            if (metadata.valid_to && metadata.valid_to.trim() != "")
                metadata.valid_to = TdeiDate.UTC(metadata.valid_to);
            else
                metadata.valid_to = null;

            //Add metadata to the entity
            datasetEntity.metadata_json = metadata;
            await this.tdeiCoreServiceInstance.createDataset(datasetEntity);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.pathways,
                job_type: JobType["Dataset-Upload"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_service_id: uploadRequestObject.tdei_service_id,
                    dataset_name: metadata.name,
                    dataset_version: metadata.version,
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
            // let workflow_identifier = "PATHWAYS_UPLOAD_VALIDATION_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         user_id: uploadRequestObject.user_id,// Required field for message authorization
            //         tdei_project_group_id: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
            //         file_upload_path: datasetUploadUrl
            //     }
            // });
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.pathways_upload;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: uploadRequestObject.user_id,
                tdei_project_group_id: uploadRequestObject.tdei_project_group_id,
                dataset_url: decodeURIComponent(datasetUploadUrl),
                tdei_dataset_id: uid,
                metadata_url: decodeURIComponent(metadataUploadUrl),
                changeset_url: decodeURIComponent(changesetUploadUrl),
                dataset_file_upload_name: uploadRequestObject.datasetFile[0].originalname
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, uploadRequestObject.user_id);

            //Return the tdei_dataset_id
            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Retrieves the Pathways Stream by its ID.
     * @param tdei_dataset_id - The ID of the Pathways Stream.
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the Pathways Stream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    async getPathwaysStreamById(tdei_dataset_id: string): Promise<FileEntity[]> {
        let fileEntities: FileEntity[] = [];
        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

        if (dataset.data_type && dataset.data_type !== TDEIDataType.pathways)
            throw new InputException(`${tdei_dataset_id} is not a pathways dataset.`);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.metadata_url)));
        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.dataset_url)));
        if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null)
            fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.changeset_url)));

        return fileEntities;
    }

    async getPathwaysDownloadUrl(tdei_dataset_id: string, user_id: string): Promise<string> {
        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);
        if (dataset.data_type && dataset.data_type !== TDEIDataType.pathways)
            throw new InputException(`${tdei_dataset_id} is not a pathways dataset.`);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");
        const download_url = dataset.dataset_download_url;
        if (download_url == undefined || download_url == null || download_url == "") {
            throw new InputException(`${tdei_dataset_id} is not archived yet.`);
        }
        let dlUrl = new URL(download_url);
        let relative_path = dlUrl.pathname;
        let container = relative_path.split('/')[1];
        // let file_path = relative_path.split('/').
        let file_path_in_container = relative_path.split('/').slice(2).join('/');
        let sasUrl = storageClient.getSASUrl(container, file_path_in_container, 12); // 12 hours expiry

        const downloadStatsEntity = new DownloadStatsEntity();
        downloadStatsEntity.blob_url = download_url;
        downloadStatsEntity.file_size = dataset.upload_file_size_bytes || 0;
        downloadStatsEntity.tdei_dataset_id = dataset.tdei_dataset_id;
        downloadStatsEntity.data_type = TDEIDataType.pathways;
        downloadStatsEntity.requested_datetime = new Date().toISOString();
        downloadStatsEntity.user_id = user_id;
        await this.tdeiCoreServiceInstance.createDownloadStats(downloadStatsEntity);

        return sasUrl;
    }
}

const pathwaysService: IPathwaysService = new PathwaysService(jobService, tdeiCoreService);
export default pathwaysService;

