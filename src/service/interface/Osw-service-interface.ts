import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { OswDTO } from "../../model/osw-dto";
import { OswQueryParams } from "../../model/osw-get-query-params";
import { OswConfidenceJob } from "../../database/entity/osw-confidence-job-entity";
import { OSWConfidenceResponse } from "../../model/osw-confidence-response";
import { OswFormatJob } from "../../database/entity/osw-format-job-entity";
import { OswFormatJobResponse } from "../../model/osw-format-job-response";
import { IUploadRequest } from "./upload-request-interface";
import { OswVersions } from "../../database/entity/osw-version-entity";

export interface IOswService {
    /**
     * On-demand format request
     * @param source 
     * @param target 
     * @param uploadedFile 
     * @param user_id 
     */
    processFormatRequest(source: string, target: string, uploadedFile: Express.Multer.File, user_id: any): Promise<string>;
    /**
     * Calculates on-demand confidence matrics for given tdei_record_id
     */
    calculateConfidence(tdeiRecordId: string, user_id: string): Promise<string>;
    /**
     * Creates the new version of osw file in the TDEI system
     * @param oswInfo 
     * @returns 
     */
    createOsw(oswInfo: OswVersions): Promise<OswDTO>;

    /**
     * Gets the OSW details
     * @param params Query params
     */
    getAllOsw(user_id: string, params: OswQueryParams): Promise<OswDTO[]>;
    /**
    * 
    * @param id Record Id of the OSW file to be downloaded
    * @param format file format to download
    */
    getOswStreamById(id: string, format: string): Promise<FileEntity[]>;

    /**
     * Fetches the Record of OSW from the database
     * @param id  tdeiRecordId
     */
    getOSWRecordById(id: string): Promise<OswVersions>;

    /**
     * Creates a confidence job and returns data
     * @param info Confidence job information
     */
    createOSWConfidenceJob(info: OswConfidenceJob): Promise<string>;

    /**
     * Get the OSWConfidenceJOb based on jobId
     * @param jobId 
     */
    getOSWConfidenceJob(jobId: string): Promise<OswConfidenceJob>;

    /**
     * Updates the score for a confidence metric job
     * @param info 
     */
    updateConfidenceMetric(info: OSWConfidenceResponse): Promise<string>;

    /**
     * Creates the osw-format
     * @param info OSWFormat job requested
     */
    createOSWFormatJob(info: OswFormatJob): Promise<string>;

    /**
     * Updates the osw-format job
     * @param info Updates the OSWFormatJob with status and other parameters
     */
    updateOSWFormatJob(info: OswFormatJobResponse): Promise<void>;

    /**
     * Fetches the job Id for formatting
     * @param jobId jobId for formatting
     */
    getOSWFormatJob(jobId: string): Promise<OswFormatJob>;

    /**
     * Processes the upload request and returns the unique tdei_record_id to represent the request
     * @param uploadRequestObject 
     */
    processUploadRequest(uploadRequestObject: IUploadRequest): Promise<string>;

    /**
    * Publishes the osw record
    * @param tdei_record_id 
    */
    processPublishRequest(user_id: string, tdei_record_id: string): Promise<void>;

    /**
   * Processes the validation only request
   * @param tdei_record_id 
   */
    processValidationOnlyRequest(user_id: string, datasetFile: any): Promise<string>;
}