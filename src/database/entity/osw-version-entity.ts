import { IsNotEmpty } from 'class-validator';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';

export class OswVersions extends BaseDto {

    id!: number;
    @IsNotEmpty()
    tdei_record_id: string = "";
    confidence_level: number = 0;
    @IsNotEmpty()
    tdei_org_id: string = "";
    @IsNotEmpty()
    file_upload_path: string = "";
    @IsNotEmpty()
    uploaded_by: string = "";
    @IsNotEmpty()
    collected_by: string = "";
    @IsNotEmpty()
    collection_date: Date = new Date();
    @IsNotEmpty()
    collection_method: string = "";
    @IsNotEmpty()
    valid_from: Date = new Date();
    @IsNotEmpty()
    valid_to: Date = new Date();
    @IsNotEmpty()
    data_source: string = "";
    @IsNotEmpty()
    osw_schema_version: string = "";
    polygon: any = {};

    constructor(init?: Partial<OswVersions>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Builds the insert QueryConfig object
     * @returns QueryConfig object
     */
    getInsertQuery(): QueryConfig {
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
            values: [this.tdei_record_id, this.tdei_org_id, this.file_upload_path, this.uploaded_by
                , this.collected_by, this.collection_date, this.collection_method, this.valid_from, this.valid_to, this.data_source, this.osw_schema_version],
        }

        return queryObject;
    }
}