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

/**
 * The optional body of POST /api/v1/osw/quality-report/{tdei_dataset_id}: which kinds of points of
 * interest the report fetches. Leaving it out keeps the report's default (every type). There is no
 * state option because the report works the state out itself: Overture places are fetched only in
 * the US state(s) the dataset's area overlaps; for an area outside every state, they are fetched
 * without a state filter.
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

    async validateRequestInput() {
        const errors = await validate(this);
        if (errors.length > 0) {
            const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Invalid quality report options: ${message}`);
        }
        return true;
    }

    /**
     * The columns the report requires of an uploaded pois_file (Task1a.UPLOADED_POI_COLUMNS in
     * TDEI-quality-reports). Any others are optional: the report fills in snapped (true) and source
     * ("uploaded") where the file leaves them out or empty, and reads nothing else but name.
     */
    static readonly POIS_FILE_COLUMNS = ["lat", "lon"];

    /**
     * Checks an uploaded pois_file before a job is made for it. The report uses the file as-is in place
     * of the points of interest it would fetch, so poi_types, which chooses what to fetch, can't come
     * with it. Only the header is checked here; the report checks every row (e.g. valid coordinates,
     * and snapped, where given, true).
     */
    validatePoisFile(file: { buffer: Buffer }) {
        if (this.poi_types != null) {
            throw new InputException("pois_file is used instead of fetching points of interest, so it can't be sent with poi_types, which chooses what to fetch");
        }
        const columns = QualityReportRequest.csvHeader(file.buffer);
        const missing = QualityReportRequest.POIS_FILE_COLUMNS.filter((column) => !columns.includes(column));
        if (missing.length > 0) {
            throw new InputException(`pois_file must be a CSV with ${QualityReportRequest.POIS_FILE_COLUMNS.join(", ")} columns; it has no ${missing.join(", ")} column`);
        }
    }

    /** The column names on a CSV's first line, without a byte order mark or quotes. */
    private static csvHeader(buffer: Buffer): string[] {
        const start = buffer.toString("utf8", 0, Math.min(buffer.length, 64 * 1024)).replace(/^\uFEFF/, "");
        return start.split(/\r?\n/, 1)[0].split(",").map((name) => name.trim().replace(/^"(.*)"$/, "$1"));
    }

    /** The options as the workflow carries them: text, and empty when not chosen (the report's default). */
    toWorkflowInput(): { poi_types: string } {
        return {
            poi_types: (this.poi_types ?? []).join(","),
        };
    }
}
