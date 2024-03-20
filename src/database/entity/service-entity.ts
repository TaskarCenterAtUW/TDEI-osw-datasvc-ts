import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { BaseDto } from '../../model/base-dto';

export class ServiceEntity extends BaseDto {
    @Prop()
    @IsNotEmpty()
    service_id!: string;
    @Prop()
    @IsNotEmpty()
    name!: string;
    @Prop()
    @IsNotEmpty()
    owner_project_group!: string;
    @Prop()
    @IsNotEmpty()
    service_type!: string;

    constructor(init?: Partial<ServiceEntity>) {
        super();
        Object.assign(this, init);
    }
}