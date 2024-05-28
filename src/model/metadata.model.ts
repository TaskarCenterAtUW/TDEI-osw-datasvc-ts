import { IsNotEmpty, IsOptional, IsISO8601, IsIn, IsObject, ValidateNested } from "class-validator";
import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { IsValidPolygon } from "../validators/polygon-validator";



export class DataProvenance extends AbstractDomainEntity {
    @Prop()
    @IsNotEmpty()
    full_dataset_name: string = "";
    @Prop()
    @IsOptional()
    other_published_locations: string = "";
    @Prop()
    @IsOptional()
    dataset_update_frequency_months: number = 0;
    @Prop()
    @IsOptional()
    schema_validation_run: boolean = false;
    @Prop()
    @IsOptional()
    schema_validation_run_description: string = "";
    @Prop()
    @IsOptional()
    allow_crowd_contributions: boolean = false;
    @Prop()
    @IsOptional()
    location_inaccuracy_factors: string = "";
}

export class DatasetDetail extends AbstractDomainEntity {
    @Prop()
    @IsNotEmpty()
    name: string = "";

    @Prop()
    @IsOptional()
    description: string = "";

    @Prop()
    @IsNotEmpty()
    version: string = "";

    @Prop()
    @IsOptional()
    custom_metadata: Object = {};

    @Prop()
    @IsNotEmpty()
    collected_by: string = "";

    @Prop()
    @IsISO8601()
    @IsNotEmpty()
    collection_date: string | null = null;

    @Prop()
    @IsOptional()
    @IsISO8601()
    valid_from: string | null = null;

    @Prop()
    @IsOptional()
    @IsISO8601()
    valid_to: string | null = null;

    @Prop()
    @IsOptional()
    @IsIn(['manual', 'transform', 'generated', 'AV', 'others'])
    collection_method: string = "";

    @Prop()
    @IsNotEmpty()
    @IsIn(['3rdParty', 'TDEITools', 'InHouse'])
    data_source: string | null = null;

    @Prop()
    @IsOptional()
    @IsNotEmpty()
    @IsObject()
    @IsValidPolygon()
    dataset_area: FeatureCollection | null = null;

    @Prop()
    @IsNotEmpty()
    schema_version: string = "";
}

export class DatasetSummary extends AbstractDomainEntity {
    @Prop()
    @IsOptional()
    collection_name: string = "";
    @Prop()
    @IsOptional()
    department_name: string = "";
    @Prop()
    @IsOptional()
    city: string = "";
    @Prop()
    @IsOptional()
    region: string = "";
    @Prop()
    @IsOptional()
    county: string = "";
    @Prop()
    @IsOptional()
    key_limitations_of_the_dataset: string = "";
    @Prop()
    @IsOptional()
    challenges: string = "";
}

export class Maintenance extends AbstractDomainEntity {
    @Prop()
    @IsOptional()
    official_maintainer: string[] = [];
    @Prop()
    @IsOptional()
    last_updated: string = "";
    @Prop()
    @IsOptional()
    update_frequency: string = "";
    @Prop()
    @IsOptional()
    authorization_chain: string = "";
    @Prop()
    @IsOptional()
    maintenance_funded: boolean = false;
    @Prop()
    @IsOptional()
    funding_details: string = "";
}

export class Methodology extends AbstractDomainEntity {
    @Prop()
    @IsOptional()
    point_data_collection_device: string = "";
    @Prop()
    @IsOptional()
    node_locations_and_attributes_editing_software: string = "";
    @Prop()
    @IsOptional()
    data_collected_by_people: boolean = false;
    @Prop()
    @IsOptional()
    data_collectors: string = "";
    @Prop()
    @IsOptional()
    data_captured_automatically: boolean = false;
    @Prop()
    @IsOptional()
    automated_collection: string = "";
    @Prop()
    @IsOptional()
    data_collectors_organization: string = "";
    @Prop()
    @IsOptional()
    data_collector_compensation: string = "";
    @Prop()
    @IsOptional()
    preprocessing_location: string = "";
    @Prop()
    @IsOptional()
    preprocessing_by: string = "";
    @Prop()
    @IsOptional()
    preprocessing_steps: string = "";
    @Prop()
    @IsOptional()
    data_collection_preprocessing_documentation: boolean = false;
    @Prop()
    @IsOptional()
    documentation_uri: string = "";
    @Prop()
    @IsOptional()
    validation_process_exists: boolean = false;
    @Prop()
    @IsOptional()
    validation_process_description: string = "";
    @Prop()
    @IsOptional()
    validation_conducted_by: string = "";
    @Prop()
    @IsOptional()
    excluded_data: string = "";
    @Prop()
    @IsOptional()
    excluded_data_reason: string = "";
}

export class MetadataModel extends AbstractDomainEntity {
    @Prop()
    @ValidateNested()
    data_provenance: DataProvenance = new DataProvenance();
    @Prop()
    @ValidateNested()
    dataset_detail: DatasetDetail = new DatasetDetail();
    @Prop()
    @ValidateNested()
    dataset_summary: DatasetSummary = new DatasetSummary();
    @Prop()
    @ValidateNested()
    maintenance: Maintenance = new Maintenance();
    @Prop()
    @ValidateNested()
    methodology: Methodology = new Methodology();

    static flatten(metadata: MetadataModel): any {
        return {
            ...metadata.data_provenance,
            ...metadata.dataset_detail,
            ...metadata.dataset_summary,
            ...metadata.maintenance,
            ...metadata.methodology
        };
    }
    static unflatten(metadata: any): MetadataModel {
        return MetadataModel.from({
            data_provenance: {
                full_dataset_name: metadata.full_dataset_name,
                other_published_locations: metadata.other_published_locations,
                dataset_update_frequency_months: metadata.dataset_update_frequency_months,
                schema_validation_run: metadata.schema_validation_run,
                schema_validation_run_description: metadata.schema_validation_run_description,
                allow_crowd_contributions: metadata.allow_crowd_contributions,
                location_inaccuracy_factors: metadata.location_inaccuracy_factors
            },
            dataset_detail: {
                name: metadata.name,
                description: metadata.description,
                version: metadata.version,
                custom_metadata: metadata.custom_metadata,
                collected_by: metadata.collected_by,
                collection_date: metadata.collection_date,
                valid_from: metadata.valid_from,
                valid_to: metadata.valid_to,
                collection_method: metadata.collection_method,
                data_source: metadata.data_source,
                dataset_area: metadata.dataset_area,
                schema_version: metadata.schema_version
            },
            dataset_summary: {
                collection_name: metadata.collection_name,
                department_name: metadata.department_name,
                city: metadata.city,
                region: metadata.region,
                county: metadata.county,
                key_limitations_of_the_dataset: metadata.key_limitations_of_the_dataset,
                challenges: metadata.challenges
            },
            maintenance: {
                official_maintainer: metadata.official_maintainer,
                last_updated: metadata.last_updated,
                update_frequency: metadata.update_frequency,
                authorization_chain: metadata.authorization_chain,
                maintenance_funded: metadata.maintenance_funded,
                funding_details: metadata.funding_details
            },
            methodology: {
                point_data_collection_device: metadata.point_data_collection_device,
                node_locations_and_attributes_editing_software: metadata.node_locations_and_attributes_editing_software,
                data_collected_by_people: metadata.data_collected_by_people,
                data_collectors: metadata.data_collectors,
                data_captured_automatically: metadata.data_captured_automatically,
                automated_collection: metadata.automated_collection,
                data_collectors_organization: metadata.data_collectors_organization,
                data_collector_compensation: metadata.data_collector_compensation,
                preprocessing_location: metadata.preprocessing_location,
                preprocessing_by: metadata.preprocessing_by,
                preprocessing_steps: metadata.preprocessing_steps,
                data_collection_preprocessing_documentation: metadata.data_collection_preprocessing_documentation,
                documentation_uri: metadata.documentation_uri,
                validation_process_exists: metadata.validation_process_exists,
                validation_process_description: metadata.validation_process_description,
                validation_conducted_by: metadata.validation_conducted_by,
                excluded_data: metadata.excluded_data,
                excluded_data_reason: metadata.excluded_data_reason
            }
        });
    }
}
