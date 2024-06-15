import { Prop } from "nodets-ms-core/lib/models";
import { BaseDto } from "../../model/base-dto";
import { TdeiDate } from "../../utility/tdei-date";

export enum WorkflowStatus {
    RUNNING = 'RUNNING',
    TERMINATED = 'TERMINATED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
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

    public static completed(task: Task): void {
        task.status = WorkflowStatus.COMPLETED;
        task.end_time = TdeiDate.UTC();
    }

    public static start(task: Task, input: any): void {
        task.status = WorkflowStatus.RUNNING;
        task.input = input;
    }

    public static fail(task: Task, error: string): void {
        task.status = WorkflowStatus.FAILED;
        task.error = error;
        task.end_time = TdeiDate.UTC();
    }
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
    total_workflow_tasks!: number;
    @Prop()
    tasks: { [key: string]: Task } = {};
    @Prop()
    exception_task: { [key: string]: Task } = {};
    @Prop()
    get tasks_track_number(): number {
        return Object.keys(this.tasks).length;
    }
    @Prop()
    last_updated_at: string = TdeiDate.UTC();

    public static failed(context: WorkflowContext, error: string): void {
        context.status = WorkflowStatus.FAILED;
        context.end_time = TdeiDate.UTC();
        context.current_task_error = error;
        context.current_task_status = WorkflowStatus.FAILED;
        context.last_updated_at = TdeiDate.UTC();
    }

    public static updateCurrentTask(context: WorkflowContext, task: Task): void {
        context.current_task = task.name;
        context.current_task_status = task.status;
        context.current_task_error = task.error ?? "";
        context.last_updated_at = TdeiDate.UTC();
    }

    public static completed(context: WorkflowContext): void {
        context.status = WorkflowStatus.COMPLETED;
        context.end_time = TdeiDate.UTC();
        context.last_updated_at = TdeiDate.UTC();
    }

    public static start(context: WorkflowContext): void {
        context.status = WorkflowStatus.RUNNING;
        context.last_updated_at = TdeiDate.UTC();
    }

    public terminate(context: WorkflowContext, reason: string): void {
        context.status = WorkflowStatus.TERMINATED;
        context.terminated_reason = reason;
        context.terminated_at = TdeiDate.UTC();
        context.last_updated_at = TdeiDate.UTC();
    }
}
