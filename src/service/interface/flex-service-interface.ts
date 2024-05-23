import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { IUploadRequest } from "./upload-request-interface";
import { IJobService } from "./job-service-interface";
import { ITdeiCoreService } from "./tdei-core-service-interface";

export interface IFlexService {
    jobServiceInstance: IJobService;
    tdeiCoreServiceInstance: ITdeiCoreService;

    /**
     * Retrieves the fle Stream by its Dataset Id.
     * @param id - The ID of the Dataset.
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the FlexStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    getFlexStreamById(id: string): Promise<FileEntity[]>;

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

    processZipRequest(tdei_dataset_id:string): Promise<String>;
}
