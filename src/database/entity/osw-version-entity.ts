import { IsNotEmpty } from 'class-validator';
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
}