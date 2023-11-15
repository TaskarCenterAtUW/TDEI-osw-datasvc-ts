import { Geometry, Feature } from "geojson";
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
import { IOswService } from "./interface/Osw-service-interface";

class OswService implements IOswService {
    constructor() {
      // TODO document why this constructor is empty
    
    }

    async getAllOsw(params: OswQueryParams): Promise<OswDTO[]> {
        //Builds the query object. All the query consitions can be build in getQueryObject()
        const queryObject = params.getQueryObject();

        const queryConfig = <QueryConfig>{
            text: queryObject.getQuery(),
            values: queryObject.getValues()
        }

        const result = await dbClient.query(queryConfig);

        const list: OswDTO[] = [];
        result.rows.forEach(x => {
            const osw = OswDTO.from(x);
            if (osw.polygon) {
                const polygon = JSON.parse(x.polygon2) as Geometry;
                osw.polygon = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            geometry: polygon,
                            properties: {}
                        } as Feature
                    ]
                }
            }
            list.push(osw);
        })
        return Promise.resolve(list);
    }

    async getOswById(id: string): Promise<FileEntity> {
        const query = {
            text: 'Select file_upload_path from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        const osw = await dbClient.query(query);

        if (osw.rowCount == 0)
            throw new HttpException(404, "File not found");

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");
        const url: string = decodeURIComponent(osw.rows[0].file_upload_path);
        return storageClient.getFileFromUrl(url);
    }

    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.file_upload_path = decodeURIComponent(oswInfo.file_upload_path!);

            await dbClient.query(oswInfo.getInsertQuery());

            const osw = OswDTO.from(oswInfo);
            return Promise.resolve(osw);
        } catch (error) {

            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(oswInfo.tdei_record_id);
            }

            console.error("Error saving the osw version", error);
            return Promise.reject(error);
        }

    }

    async getOSWRecordById(id: string): Promise<OswDTO> {
        const query = {
            text: 'Select ST_AsGeoJSON(polygon) as polygon2, * from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        const result = await dbClient.query(query);
        if (result.rowCount == 0)
            throw new HttpException(404, "Record not found");
        const record = result.rows[0]
        console.log(record);
            const osw = OswDTO.from(record);
            
            if (osw.polygon) {
                const polygon = JSON.parse(record.polygon2) as Geometry;
                osw.polygon = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            geometry: polygon,
                            properties: {}
                        } as Feature
                    ]
                }
            }
        return osw;
    }
}

const oswService: IOswService = new OswService();
export default oswService;
