import { Prop } from "nodets-ms-core/lib/models";
import { BaseDto } from "../../model/base-dto";
import { TdeiDate } from "../../utility/tdei-date";

export enum WorkflowStatus {
    RUNNING = 'RUNNING',
    TERMINATED = 'TERMINATED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export class WorkflowContext extends BaseDto {
    @Prop()
    execution_id!: string;
    @Prop()
    workflow_input!: any;
    @Prop()
    start_time: string = TdeiDate.UTC();
    @Prop()
    end_time!: string;
    @Prop()
    is_terminated!: string;
    @Prop()
    terminated_reason!: string;
    @Prop()
    terminated_at!: string;
    @Prop()
    status: string = WorkflowStatus.RUNNING;
    @Prop()
    current_task!: string;
    @Prop()
    current_task_status!: string;
    @Prop()
    current_task_error!: string;
    @Prop()
    tasks: { [key: string]: Task } = {};

    public failed(error: string): void {
        this.status = WorkflowStatus.FAILED;
        this.end_time = TdeiDate.UTC();
        this.current_task_error = error;
        this.current_task_status = WorkflowStatus.FAILED;
    }

    public updateCurrentTask(task: Task): void {
        this.current_task = task.name;
        this.current_task_status = task.status;
        this.current_task_error = task.error ?? "";
    }

    public completed(): void {
        this.status = WorkflowStatus.COMPLETED;
        this.end_time = TdeiDate.UTC();
    }

    public start(): void {
        this.status = WorkflowStatus.RUNNING;
    }

    public terminate(reason: string): void {
        this.status = WorkflowStatus.TERMINATED;
        this.terminated_reason = reason;
        this.terminated_at = TdeiDate.UTC();
    }
}

export class Task extends BaseDto {
    @Prop()
    name!: string;
    @Prop()
    start_time: string = TdeiDate.UTC();
    @Prop()
    end_time!: string;
    @Prop()
    status: string = WorkflowStatus.RUNNING;
    @Prop()
    message!: string;
    @Prop()
    error!: string;
    @Prop()
    input!: any;
    @Prop()
    output!: any;

    public completed(): void {
        this.status = WorkflowStatus.COMPLETED;
        this.end_time = TdeiDate.UTC();
    }

    public start(): void {
        this.status = WorkflowStatus.RUNNING;
    }

    public fail(error: string): void {
        this.status = WorkflowStatus.FAILED;
        this.error = error;
        this.end_time = TdeiDate.UTC();
    }
}