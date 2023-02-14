import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException } from "../exceptions/http/http-exceptions";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";
import { PolygonDto } from "../model/polygon-model";
import { IOswService } from "./interface/Osw-service-interface";

class OswService implements IOswService {
    constructor() {
    }

    async getAllOsw(params: OswQueryParams): Promise<OswDTO[]> {
        //Builds the query object. All the query consitions can be build in getQueryObject()
        let queryObject = params.getQueryObject();

        let queryConfig = <QueryConfig>{
            text: queryObject.getQuery(),
            values: queryObject.getValues()
        }

        let result = await dbClient.query(queryConfig);

        let list: OswDTO[] = [];
        result.rows.forEach(x => {
            let osw = OswDTO.from(x);
            if (osw.polygon)
                osw.polygon = new PolygonDto({ coordinates: JSON.parse(x.polygon2).coordinates });
            list.push(osw);
        })
        return Promise.resolve(list);
    }

    async getOswById(id: string): Promise<FileEntity> {
        const query = {
            text: 'Select file_upload_path from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        let osw = await dbClient.query(query);

        if (osw.rowCount == 0)
            throw new HttpException(404, "File not found");

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw console.error("Storage not configured");
        let url: string = decodeURIComponent(osw.rows[0].file_upload_path);
        return storageClient.getFileFromUrl(url);
    }

    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.file_upload_path = decodeURIComponent(oswInfo.file_upload_path!);

            await dbClient.query(oswInfo.getInsertQuery());

            let osw = OswDTO.from(oswInfo);
            return Promise.resolve(osw);
        } catch (error) {

            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswInfo.tdei_record_id);
            }

            console.log("Error saving the osw version", error);
            return Promise.reject(error);
        }

    }
}

const oswService: IOswService = new OswService();
export default oswService;
