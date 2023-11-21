import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { OswVersions } from "../../database/entity/osw-version-entity";
import { OswDTO } from "../../model/osw-dto";
import { OswQueryParams } from "../../model/osw-get-query-params";
import { OswConfidenceJob } from "../../database/entity/osw-confidence-job-entity";
import { OSWConfidenceResponse } from "../../model/osw-confidence-response";

export interface IOswService {
    /**
     * Gets the OSW details
     * @param params Query params
     */
    getAllOsw(params: OswQueryParams): Promise<OswDTO[]>;
    /**
    * 
    * @param id Record Id of the OSW file to be downloaded
    * @param format file format to download
    */
    getOswById(id: string, format: string): Promise<FileEntity>;
    /**
    * Creates new OSW in the TDEI system.
    * @param oswInfo OSW object 
    */
    createOsw(oswInfo: OswVersions): Promise<OswDTO>;

    /**
     * Fetches the Record of OSW from the database
     * @param id  tdeiRecordId
     */
    getOSWRecordById(id: string): Promise<OswDTO>;

    /**
     * Creates a confidence job and returns data
     * @param info Confidence job information
     */
    createOSWConfidenceJob(info: OswConfidenceJob): Promise<string>;

    /**
     * Get the OSWConfidenceJOb based on jobId
     * @param jobId 
     */
    getOSWConfidenceJob(jobId: string) : Promise<OswConfidenceJob>;

    /**
     * Updates the score for a confidence metric job
     * @param info 
     */
    updateConfidenceMetric(info: OSWConfidenceResponse): Promise<string>
    /**
    * Updated the existing OSW in the TDEI system.
    * @param oswInfo OSW object 
    */
    updateOsw(oswInfo: OswVersions): Promise<OswDTO>;
}