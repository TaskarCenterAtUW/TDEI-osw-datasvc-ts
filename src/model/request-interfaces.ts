import { IsIn, IsNotEmpty, ValidationError, validate } from "class-validator";
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
    @IsIn(['edge', 'node', 'zone', 'point', 'node', 'line', 'polygon'])
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


export class UnionRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_one!: string;
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id_two!: string;

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