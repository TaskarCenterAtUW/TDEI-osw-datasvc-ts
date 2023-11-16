import { IsIn, IsISO8601, IsNotEmpty } from "class-validator";
import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { Readable } from "stream";
import { IsValidPolygon } from "../validators/polygon-validator";


export class OswUploadMeta extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    collected_by!: string;

    @Prop()
    @IsISO8601()
    @IsNotEmpty()
    collection_date!: Date;

    @Prop()
    @IsISO8601()
    @IsNotEmpty()
    publication_date!: Date;

    @Prop()
    @IsNotEmpty()
    tdei_project_group_id!: string;

    @Prop()
    @IsNotEmpty()
    @IsIn(['manual', 'transform', 'generated', 'others'])
    collection_method!: string;

    @Prop()
    @IsNotEmpty()
    @IsIn(['3rdParty', 'TDEITools', 'InHouse'])
    data_source!: string;

    @Prop()
    @IsValidPolygon()
    polygon!: FeatureCollection;

    @Prop()
    osw_schema_version!: string;

    /**
     * Returns the readable stream of the information
     * @returns Readable stream for upload
     */
    getStream(): NodeJS.ReadableStream {
        const stringContent = JSON.stringify(this);
        const buffer = Buffer.from(stringContent)
        return Readable.from(buffer);
    }

}