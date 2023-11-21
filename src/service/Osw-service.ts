import { Geometry, Feature } from "geojson";
import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, JobIdNotFoundException } from "../exceptions/http/http-exceptions";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";
import { IOswService } from "./interface/Osw-service-interface";
import { OswConfidenceJob } from "../database/entity/osw-confidence-job-entity";
import { OSWConfidenceResponse } from "../model/osw-confidence-response";

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

    async getOswById(id: string, format: string = "osw"): Promise<FileEntity> {
        const query = {
            text: 'Select file_upload_path, download_osm_url, download_xml_url from osw_versions WHERE tdei_record_id = $1',
            values: [id],
        }

        const osw = await dbClient.query(query);

        if (osw.rowCount == 0)
            throw new HttpException(404, "File not found");

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        var url: string = '';
        if (format == "osm") {
            if (osw.rows[0].download_osm_url && osw.rows[0].download_osm_url != '')
                url = decodeURIComponent(osw.rows[0].download_osm_url);
            else
                throw new HttpException(404, "Requested OSM file format not found");
        } else if (format == "xml") {
            if (osw.rows[0].download_osm_url && osw.rows[0].download_xml_url != '')
                url = decodeURIComponent(osw.rows[0].download_xml_url);
            else
                throw new HttpException(404, "Requested XML file format not found");
        } else if (format == "osw") {
            url = decodeURIComponent(osw.rows[0].file_upload_path);
        }
        else {
            //default osw
            url = decodeURIComponent(osw.rows[0].file_upload_path);
        }

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

    async updateOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            oswInfo.file_upload_path = decodeURIComponent(oswInfo.file_upload_path!);
            oswInfo.download_osm_url = decodeURIComponent(oswInfo.download_osm_url!);
            oswInfo.download_xml_url = decodeURIComponent(oswInfo.download_xml_url!);

            await dbClient.query(oswInfo.getUpdateQuery());

            const osw = OswDTO.from(oswInfo);
            return Promise.resolve(osw);
        } catch (error) {
            console.error("Error updating the osw version", error);
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
        osw.download_url = record.file_upload_path
        return osw;
    }

    async createOSWConfidenceJob(info: OswConfidenceJob): Promise<string> {
        try {
            const query = info.getInsertQuery()
            const result = await dbClient.query(query)
            const inserted_jobId = result.rows[0]['jobid']; // Get the jobId and return it back
            return inserted_jobId;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async getOSWConfidenceJob(jobId: string) : Promise<OswConfidenceJob> {
        try {
            const query = 'SELECT * from public.osw_confidence_jobs where jobId='+jobId;
            const result = await dbClient.query(query);
            if (result.rowCount == 0){
                return Promise.reject(new JobIdNotFoundException(jobId))
            }
            const job = OswConfidenceJob.from(result.rows[0])
            return job;

        }
        catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    async updateConfidenceMetric(info: OSWConfidenceResponse): Promise<string> {
        try {
            console.log('Updating status for ', info.jobId);
            const updateQuery = info.getUpdateJobQuery();
            const result = await dbClient.query(updateQuery);
            const tdeiRecordId = result.rows[0]['tdei_record_id'];
            if (tdeiRecordId != undefined) {
                console.log('Updating OSW records');
                const oswUpdateQuery = info.getRecordUpdateQuery(tdeiRecordId);
                const queryResult = await dbClient.query(oswUpdateQuery);
            }

            return info.jobId.toString();
        }
        catch (error) {
            Promise.reject(error);
        }
        return ''
    }
}

const oswService: IOswService = new OswService();
export default oswService;
