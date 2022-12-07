import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { Equal, FindOptionsWhere, Raw } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { OswVersions } from "../database/entity/osw-version-entity";
import { OswDTO } from "../model/osw-dto";
import { OswQueryParams } from "../model/osw-get-query-params";
import { Utility } from "../utility/utility";
import { IOswService } from "./Osw-service-interface";

class OswService implements IOswService {
    constructor() {
    }

    async getAllOsw(params: OswQueryParams): Promise<OswDTO[]> {
        const oswRepository = AppDataSource.getRepository(OswVersions);

        //Set defaults if not provided
        if (params.page_no == undefined) params.page_no = 1;
        if (params.page_size == undefined) params.page_size = 10;
        let skip = params.page_no == 1 ? 0 : (params.page_no - 1) * params.page_size;
        let take = params.page_size > 50 ? 50 : params.page_size;

        let where: FindOptionsWhere<OswVersions> = {};

        if (params.osw_schema_version) where.osw_schema_version = Equal(params.osw_schema_version);
        if (params.tdei_org_id) where.tdei_org_id = Equal(params.tdei_org_id);
        if (params.tdei_record_id) where.tdei_record_id = Equal(params.tdei_record_id);
        if (params.tdei_service_id) where.tdei_service_id = Equal(params.tdei_service_id);
        if (params.date_time && Utility.dateIsValid(params.date_time)) where.valid_to = Raw((alias) => `${alias} > :date`, { date: params.date_time });

        const osw = await oswRepository.find({
            where: where,
            order: {
                tdei_record_id: "DESC",
            },
            skip: skip,
            take: take,
        });

        let list: OswDTO[] = [];
        osw.forEach(x => {

            let osw: OswDTO = Utility.copy<OswDTO>(new OswDTO(), x);;
            list.push(osw);
        })
        return Promise.resolve(list);
    }

    async getOswById(id: string): Promise<FileEntity> {
        const oswRepository = AppDataSource.getRepository(OswVersions);

        const osw: OswVersions | any = await oswRepository.findOneBy(
            {
                tdei_record_id: id
            });

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw console.error("Storage not configured");
        let url: string = decodeURIComponent(osw?.file_upload_path);
        return storageClient.getFileFromUrl(url);
    }

    async createOsw(oswInfo: OswVersions): Promise<OswDTO> {
        try {
            const oswRepository = AppDataSource.getRepository(OswVersions);
            oswInfo.file_upload_path = decodeURIComponent(oswInfo.file_upload_path!);
            const newOsw = oswRepository.create(oswInfo);

            await oswRepository.save(newOsw);
            let osw: OswDTO = Utility.copy<OswDTO>(new OswDTO(), newOsw);

            return Promise.resolve(osw);
        } catch (error) {
            console.log("Error saving the osw version", error);
            return Promise.reject(error);
        }

    }
}

const oswService = new OswService();
export default oswService;
