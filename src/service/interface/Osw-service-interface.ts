import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { OswVersions } from "../../database/entity/osw-version-entity";
import { OswDTO } from "../../model/osw-dto";
import { OswQueryParams } from "../../model/osw-get-query-params";

export interface IOswService {
    /**
     * Gets the OSW details
     * @param params Query params
     */
    getAllOsw(params: OswQueryParams): Promise<OswDTO[]>;
    /**
    * 
    * @param id Record Id of the OSW file to be downloaded
    */
    getOswById(id: string): Promise<FileEntity>;
    /**
    * Creates new OSW in the TDEI system.
    * @param pathwayInfo OSW object 
    */
    createOsw(oswInfo: OswVersions): Promise<OswDTO>;
}