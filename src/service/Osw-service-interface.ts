import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { OswVersions } from "../database/entity/osw-version-entity";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";

export interface IOswService {
    getAllOsw(params: OswQueryParams): Promise<OswDTO[]>;
    getOswById(id: string): Promise<FileEntity>;
    createOsw(oswInfo: OswVersions): Promise<OswDTO>;
}