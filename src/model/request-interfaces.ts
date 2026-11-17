import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, ValidationError, validate } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { InputException } from "../exceptions/http/http-exceptions";
import { parseUnionConfig } from "../utility/union-config";

export interface IDatasetCloneRequest {
    isAdmin: boolean;
    tdei_dataset_id: string;
    tdei_project_group_id: string;
    tdei_service_id: string;
    user_id: string;
    metafile: any;
}

export class SpatialJoinRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    target_dataset_id!: string;
    @Prop()
    @IsNotEmpty()
    @IsIn(['edge', 'node', 'zone'])
    target_dimension!: string;
    @Prop()
    @IsNotEmpty()
    source_dataset_id!: string;
    @Prop()
    @IsNotEmpty()
    @IsIn(['edge', 'node', 'zone', 'point', 'node', 'line', 'polygon', 'extension'])
    source_dimension!: string;
    @Prop()
    @IsNotEmpty()
    join_condition!: string;
    @Prop()
    join_filter_target!: string;
    @Prop()
    join_filter_source!: string;
    @Prop()
    aggregate!: string[];
    @Prop()
    @IsIn(['default', 'exclusive', 'shared'])
    assignment_method: string = 'default';

    async validateRequestInput() {
        const errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }
}


/**
 * Union 5.0 request: two OSW datasets and an optional `config`
 * (sections snap, dedup, connect, extensions — see utility/union-config.ts).
 * The 4.x `proximity` and `entity_filters` parameters are rejected by the
 * controller before this entity is built.
 */
export class UnionRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_one!: string;
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_two!: string;
    /** A config object or its JSON string. Omitted means the two datasets are combined unchanged. */
    @Prop()
    @IsOptional()
    config?: Record<string, unknown> | string;

    /**
     * Validates the request and normalises `config` to an object (`{}` when omitted).
     * @throws InputException when a field is missing or the config envelope is invalid
     */
    async validateRequestInput() {
        const errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        if (this.tdei_dataset_id_one === this.tdei_dataset_id_two) {
            throw new InputException("tdei_dataset_id_one and tdei_dataset_id_two must be different datasets");
        }
        this.config = parseUnionConfig(this.config);
        return true;
    }
}

export class SelfMergeRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    tdei_dataset_id!: string;

    @Prop()
    @IsNumber()
    proximity: number = 0.5;

    async validateRequestInput() {
        const errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }
}

/** The values a quality report's poi_state may take: the 50 US states and DC. */
export const US_STATE_CODES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
    "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
];

/**
 * The optional body of POST /api/v1/osw/quality-report/{tdei_dataset_id}: which kinds of points of
 * interest the report fetches, and the US state that Overture places must be in. Leaving either out
 * keeps the report's defaults (every type; WA).
 */
export class QualityReportRequest extends AbstractDomainEntity {

    // The type names are defined, and checked, by the report pipeline (config.POI_TYPES in
    // TDEI-quality-reports), so a new type doesn't need a release here; this only checks the form.
    @Prop()
    @IsOptional()
    @IsArray({ message: "poi_types must be an array of POI type names" })
    @ArrayNotEmpty({ message: "poi_types must name at least one POI type; leave it out to include every type" })
    @IsString({ each: true, message: "poi_types must be an array of POI type names" })
    @Matches(/^[a-z][a-z0-9_]*$/, { each: true, message: "poi_types must be lowercase names such as civic or leisure" })
    poi_types?: string[];

    @Prop()
    @IsOptional()
    @IsIn(US_STATE_CODES, { message: "poi_state must be a two-letter US state code such as WA" })
    poi_state?: string;

    async validateRequestInput() {
        const errors = await validate(this);
        if (errors.length > 0) {
            const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Invalid quality report options: ${message}`);
        }
        return true;
    }

    /** The options as the workflow carries them: text, and empty when not chosen (the report's default). */
    toWorkflowInput(): { poi_types: string; poi_state: string } {
        return {
            poi_types: (this.poi_types ?? []).join(","),
            poi_state: this.poi_state ?? "",
        };
    }
}
