import { IsNotEmpty, IsOptional } from "class-validator";
import { feedbackRequestParams } from "./feedback-request-params";

export class FeedbackDownloadRequestParams extends feedbackRequestParams {
    @IsNotEmpty()
    override tdei_project_group_id!: string;

    @IsOptional()
    override page_no?: number;

    @IsOptional()
    override page_size?: number;

    constructor(init?: Partial<FeedbackDownloadRequestParams>) {
        super();
        Object.assign(this, init);
        if (init?.page_no === undefined) this.page_no = undefined;
        if (init?.page_size === undefined) this.page_size = undefined;
    }
}
