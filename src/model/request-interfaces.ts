import { IsIn, IsNotEmpty, IsNumber, IsOptional, ValidationError, validate } from "class-validator";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { InputException } from "../exceptions/http/http-exceptions";

export interface IDatasetCloneRequest {
    isAdmin: boolean;
    tdei_dataset_id: string;
    tdei_project_group_id: string;
    tdei_service_id: string;
    user_id: string;
    metafile: any;
}

export interface CloneContext {
    db_clone_dataset_updated: boolean;
    blob_clone_uploaded: boolean;
    osw_dataset_elements_cloned: boolean;
    dest_changeset_upload_entity?: FileEntity;
    dest_dataset_upload_entity?: FileEntity;
    dest_metadata_upload_entity?: string;
    dest_osm_upload_entity?: FileEntity;
    new_tdei_dataset_id: string;
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
        let errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            let message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }
}


/** Mirrors the '{<type>,...}' paths read by content.tdei_union_dataset. */
export const UNION_FILTERABLE_ENTITY_TYPES = ['edge', 'node', 'zone', 'line', 'polygon', 'point'] as const;

export type UnionFilterableEntityType = typeof UNION_FILTERABLE_ENTITY_TYPES[number];

export interface EntityFilterGroup {
    [attribute: string]: string | number | boolean;
}

export interface EntityFilterBlock {
    /** Pairs within a group are AND-ed, groups are OR-ed. */
    filters?: EntityFilterGroup[];
    /** Corridor half-width in metres. Defaults to proximity. */
    duplicate_buffer_width?: number;
    /** 0 exclusive to 100 inclusive. */
    duplicate_overlap_percentage?: number;
}

export type EntityFilters = Partial<Record<UnionFilterableEntityType, EntityFilterBlock>>;

const UNION_FILTER_BLOCK_KEYS = ['filters', 'duplicate_buffer_width', 'duplicate_overlap_percentage'];

const UNSUPPORTED_REASON: Partial<Record<UnionFilterableEntityType, string>> = {
    node: 'node features are merged by proximity, not by overlap',
    point: 'point features are merged by proximity, not by overlap',
    polygon: 'polygon features are compared by shared area, so there is no corridor to widen',
    zone: 'zone features are compared by shared area, so there is no corridor to widen',
};

const DUPLICATE_BUFFER_ENTITY_TYPES: UnionFilterableEntityType[] = ['edge', 'line'];

const DUPLICATE_OVERLAP_ENTITY_TYPES: UnionFilterableEntityType[] = ['edge', 'line', 'polygon', 'zone'];

const isPlainObject = (value: any): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function assertSupportedSetting(
    entityType: UnionFilterableEntityType,
    setting: string,
    supportedTypes: UnionFilterableEntityType[]
): void {
    if (supportedTypes.includes(entityType)) return;

    const reason = UNSUPPORTED_REASON[entityType];
    throw new InputException(
        `entity_filters.${entityType}.${setting} is not supported${reason ? `: ${reason}` : ''}. Supported file types: ${supportedTypes.join(', ')}`
    );
}

function assertNumberInRange(
    value: any,
    path: string,
    { min, max, unit }: { min: number; max?: number; unit?: string }
): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new InputException(`${path} must be a number${unit ? ` of ${unit}` : ''}`);
    }
    if (value <= min || (max !== undefined && value > max)) {
        const bound = max !== undefined
            ? `greater than ${min} and at most ${max}`
            : `greater than ${min}${unit ? ` ${unit}` : ''}`;
        throw new InputException(`${path} must be ${bound} (got ${value})`);
    }
}

/**
 * Validates the optional entity_filters payload against what
 * content.tdei_union_dataset accepts:
 *
 *   {"edge":    {"filters": [{"highway": "footway", "footway": "sidewalk"}],
 *                "duplicate_buffer_width": 3,
 *                "duplicate_overlap_percentage": 70},
 *    "polygon": {"duplicate_overlap_percentage": 80}}
 *
 * Every block key is optional. An unknown file type or setting is rejected
 * rather than ignored: quietly dropping a mistyped key would produce a run that
 * looks clean while applying none of the caller's intent.
 */
export function validateEntityFilters(entity_filters: any): void {
    if (entity_filters === undefined || entity_filters === null) return;

    if (!isPlainObject(entity_filters)) {
        throw new InputException('entity_filters must be an object keyed by file type');
    }

    for (const key of Object.keys(entity_filters)) {
        if (!UNION_FILTERABLE_ENTITY_TYPES.includes(key as UnionFilterableEntityType)) {
            throw new InputException(`entity_filters contains unsupported file type '${key}'. Supported file types: ${UNION_FILTERABLE_ENTITY_TYPES.join(', ')}`);
        }
        const entityType = key as UnionFilterableEntityType;

        const block = entity_filters[entityType];
        if (!isPlainObject(block)) {
            throw new InputException(`entity_filters.${entityType} must be an object`);
        }

        for (const blockKey of Object.keys(block)) {
            if (!UNION_FILTER_BLOCK_KEYS.includes(blockKey)) {
                throw new InputException(`entity_filters.${entityType}: unknown setting '${blockKey}'. Expected ${UNION_FILTER_BLOCK_KEYS.join(', ')}`);
            }
        }

        if (block.filters !== undefined) {
            if (!Array.isArray(block.filters)) {
                throw new InputException(`entity_filters.${entityType}.filters must be an array`);
            }

            block.filters.forEach((group: any, index: number) => {
                const path = `entity_filters.${entityType}.filters[${index}]`;
                if (!isPlainObject(group)) {
                    throw new InputException(`${path} must be an object of attribute/value pairs`);
                }
                // An empty group matches every feature, disabling the filter
                // rather than narrowing it.
                if (Object.keys(group).length === 0) {
                    throw new InputException(`${path} must declare at least one attribute`);
                }
                for (const attribute of Object.keys(group)) {
                    const value = group[attribute];
                    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
                        throw new InputException(`${path}.${attribute} must be a string, number or boolean`);
                    }
                }
            });
        }

        if (block.duplicate_buffer_width !== undefined) {
            assertSupportedSetting(entityType, 'duplicate_buffer_width', DUPLICATE_BUFFER_ENTITY_TYPES);
            assertNumberInRange(block.duplicate_buffer_width, `entity_filters.${entityType}.duplicate_buffer_width`, { min: 0, unit: 'metres' });
        }

        if (block.duplicate_overlap_percentage !== undefined) {
            assertSupportedSetting(entityType, 'duplicate_overlap_percentage', DUPLICATE_OVERLAP_ENTITY_TYPES);
            assertNumberInRange(block.duplicate_overlap_percentage, `entity_filters.${entityType}.duplicate_overlap_percentage`, { min: 0, max: 100 });
        }
    }
}

export class UnionRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_one!: string;
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_two!: string;
    @Prop()
    @IsNumber()
    proximity: number = 0.5;
    /** Omitted means every feature is eligible to merge. */
    @Prop()
    @IsOptional()
    entity_filters?: EntityFilters;

    async validateRequestInput() {
        let errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            let message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        validateEntityFilters(this.entity_filters);
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
        let errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            let message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }
}