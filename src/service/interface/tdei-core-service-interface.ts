import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { DatasetEntity } from "../../database/entity/dataset-entity";
import { ServiceEntity } from "../../database/entity/service-entity";
import { DatasetDTO } from "../../model/dataset-dto";
import { DatasetQueryParams } from "../../model/dataset-get-query-params";
import { ConfidenceJobResponse } from "../../model/job-request-response/osw-confidence-job-response";
import { TDEIDataType } from "../../model/jobs-get-query-params";
import { MetadataModel } from "../../model/metadata.model";
import { IDatasetCloneRequest } from "../../model/request-interfaces";

export interface ITdeiCoreService {
  /**
* Fetches the data metrics
*/
  getDataMetrics(): Promise<any>;
  /**
   * Fetches the system metrics
   */
  getSystemMetrics(): Promise<any>;
  /**
   * Clones a dataset.
   * 
   * @param datasetCloneRequestObject - The dataset clone request object.
   * @returns A Promise that resolves to a boolean indicating whether the dataset was cloned successfully.
   */
  cloneDataset(datasetCloneRequestObject: IDatasetCloneRequest): Promise<{ new_tdei_dataset_id: string, job_id: string }>;
  /**
   * Edits the metadata of a TDEI dataset.
   * 
   * @param tdei_dataset_id - The ID of the TDEI dataset.
   * @param metadataFile - The metadata file to be edited.
   * @param user_id - The ID of the user performing the edit.
   * @param data_type - The type of TDEI data.
   * @returns A Promise that resolves when the metadata is successfully edited.
   */
  editMetadata(tdei_dataset_id: string, metadataFile: any, user_id: string, data_type: TDEIDataType): Promise<string>;
  /**
     * Validates the metadata for a given data type.
     * 
     * @param metadata - The metadata to be validated.
     * @param data_type - The type of data being validated.
     * @param tdei_dataset_id - The ID of the TDEI dataset. This is optional and is used to exclude the current dataset from the validation.
     * @returns A Promise that resolves to a boolean indicating whether the metadata is valid.
     * @throws {InputException} If the metadata is invalid or if the data type is not supported.
     */
  validateMetadata(metadata: MetadataModel, data_type: TDEIDataType): Promise<boolean>;
  /**
       * Deletes a draft dataset with the specified ID from the content.dataset table.
       * 
       * @param tdei_dataset_id - The ID of the draft dataset to delete.
       * @returns A Promise that resolves to void.
       */
  deleteDraftDataset(tdei_dataset_id: string): Promise<void>;
  /**
   * Updates the confidence metric for a given TDEI dataset.
   * 
   * @param tdei_dataset_id - The ID of the TDEI dataset.
   * @param info - The confidence job response containing the updated confidence level and library version.
   * @returns A Promise that resolves with void when the update is successful, or rejects with an error if there's an issue.
   */
  updateConfidenceMetric(tdei_dataset_id: string, info: ConfidenceJobResponse): Promise<void>;

  /**
   * Retrieves datasets based on the provided user ID and query parameters.
   * @param user_id The ID of the user.
   * @param params The query parameters for filtering datasets.
   * @returns A promise that resolves to an array of DatasetDTO objects.
   */
  getDatasets(user_id: string, params: DatasetQueryParams): Promise<DatasetDTO[]>;

  /**
   * Retrieves a FileEntity from the specified URL.
   * @param fullUrl The full URL of the file.
   * @returns A Promise that resolves to the FileEntity.
   */
  getFileEntity(fullUrl: string): Promise<FileEntity>;

  /**
   * Creates a dataset.
   * 
   * @param datasetObj - The dataset object to be created.
   * @returns A promise that resolves to the created dataset DTO.
   * @throws {DuplicateException} If a duplicate dataset is detected.
   * @throws {Error} If an error occurs while saving the dataset version.
   */
  createDataset(datasetObj: DatasetEntity): Promise<DatasetDTO>;

  /**
   * Checks if the name and version are unique.
   * @param name - The name of the metadata.
   * @param version - The version of the metadata.
   * @returns A promise that resolves to a boolean indicating whether the name and version are unique.
   */
  checkMetaNameAndVersionUnique(name: string, version: string): Promise<Boolean>;

  /**
  * Validates the metadata object.
  * @param metadataObj - The metadata object to be validated.
  * @returns A promise that resolves to a string containing validation error messages, or undefined if there are no errors.
  */
  validateObject<T>(classObject: T): Promise<string | undefined>;

  /**
* Retrieves a service by its ID.
* @param service_id The ID of the service to retrieve.
* @returns A Promise that resolves to the ServiceEntity if found, or undefined if not found.
*/
  getServiceById(service_id: string): Promise<ServiceEntity | undefined>;

  /**
  * Invalidates a record request.
  * 
  * @param user_id - The user ID.
  * @param tdei_dataset_id - The TDEI dataset ID.
  * @returns A promise that resolves to a boolean indicating whether the record request was invalidated successfully.
  * @throws {InputException} If the record request is not found.
  * @throws {Error} If there is an error invalidating the record request.
  */
  invalidateRecordRequest(user_id: any, tdei_dataset_id: string): Promise<boolean>;

  /**
   * Retrieves dataset details by ID.
   * @param id - The ID of the dataset.
   * @returns A promise that resolves to a DatasetEntity object representing the dataset details.
   * @throws HttpException with status 404 if the record is not found.
   * @throws HttpException with status 400 if the request record is invalid or deleted.
   */
  getDatasetDetailsById(id: string): Promise<DatasetEntity>;
}