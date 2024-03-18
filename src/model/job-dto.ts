import { IsNotEmpty, IsOptional } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { JobStatus, JobType, TDEIDataType } from "./jobs-get-query-params";

export class JobDTO extends AbstractDomainEntity {
    @Prop()
    job_id!: number;
    @Prop()
    data_type!: TDEIDataType;
    @Prop()
    status!: JobStatus;
    @Prop()
    message!: string;
    @Prop()
    tdei_project_group_id!: string;
    @Prop()
    tdei_project_group_name!: string;
    @Prop()
    requested_by!: string;
    @Prop()
    request_input!: any;
    @Prop()
    download_url!: any;
}

export class CreateJobDTO extends AbstractDomainEntity {
    @Prop()
    @IsOptional()
    job_id!: number;
    @Prop()
    data_type!: TDEIDataType;
    @Prop()
    @IsNotEmpty()
    status: string = JobStatus["IN-PROGRESS"];
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    @IsNotEmpty()
    request_input!: any;
    @Prop()
    @IsNotEmpty()
    tdei_project_group_id!: string;
    @Prop()
    @IsNotEmpty()
    user_id!: string;
    @Prop()
    @IsNotEmpty()
    job_type!: JobType;
}

export class UpdateJobDTO extends AbstractDomainEntity {
    @Prop()
    @IsNotEmpty()
    job_id!: string;
    @Prop()
    @IsNotEmpty()
    status!: JobStatus;
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    response_props!: any;
    @Prop()
    download_url!: string;
}