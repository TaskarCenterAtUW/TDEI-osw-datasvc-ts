import { IsIn, IsNotEmpty, IsNumber, IsOptional, ValidationError, validate } from "class-validator";
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