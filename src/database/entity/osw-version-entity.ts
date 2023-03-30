import { IsNotEmpty, IsOptional } from 'class-validator';
import { FeatureCollection } from 'geojson';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { IsValidPolygon } from '../../validators/polygon-validator';

export class OswVersions extends BaseDto {

    @Prop()
    id!: number;
    @Prop()
    @IsNotEmpty()
    tdei_record_id!: string;
    @Prop()
    confidence_level: number = 0;
    @Prop()
    @IsNotEmpty()
    tdei_org_id!: string;
    @Prop()
    @IsNotEmpty()
    file_upload_path!: string;
    @Prop()
    @IsNotEmpty()
    uploaded_by!: string;
    @Prop()
    @IsNotEmpty()
    collected_by!: string;
    @Prop()
    @IsNotEmpty()
    collection_date!: Date;
    @Prop()
    @IsNotEmpty()
    collection_method!: string;
    @Prop()
    @IsNotEmpty()
    valid_from!: Date;
    @Prop()
    @IsNotEmpty()
    valid_to!: Date;
    @Prop()
    @IsNotEmpty()
    data_source!: string;
    @Prop()
    @IsNotEmpty()
    osw_schema_version!: string;
    @IsOptional()
    @IsValidPolygon()
    @Prop()
    polygon!: FeatureCollection;

    constructor(init?: Partial<OswVersions>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Builds the insert QueryConfig object
     * @returns QueryConfig object
     */
    getInsertQuery(): QueryConfig {
        let polygonExists = this.polygon ? true : false;
        const queryObject = {
            text: `INSERT INTO public.osw_versions(tdei_record_id, 
                confidence_level, 
                tdei_org_id, 
                file_upload_path, 
                uploaded_by,
                collected_by, 
                collection_date,
                collection_method, valid_from, valid_to, data_source,
                osw_schema_version ${polygonExists ? ', polygon ' : ''})
                VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 ${polygonExists ? ', ST_GeomFromGeoJSON($12) ' : ''})`.replace(/\n/g, ""),
            values: [this.tdei_record_id, this.tdei_org_id, this.file_upload_path, this.uploaded_by
                , this.collected_by, this.collection_date, this.collection_method, this.valid_from, this.valid_to, this.data_source, this.osw_schema_version],
        }
        if (polygonExists) {
            queryObject.values.push(JSON.stringify(this.polygon.features[0].geometry));
        }
        return queryObject;
    }
}