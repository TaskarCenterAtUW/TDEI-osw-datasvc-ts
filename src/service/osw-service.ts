import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { IUploadRequest } from "./interface/upload-request-interface";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import appContext from "../app-context";
import { IOswService } from "./interface/osw-service-interface";
import { BboxServiceRequest, TagRoadServiceRequest } from "../model/backend-request-interface";
import jobService from "./job-service";
import { IJobService } from "./interface/job-service-interface";
import { CreateJobDTO } from "../model/job-dto";
import { JobStatus, JobType, TDEIDataType } from "../model/jobs-get-query-params";
import tdeiCoreService from "./tdei-core-service";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import { RecordStatus } from "../model/dataset-get-query-params";
import { MetadataModel } from "../model/metadata.model";
import { TdeiDate } from "../utility/tdei-date";
import { WorkflowName } from "../constants/app-constants";
import { SpatialJoinRequest } from "../model/request-interfaces";

class OswService implements IOswService {
    constructor(public jobServiceInstance: IJobService, public tdeiCoreServiceInstance: ITdeiCoreService) { }

    /**
    * Processes a spatial join request.
    * 
    * @param user_id - The ID of the user making the request.
    * @param requestService - The spatial join request.
    * @returns The result of the spatial join request.
    */
    async processSpatialQueryRequest(user_id: string, requestService: SpatialJoinRequest): Promise<string> {
        try {
            const sourceDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.source_dataset_id);
            const targetDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.target_dataset_id);

            if (sourceDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.source_dataset_id} is not a osw dataset.`);
            if (targetDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.target_dataset_id} is not a osw dataset.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Queries"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    source_dataset_id: requestService.source_dataset_id,
                    source_dimension: requestService.source_dimension,
                    target_dataset_id: requestService.target_dataset_id,
                    target_dimension: requestService.target_dimension,
                    join_condition: requestService.join_condition,
                    filter_target: requestService.join_filter_target,
                    filter_source: requestService.join_filter_source,
                    aggregate: requestService.aggregate
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            let workflow_start = WorkflowName.osw_spatial_join;
            let workflow_input = {
                job_id: job_id.toString(),
                service: "spatial_join",
                parameters: requestService,
                user_id: user_id
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return job_id.toString();
        }
        catch (error) {
            throw error;
        }
    }
    /**
    * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
    * @param backendRequest The backend request to process.
    * @returns A Promise that resolves to a string representing the job ID.
    * @throws Throws an error if an error occurs during processing.
    */
    async processDatasetTagRoadRequest(backendRequest: TagRoadServiceRequest): Promise<string> {
        try {

            //Only if backendRequest.parameters.target_dataset_id id in pre-release status
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.target_dataset_id);
            if (dataset.status !== RecordStatus["Pre-Release"])
                throw new InputException(`Dataset ${backendRequest.parameters.target_dataset_id} is not in Pre-Release state.Dataset road tagging request allowed in Pre-Release state only.`);

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
            // let workflow_identifier = "DATA_QUERY_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         service: backendRequest.service,
            //         user_id: backendRequest.user_id,
            //         parameters: backendRequest.parameters
            //     }
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.osw_dataset_road_tag;
            let workflow_input = {
                job_id: job_id.toString(),
                service: backendRequest.service,
                user_id: backendRequest.user_id,
                parameters: backendRequest.parameters,
                tdei_dataset_id: backendRequest.parameters.target_dataset_id,
                metadata_url: dataset.metadata_url,
                dataset_url: dataset.latest_dataset_url,
                changeset_url: dataset.changeset_url,
                tdei_project_group_id: dataset.tdei_project_group_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, backendRequest.user_id);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

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
            // let workflow_identifier = "OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW";
            // const oswFormatRequest = OswFormatJobRequest.from({
            //     jobId: job_id.toString(),
            //     source: source,
            //     target: target,
            //     sourceUrl: source_url
            // });

            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: oswFormatRequest
            // });
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            let workflow_start = WorkflowName.osw_formatting_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                source: source,
                target: target,
                sourceUrl: decodeURIComponent(source_url)
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


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
     * @param sub_regions_file - The sub-regions file to be used for calculating the confidence.
     * @param user_id - The ID of the user.
     * @returns A Promise that resolves to the ID of the created job.
     * @throws If there is an error calculating the confidence.
     */
    async calculateConfidence(tdei_dataset_id: string, sub_regions_file: Express.Multer.File | undefined, user_id: string): Promise<string> {
        // Check and get the record for the same in the database
        try {
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (!dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);
            // Create a job in the database for the same.
            let sub_regions_upload_url = undefined;
            if (sub_regions_file) {
                // Get the upload path
                const uid = storageService.generateRandomUUID();
                const folderPath = storageService.getConfidenceJobPath(uid);
                const uploadPath = path.join(folderPath, sub_regions_file!.originalname)
                sub_regions_upload_url = await storageService.uploadFile(uploadPath, 'application/json', Readable.from(sub_regions_file.buffer));
            }
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
                tdei_project_group_id: dataset.tdei_project_group_id,
                user_id: user_id,
            });

            // Add the sub regions file to the request input.
            if (sub_regions_upload_url) {
                job.request_input['file_upload_name'] = sub_regions_file!.originalname;
            }

            const job_id = await this.jobServiceInstance.createJob(job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            // const confidenceRequestMsg = new OSWConfidenceJobRequest();
            // confidenceRequestMsg.jobId = job_id.toString();
            // confidenceRequestMsg.data_file = dataset.dataset_url;
            // //TODO: Once this is done, get the things moved.
            // confidenceRequestMsg.meta_file = dataset.metadata_url;
            // if (sub_regions_upload_url)
            //     confidenceRequestMsg.sub_regions_file = sub_regions_upload_url;
            // confidenceRequestMsg.trigger_type = 'manual';

            // //Compose the meessage
            // let workflow_identifier = "OSW_ON_DEMAND_CONFIDENCE_METRIC_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: confidenceRequestMsg
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            let workflow_start = WorkflowName.osw_confidence_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: dataset.latest_dataset_url,
                metadata_url: dataset.metadata_url,
                sub_regions_file: sub_regions_upload_url ? decodeURIComponent(sub_regions_upload_url) : ""
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


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
            let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (!dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);

            if (dataset.status === RecordStatus.Publish)
                throw new InputException(`${tdei_dataset_id} already publised.`);

            if (dataset.status !== RecordStatus["Pre-Release"])
                throw new InputException(`${tdei_dataset_id} is not in Pre-Release state.`);

            // Check if there is a record with the same date
            const queryResult = await dbClient.query(dataset.getOverlapQuery(TDEIDataType.osw, dataset.tdei_project_group_id, dataset.tdei_service_id));
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
            // let workflow_identifier = "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW";
            // const confidenceRequestMsg = new OSWConfidenceJobRequest();
            // confidenceRequestMsg.jobId = job_id.toString();
            // confidenceRequestMsg.data_file = dataset.dataset_url;
            // confidenceRequestMsg.meta_file = dataset.metadata_url;
            // confidenceRequestMsg.trigger_type = 'release';

            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: confidenceRequestMsg
            // });

            // //Delete exisitng workflow if exists
            // let trigger_workflow = appContext.orchestratorServiceInstance!.getWorkflowByIdentifier(workflow_identifier);
            // workflowDatabaseService.obseleteAnyExistingWorkflowHistory(job_id.toString(), trigger_workflow?.group!);
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            //Compose the meessage
            let workflow_start = WorkflowName.osw_publish;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: decodeURIComponent(dataset.latest_dataset_url),
                metadata_url: decodeURIComponent(dataset.metadata_url),
                tdei_dataset_id: tdei_dataset_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


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
    // async processDatasetFlatteningRequest(user_id: string, tdei_dataset_id: string, override: boolean): Promise<string> {
    //     try {
    //         let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

    //         if (!dataset.data_type && dataset.data_type !== TDEIDataType.osw)
    //             throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);

    //         if (dataset.status === 'Publish')
    //             throw new InputException(`Request is prohibited while the record is in the Publish state.`);

    //         if (!override) {
    //             const checkRecordsQueryObject = {
    //                 text: `SELECT id  
    //                 from content.edge 
    //                 WHERE 
    //                 tdei_dataset_id = $1 LIMIT 1`.replace(/\n/g, ""),
    //                 values: [tdei_dataset_id]
    //             };

    //             // Check if there is a record with the same date
    //             const queryResult = await dbClient.query(checkRecordsQueryObject);
    //             if (queryResult.rowCount && queryResult.rowCount > 0) {
    //                 throw new InputException(`${tdei_dataset_id} already flattened. If you want to override, please use the override flag.`);
    //             }
    //         }
    //         else {
    //             //Delete the existing records
    //             const deleteRecordsQueryObject = {
    //                 text: `SELECT delete_dataset_records_by_id($1)`.replace(/\n/g, ""),
    //                 values: [tdei_dataset_id]
    //             };
    //             await dbClient.query(deleteRecordsQueryObject);
    //         }

    //         let job = CreateJobDTO.from({
    //             data_type: TDEIDataType.osw,
    //             job_type: JobType["Dataset-Flatten"],
    //             status: JobStatus["IN-PROGRESS"],
    //             message: 'Job started',
    //             request_input: {
    //                 tdei_dataset_id: tdei_dataset_id
    //             },
    //             tdei_project_group_id: dataset.tdei_project_group_id,
    //             user_id: user_id,
    //         });

    //         const job_id = await this.jobServiceInstance.createJob(job);

    //         //Compose the meessage
    //         let workflow_identifier = "ON_DEMAND_DATASET_FLATTENING_REQUEST_WORKFLOW";
    //         let queueMessage = QueueMessage.from({
    //             messageId: job_id.toString(),
    //             messageType: workflow_identifier,
    //             data: {
    //                 data_type: "osw",
    //                 file_upload_path: dataset.dataset_url,
    //                 tdei_dataset_id: tdei_dataset_id
    //             }
    //         });

    //         //Trigger the workflow
    //         await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

    //         return Promise.resolve(job_id.toString());
    //     } catch (error) {
    //         return Promise.reject(error);
    //     }
    // }

    /**
     * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
     * @param backendRequest The backend request to process.
     * @param file_type Output file type.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    async processBackendRequest(backendRequest: BboxServiceRequest, file_type: string): Promise<string> {
        try {
            let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.tdei_dataset_id);
            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Queries"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters,
                    file_type: file_type
                },
                tdei_project_group_id: '',
                user_id: backendRequest.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            // //Compose the meessage
            // let workflow_identifier = "DATA_QUERY_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         service: backendRequest.service,
            //         user_id: backendRequest.user_id,
            //         parameters: backendRequest.parameters
            //     }
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = "";
            let workflow_input = {};

            if (file_type == 'osm') {
                workflow_start = WorkflowName.osm_dataset_bbox;
                workflow_input = {
                    job_id: job_id.toString(),
                    service: backendRequest.service,
                    parameters: backendRequest.parameters,
                    user_id: backendRequest.user_id,// Required field for message authorization
                    tdei_project_group_id: dataset.tdei_project_group_id
                };
            } else if (file_type == 'osw') {
                workflow_start = WorkflowName.osw_dataset_bbox;
                workflow_input = {
                    job_id: job_id.toString(),
                    service: backendRequest.service,
                    parameters: backendRequest.parameters,
                    user_id: backendRequest.user_id// Required field for message authorization
                };
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, backendRequest.user_id);

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
            // let workflow_identifier = "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
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
            let workflow_start = WorkflowName.osw_validation_only;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: decodeURIComponent(datasetUploadUrl),
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
        let uid = "";
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
            let metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const metaObj = MetadataModel.from(metadata);
            await this.tdeiCoreServiceInstance.validateMetadata(metaObj, TDEIDataType.osw);


            // //Check for unique name and version combination
            // if (await this.tdeiCoreServiceInstance.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
            //     throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            // Generate unique UUID for the upload request 
            uid = storageService.generateRandomUUID();

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
            const datasetEntity = new DatasetEntity();
            datasetEntity.tdei_dataset_id = uid;
            datasetEntity.data_type = TDEIDataType.osw;
            datasetEntity.status = RecordStatus.Draft;
            datasetEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            datasetEntity.tdei_project_group_id = uploadRequestObject.tdei_project_group_id;
            datasetEntity.derived_from_dataset_id = uploadRequestObject.derived_from_dataset_id;
            datasetEntity.changeset_url = changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "";
            datasetEntity.metadata_url = decodeURIComponent(metadataUploadUrl);
            datasetEntity.dataset_url = decodeURIComponent(datasetUploadUrl);
            datasetEntity.uploaded_by = uploadRequestObject.user_id;
            datasetEntity.updated_by = uploadRequestObject.user_id;
            //flatten the metadata to level 1
            metadata = MetadataModel.flatten(metadata);
            metadata.collection_date = TdeiDate.UTC(metadata.collection_date);
            metadata.valid_from = TdeiDate.UTC(metadata.valid_from);
            metadata.valid_to = TdeiDate.UTC(metadata.valid_to);
            //Add metadata to the entity
            datasetEntity.metadata_json = metadata;
            await this.tdeiCoreServiceInstance.createDataset(datasetEntity);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
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
            let workflow_start = WorkflowName.osw_upload;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: uploadRequestObject.user_id,// Required field for message authorization
                tdei_project_group_id: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
                dataset_url: decodeURIComponent(datasetUploadUrl),
                metadata_url: decodeURIComponent(metadataUploadUrl),
                changeset_url: changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "",
                tdei_dataset_id: uid,
                latest_dataset_url: decodeURIComponent(datasetUploadUrl)
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, uploadRequestObject.user_id);

            //Return the tdei_dataset_id
            return Promise.resolve(job_id.toString());
        } catch (error) {
            await this.tdeiCoreServiceInstance.deleteDraftDataset(uid);
            throw error;
        }
    }

    /**
     * Retrieves the OswStream by its ID.
     * @param tdei_dataset_id - The ID of the OswStream.
     * @param format - The format of the OswStream (default is "osw").
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the OswStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    async getOswStreamById(tdei_dataset_id: string, format: string = "osw", file_version: string = "latest"): Promise<FileEntity[]> {
        let fileEntities: FileEntity[] = [];

        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

        if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        var url: string = '';
        if (format == "osm") {
            //if file_version is latest, get the latest version of the file
            if (file_version == "latest") {
                if (dataset.latest_osm_url && dataset.latest_osm_url != '')
                    url = decodeURIComponent(dataset.latest_osm_url);
                else
                    throw new HttpException(404, "Requested OSM file format not found");
            }
            else {
                //original file
                if (dataset.osm_url && dataset.osm_url != '')
                    url = decodeURIComponent(dataset.osm_url);
                else
                    throw new HttpException(404, "Requested OSM file format not found");
            }

        } else if (format == "osw") {
            if (file_version == "latest") {
                url = decodeURIComponent(dataset.latest_dataset_url);
            }
            else {
                //original file
                url = decodeURIComponent(dataset.dataset_url);
            }
        }
        else {
            //default osw
            url = decodeURIComponent(dataset.dataset_url);
        }

        fileEntities.push(await storageClient.getFileFromUrl(url));
        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.metadata_url)));
        if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null)
            fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.changeset_url)));

        return fileEntities;
    }

    async getDownloadableOSWUrl(id: string, format: string = "osw", file_version: string = "latest"): Promise<string> {

        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(id);
        if (file_version != "latest") {
            throw new InputException("Only latest version of the file can be downloaded");
        }
        if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${id} is not a osw dataset.`);
        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");
        let dataset_db_url = '';
        if (format == "osm") {
            if (dataset.dataset_osm_download_url && dataset.dataset_osm_download_url != '') {
                dataset_db_url = decodeURIComponent(dataset.dataset_osm_download_url);
            }
            else
                throw new HttpException(404, "Requested OSM file format not found");
        } else {
            if (dataset.dataset_download_url && dataset.dataset_download_url != '') {
                dataset_db_url = decodeURIComponent(dataset.dataset_download_url);
            }
            else
                throw new HttpException(404, "Requested OSW file format not found");
        }
        let dlUrl = new URL(dataset_db_url);
        let relative_path = dlUrl.pathname;
        let container = relative_path.split('/')[1];
        let file_path_in_container = relative_path.split('/').slice(2).join('/');
        let sasUrl = storageClient.getSASUrl(container, file_path_in_container, 12); // 12 hours expiry
        return sasUrl;


    }

    async calculateQualityMetric(tdei_dataset_id: string, algorithms: string[], persist: any, user_id: string): Promise<string> {
        try {
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);
            if (!dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);
            // Check the input algorithm types
            if (algorithms.length == 0) {
                throw new InputException("No quality metric algorithms provided");
            }
            // Create job for this
            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Quality-Metric"], // Change this
                status: JobStatus["IN-PROGRESS"],
                request_input: {
                    tdei_dataset_id: tdei_dataset_id,
                    algorithms: algorithms,
                    persist: persist
                },
                tdei_project_group_id: dataset.tdei_project_group_id,
                user_id: user_id
            })
            const job_id = await this.jobServiceInstance.createJob(job);

            // Start the workflow for this
            let workflow_start = WorkflowName.osw_quality_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,
                file_url: dataset.latest_dataset_url,
                algorithms: algorithms,
                persist: persist
            };

            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return Promise.resolve(job_id.toString());

        } catch (error) {
            console.log('Error calculating quality metric ', error);
            return Promise.reject(error);
        }
    }
}

const oswService: IOswService = new OswService(jobService, tdeiCoreService);
export default oswService;

