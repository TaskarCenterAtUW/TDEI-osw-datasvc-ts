import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { IUploadRequest } from "./upload-request-interface";
import { BboxServiceRequest, TagRoadServiceRequest, InclinationServiceRequest } from "../../model/backend-request-interface";
import { IJobService } from "./job-service-interface";
import { ITdeiCoreService } from "./tdei-core-service-interface";
import { SpatialJoinRequest, UnionRequest } from "../../model/request-interfaces";
import { FeedbackRequestDto, FeedbackResponseDTO } from "../../model/feedback-dto";
import { feedbackRequestParams } from "../../model/feedback-request-params";
import { FeedbackMetadataDTO } from "../../model/feedback-metadata-dto";
import { IProjectDataviewerConfig } from "./project-dataviewer-config-interface";

export interface IOswService {
    /*
           * Gets the project group dataviewer configuration.
           * @param tdei_project_id - The ID of the TDEI project.
           * @returns A Promise that resolves to the project dataviewer configuration or undefined if not configured.
           * @throws If the project group does not exist or if the dataviewer is not configured.
           */
    getProjectGroupDataviewerConfig(tdei_project_id: string): Promise<IProjectDataviewerConfig | undefined>;
    /**
     * Generates PMTiles for a given TDEI dataset ID.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param user_id - The ID of the user requesting the PMTiles generation.
     * @returns The generated Job id for PMTiles creation.
     */
    generatePMTiles(user_id: string, tdei_dataset_id: string): Promise<string>;

    /**
     * Get downloadable OSM PM tiles URL
     * @param id Dataset ID
     * @param user_id User ID
     * @returns Downloadable URL
     */
    getDownloadableOSWPmTilesUrl(id: string): Promise<string>;

    /**
     * Updates the visibility of a dataset.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param allow_viewer_access - A boolean indicating whether to allow viewer access.
     * @returns A Promise that resolves to an unknown type.
     */
    updateDatasetVisibility(tdei_dataset_id: string, allow_viewer_access: boolean): Promise<boolean>;

    /**
         * Gets feedbacks metadata.
         * @param user_id - The ID of the user making the request.
         * @param tdei_project_group_id - The ID of the TDEI project group.
         * @returns A Promise that resolves to an array of feedback DTOs.
         * @throws If there is an error retrieving the feedback metadata.
         * @throws If there is an error executing the query.
         */
    getFeedbacksMetadata(user_id: any, tdei_project_group_id?: string): Promise<FeedbackMetadataDTO>

    /**
     * Gets feedback requests.
     * @param user_id - The ID of the user making the request.
     * @param params - The feedback request parameters.
     * @returns A Promise that resolves to an array of feedback DTOs.
     */
    getFeedbacks(user_id: any, params: feedbackRequestParams): Promise<Array<FeedbackResponseDTO>>;
    /**
     * Adds a feedback request.
     * @param feedback - The feedback data transfer object.
     * @returns A Promise that resolves to the ID of the created feedback.
     */
    addFeedbackRequest(feedback: FeedbackRequestDto): Promise<string>;

    /**
     * Processes a union join request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param requestService - The union join request.
     * @returns The job_id of the union join request.
     */
    processUnionRequest(user_id: string, requestService: UnionRequest): Promise<string>;

    /**
     * Processes a dataset tagging request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param tagFile - The tag file to be uploaded.
     * @returns A Promise that resolves to the tag quality metric details.
     * @throws If there is an error processing the tagging request.
     */
    calculateTagQualityMetric(tdei_dataset_id: string, tagFile: any, user_id: string): Promise<any>;

    /**
     * Processes a spatial join request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param requestService - The spatial join request.
     * @returns The result of the spatial join request.
     */
    processSpatialQueryRequest(user_id: string, requestService: SpatialJoinRequest): Promise<string>;

    jobServiceInstance: IJobService;
    tdeiCoreServiceInstance: ITdeiCoreService;

    /**
     * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
     * @param backendRequest The backend request to process.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    processDatasetTagRoadRequest(backendRequest: TagRoadServiceRequest): Promise<string>;

    /**
     * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
     * @param backendRequest The backend request to process.
     * @param file_type Output file type.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    processBboxRequest(backendRequest: BboxServiceRequest, file_type: string): Promise<string>;
    /**
    * Processes a dataset flattening request.
    * 
    * @param user_id - The ID of the user making the request.
    * @param tdei_dataset_id - The ID of the TDEI dataset.
    * @param override - A boolean indicating whether to override existing records.
    * @returns A Promise that resolves to a string representing the job ID.
    * @throws {InputException} If the request is prohibited while the record is in the Publish state or if the dataset is already flattened without the override flag.
    */
    // processDatasetFlatteningRequest(user_id: string, tdei_dataset_id: string, override: boolean): Promise<string>;
    /**
     * Processes a format request by uploading a file, creating a job, triggering a workflow, and returning the job ID.
     * @param source The source format of the file.
     * @param target The target format to convert the file to.
     * @param uploadedFile The file to be uploaded.
     * @param user_id The ID of the user making the request.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during the process.
     */
    processFormatRequest(source: string, target: string, uploadedFile: Express.Multer.File, user_id: string): Promise<string>;
    /**
     * Calculates the confidence for a given TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param sub_regions_file - The sub-regions file to be used for calculating the confidence.
     * @param user_id - The ID of the user.
     * @returns A Promise that resolves to the ID of the created job.
     * @throws If there is an error calculating the confidence.
     */
    calculateConfidence(tdei_dataset_id: string, sub_regions_file: Express.Multer.File | undefined, user_id: string): Promise<string>;



    /**
     * Calculates the quality metric for a given TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param algorithm - The algorithm to use for calculating the quality metric.
     * @param sub_regions_file - (Optional) The sub-regions file to be used for calculating the quality metric.
     * @returns A Promise that resolves to the ID of the created job.
     * @throws If there is an error calculating the quality metric.
     */
    calculateQualityMetric(tdei_dataset_id: string, algorithm: string, sub_regions_file: any, user_id: string): Promise<string>;

    /**
     * Retrieves the OswStream by its ID.
     * @param id - The ID of the OswStream.
     * @param format - The format of the OswStream (default is "osw").
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the OswStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    getOswStreamById(id: string, format: string, file_version: string): Promise<FileEntity[]>;

    /**
     * Retrieves the downloadable URL for an OSW Dataset.
     * @param id - The ID of the OSW Dataset.
     * @param user_id - The ID of the user.
     * @param format - The format of the OSW Dataset (default is "osw").
     * @returns A promise that resolves to the downloadable URL.
     * @throws HttpException if the OSW Dataset is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    getDownloadableOSWUrl(id: string, user_id: string, format: string, file_version: string): Promise<string>;

    /**
    * Processes the upload request and performs various validations and operations.
    * 
    * @param uploadRequestObject - The upload request object containing the necessary information.
    * @returns A promise that resolves to the generated unique dataset ID.
    * @throws {InputException} If any validation fails or required data is missing.
    * @throws {ServiceNotFoundException} If the service associated with the request is not found.
    * @throws {Error} If any other error occurs during the process.
    */
    processUploadRequest(uploadRequestObject: IUploadRequest): Promise<string>;

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
    processPublishRequest(user_id: string, tdei_dataset_id: string): Promise<string>;

    /**
     * Processes a validation-only request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param datasetFile - The dataset file to be uploaded and processed.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    processValidationOnlyRequest(user_id: string, datasetFile: any): Promise<string>;


    /**
     * Calculates inclination for a given TDEI dataset.
     * 
     * @param backendRequest The backend request to process.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    calculateInclination(backendRequest: InclinationServiceRequest): Promise<string>;
}
