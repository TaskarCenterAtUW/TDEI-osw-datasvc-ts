import orchestratorConfig from "../../src/tdei-orchestrator-config_v2.json";
import { OrchestratorWorkflowConfig } from "../../src/orchestrator_v2/workflow/workflow-config-model";
import { OrchestratorUtility } from "../../src/orchestrator_v2/orchestrator-utility";

describe("Workflow config", () => {
    it("should load message_application_properties for osw_validation task", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("osw_upload");
        expect(workflow).toBeDefined();

        const task = workflow!.tasks.find((t) => t.task_reference_name === "osw_validation");
        expect(task).toBeDefined();
        expect(task!.message_application_properties).toBeDefined();
        expect(task!.message_application_properties).toEqual({
            file_size_mb: "<%=workflow_input.upload_file_size_mb%>",
        });
    });

    it("should load message_application_properties for osw_validation_only task", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("osw_validation_only");
        expect(workflow).toBeDefined();

        const task = workflow!.tasks.find((t) => t.task_reference_name === "osw_validation_only");
        expect(task).toBeDefined();
        expect(task!.message_application_properties).toBeDefined();
        expect(task!.message_application_properties).toEqual({
            file_size_mb: "<%=workflow_input.upload_file_size_mb%>",
        });
    });

    it("should load message_application_properties for osw_osm_formatting_ON_DEMAND task", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("osw_formatting_on_demand");
        expect(workflow).toBeDefined();

        const task = workflow!.tasks.find((t) => t.task_reference_name === "osw_osm_formatting_ON_DEMAND");
        expect(task).toBeDefined();
        expect(task!.message_application_properties).toBeDefined();
        expect(task!.message_application_properties).toEqual({
            file_size_mb: "<%=workflow_input.upload_file_size_mb%>",
        });
    });

    it("should load message_application_properties for osw_quality_metric_on_demand task", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("osw_quality_metric_on_demand");
        expect(workflow).toBeDefined();

        const task = workflow!.tasks.find((t) => t.task_reference_name === "osw_quality_metric_on_demand");
        expect(task).toBeDefined();
        expect(task!.message_application_properties).toBeDefined();
        expect(task!.message_application_properties).toEqual({
            file_size_mb: "<%=workflow_input.upload_file_size_mb%>",
        });
    });

    it("should send pathways_convert to the converter and listen for its replies", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("pathways_convert");
        expect(workflow).toBeDefined();

        const task = workflow!.tasks.find((t) => t.task_reference_name === "pathways_convert");
        expect(task!.topic).toBe("pathways-converter-request");
        expect(Object.keys(task!.input_params)).toEqual(expect.arrayContaining(["jobId", "arcgis_url", "dxf_file_upload_path"]));
        expect(orchestratorConfig.subscriptions).toContainEqual(expect.objectContaining({ topic: "pathways-converter-response", subscription: "res-handler" }));
        expect(orchestratorConfig.dlq_subscriptions).toContainEqual(expect.objectContaining({ topic: "pathways-converter-request" }));
    });

    it("should render pathways_convert's messages and job update from its templates", () => {
        const oc = new OrchestratorWorkflowConfig(orchestratorConfig as any);
        const workflow = oc.getWorkflowByName("pathways_convert")!;
        const [convert, update] = workflow.tasks;
        const workflow_input: any = {
            job_id: "399", user_id: "u1", arcgis_url: "https://example.com/arcgis/rest/services/x/MapServer",
            dxf_file_upload_path: "", layers: "7", crs: "", control: null, station: "123", level_pattern: "",
            levels: { Platform: -1 }, exclude_levels: ["Roof"], agency_gtfs_dataset_id: "", parent_station: "",
            platforms: null, tdei_auth_token: "", tdei_api_key: ""
        };

        // The request: text stays text (even when it looks like a number), JSON options arrive as JSON
        const request = OrchestratorUtility.map_props(convert.input_params, { workflow_input });
        expect(request).toEqual(expect.objectContaining({
            jobId: "399", layers: "7", station: "123", levels: { Platform: -1 }, exclude_levels: ["Roof"]
        }));
        expect(request.crs).toBe(""); // dropped before publishing, with the other empty options

        // The reply
        const files = { sodo: { "report.md": "https://x/pathways-converter/399/sodo/report.md" } };
        const job_metadata = { sodo: { stops: 8, platforms: 3 } };
        const output = OrchestratorUtility.map_props(convert.output_params, {
            data: { success: true, message: "Converted 1 station(s)", file_upload_path: "https://x/pathways-converter/399/pathways-converter-output.zip", files, job_metadata }
        });
        expect(output).toEqual({ success: true, message: "Converted 1 station(s)", file_upload_path: "https://x/pathways-converter/399/pathways-converter-output.zip", files, job_metadata });

        // The job update
        const updated = OrchestratorUtility.map_props(update.input_params, { workflow_input, tasks: { pathways_convert: { output } } });
        expect(updated.where).toEqual({ job_id: "399" });
        expect(updated.data.download_url).toBe("https://x/pathways-converter/399/pathways-converter-output.zip");
        expect(updated.data.status).toBe("COMPLETED");
        expect(JSON.parse(updated.data.response_props)).toEqual({ files, job_metadata });

        // On failure: the converter's own message, or a general one when there was no reply
        const failure = (orchestratorConfig.workflows.find((w: any) => w.name === "pathways_convert") as any).exception_task[0];
        const failed = OrchestratorUtility.map_props(failure.input_params, { workflow_input, tasks: { pathways_convert: { output: { message: "the drawings gave no stations" } } } });
        expect(failed.data).toEqual(expect.objectContaining({ status: "FAILED", message: "the drawings gave no stations" }));
        const unanswered = OrchestratorUtility.map_props(failure.input_params, { workflow_input, tasks: {} });
        expect(unanswered.data.message).toBe("Pathways conversion failed");
    });

    describe.each([
        ["pathways_validation_only", "pathways_validation_only", {}],
        ["pathways_upload", "pathways_upload_validation", { tdei_dataset_id: "d1" }],
        ["pathways_publish", "pathways_publish_validation", {}],
    ])("%s", (name, taskName, kept) => {
        const workflow: any = orchestratorConfig.workflows.find((w: any) => w.name === name);
        const validation = workflow.tasks.find((t: any) => t.task_reference_name === taskName);
        const update = workflow.tasks[workflow.tasks.length - 1];
        const failure = workflow.exception_task.find((t: any) => t.task_reference_name === "job_failure_db");
        const workflow_input = { job_id: "399", tdei_dataset_id: "d1" };
        const report_url = "https://x/pathways/feed-validation-report-1a2b3c4d.zip";
        const report_summary = { valid: true, feed: "feed.zip", strict: false, codesByOutcome: { warning: 2 } };

        const jobData = (template: any, output: any) =>
            OrchestratorUtility.map_props(template.input_params, { workflow_input, tasks: output ? { [taskName]: { output } } : {} }).data;

        it("should keep the validation report on the job", () => {
            const output = OrchestratorUtility.map_props(validation.output_params, {
                data: { success: true, message: "", report_url, report_summary }
            });
            expect(output).toEqual(expect.objectContaining({ report_url, report_summary }));

            const updated = jobData(update, output);
            expect(updated.download_url).toBe(report_url);
            expect(JSON.parse(updated.response_props)).toEqual({ ...kept, report_summary });
        });

        it("should keep the report of a failed validation", () => {
            const output = OrchestratorUtility.map_props(validation.output_params, {
                data: { success: false, message: "errors", report_url, report_summary }
            });
            const failed = jobData(failure, output);
            expect(failed.status).toBe("FAILED");
            expect(failed.download_url).toBe(report_url);
            expect(JSON.parse(failed.response_props)).toEqual({ ...kept, report_summary });
        });

        it("should fail cleanly with no report", () => {
            // No reply, or a reply from a worker that sends no report
            const failed = jobData(failure, undefined);
            expect(failed.download_url).toBe("");
            expect(JSON.parse(failed.response_props)).toEqual(kept);

            const output = OrchestratorUtility.map_props(validation.output_params, { data: { success: true, message: "" } });
            const updated = jobData(update, output);
            expect(updated.download_url).toBe("");
            expect(updated.status).toBe("COMPLETED");
            expect(JSON.parse(updated.response_props)).toEqual(expect.objectContaining(kept));
        });
    });
});
