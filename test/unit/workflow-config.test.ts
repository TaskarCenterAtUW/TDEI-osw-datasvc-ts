import orchestratorConfig from "../../src/tdei-orchestrator-config_v2.json";
import { OrchestratorWorkflowConfig } from "../../src/orchestrator_v2/workflow/workflow-config-model";

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
});
