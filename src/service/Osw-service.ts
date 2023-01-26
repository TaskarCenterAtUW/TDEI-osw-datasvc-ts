import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import { DuplicateException } from "../exceptions/http/http-exceptions";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";
import { Utility } from "../utility/utility";
import { IOswService } from "./Osw-service-interface";

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

            let osw: OswDTO = Utility.copy<OswDTO>(new OswDTO(), x);;
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

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw console.error("Storage not configured");
        let url: string = decodeURIComponent(osw.rows[0].file_upload_path);
        return storageClient.getFileFromUrl(url);
    }

    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.file_upload_path = decodeURIComponent(oswInfo.file_upload_path!);
            const queryObject = {
                text: `INSERT INTO public.osw_versions(tdei_record_id, 
                    confidence_level, 
                    tdei_org_id, 
                    file_upload_path, 
                    uploaded_by,
                    collected_by, 
                    collection_date, 
                    collection_method, valid_from, valid_to, data_source,
                    osw_schema_version)
                    VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`.replace(/\n/g, ""),
                values: [oswInfo.tdei_record_id, oswInfo.tdei_org_id, oswInfo.file_upload_path, oswInfo.uploaded_by
                    , oswInfo.collected_by, oswInfo.collection_date, oswInfo.collection_method, oswInfo.valid_from, oswInfo.valid_to, oswInfo.data_source, oswInfo.osw_schema_version],
            }

            let result = await dbClient.query(queryObject);

            let pathway: OswDTO = Utility.copy<OswDTO>(new OswDTO(), oswInfo);

            return Promise.resolve(pathway);
        } catch (error) {

            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswInfo.tdei_record_id);
            }

            console.log("Error saving the osw version", error);
            return Promise.reject(error);
        }

    }
}

const oswService = new OswService();
export default oswService;
