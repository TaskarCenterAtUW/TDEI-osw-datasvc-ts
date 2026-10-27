# Adding a job to TDEI

This guide covers how to add a new job type end to end: a worker that does the work, the Azure resources it needs, and the changes here and in the gateway that let users start it through the TDEI API. For how workflows are structured, see [orchestrator_v2.md](../src/orchestrator_v2/orchestrator_v2.md).

The Pathways-Convert job is a worked example of every step:
- the worker: [TDEI-python-pathways-converter](https://github.com/TaskarCenterAtUW/TDEI-python-pathways-converter)
- this repo: #402
- the gateway: TDEI-gateway #170

## How a job runs

1. A user calls an endpoint here. The service creates a row in `content.job` and starts a workflow from `src/tdei-orchestrator-config_v2.json`, with the job ID.
2. The workflow's Event task publishes a message on the worker's request topic. It sends:
   - `messageId`: the workflow execution ID
   - `messageType`: `<workflow name>|<task reference name>`
   - `data`: the task's `input_params`
3. The worker does the work, then publishes its reply on its response topic. The reply echoes `messageId` and `messageType`, with the result in `data`.
4. The orchestrator matches the reply to the workflow by those two fields. If `data.success` is true, it runs the next task, usually an `update_table` that sets the job's `download_url` and `status`. Otherwise it runs the workflow's `exception_task`.
5. The user polls `GET /api/v1/jobs?job_id=…` and downloads the result with `GET /api/v1/job/download/{job_id}`.

## 1. The worker

Copy an existing Python worker, such as TDEI-python-gtfs-pathways-validation. Use `python-ms-core` for Service Bus and storage, and give it a FastAPI health check on port 8080.

- **Read** `REQUEST_TOPIC`, `REQUEST_SUBSCRIPTION`, `RESPONSE_TOPIC`, `CONTAINER_NAME`, `QUEUECONNECTION` and `STORAGECONNECTION` from the environment.
- **Reply to every message**, including failures: publish `success: false` and a `message` rather than letting an exception end the handler. A message that's never answered leaves the job `IN-PROGRESS` until it's dead-lettered.
- **Echo `messageId` and `messageType`** from the request unchanged.
- **Write outputs under a folder named for the job ID**, e.g. `<container>/<jobId>/…`, and reply with the blob URLs. `job/download/{job_id}` serves the file at `download_url`, and `?file=<path>` serves any other file in the job's folder.
- **Don't keep credentials it's given** (for example `tdei_auth_token`) beyond the request.
- **Name the repo** `TDEI-python-<data type>-<job>`. Add the dev/stage/prod deploy workflows and a unit-test workflow, copied from another worker.

## 2. Azure resources (per environment)

All of these live in `GaussianRG` for Dev. New resources must carry the tags `ENV`, `Project`, `Owner (Individual)` and `Owner (Org)` whenever the subscription's "Require Tags on All Resources" policy is enforced.

- **Service Bus** (`tdei-service-bus` on Dev):
  - a request topic `<job>-request`, with a subscription `request-handler` for the worker
  - a response topic `<job>-response`, with a subscription `res-handler` for this service
- **Blob container** in the environment's storage account (`tdeisamplestorage` on Dev). Keep it private. This service and the worker must use the same storage account, so `job/download` can serve the worker's files.
- **App Service** (Linux, container) for the worker. It can go on an existing plan, e.g. `TDEI-2-dev`.
  - **App settings:** the variables above, plus `WEBSITES_PORT=8080` and the `DOCKER_REGISTRY_SERVER_*` values. Take the registry password from `az acr credential show`, not from another app's settings, which may be out of date.
  - **Always On**, so the worker keeps listening.
  - **A health check** on `/health/ping`.
  - **HTTPS only.**
- **GitHub environment** (Development, Stage, Production) on the worker's repo, with these secrets:
  - `REGISTRY_DOMAIN`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `REGISTRY_REPO`
  - `AZURE_WEBAPP_NAME`

  `TDEI_CORE_AZURE_CREDS` is an org-level secret.

To check the worker before steps 3–5 exist, publish a request on its topic by hand and read the reply from `res-handler`.

## 3. This repo

1. **Job type:** add it to `JobType` in `src/model/jobs-get-query-params.ts`. `job_type` is a text column, so no migration is needed.
2. **Workflow name:** add it to `WorkflowName` in `src/constants/app-constants.ts`.
3. **The workflow** in `src/tdei-orchestrator-config_v2.json` (see [orchestrator_v2.md](../src/orchestrator_v2/orchestrator_v2.md)):
   - **`workflow_input`:** every key the service will pass. `startWorkflow` rejects input that's missing any of them.
   - **An Event task on the request topic.** For each `input_params` value:
     - Values are lodash templates rendered against `{ workflow_input }`, then each top-level value is JSON-parsed if it can be.
     - Write `"<%=JSON.stringify(workflow_input.x)%>"`, so that text stays text (`"7"` would otherwise become the number 7) and objects arrive as JSON.
     - Empty values are dropped before the message is published, so optional fields can simply be blank.
   - **`output_params`:** these read the reply as `data.*`. Include `success` and `message`, and JSON-stringify any object you want to keep.
   - **An `update_table` Utility task** on `content.job`:
     - set `download_url`, `status: "COMPLETED"`, `message` and `updated_at: "CURRENT_TIMESTAMP"`
     - for `response_props` (a `json` column), pass a JSON string: `"<%=JSON.stringify({ … })%>"`
   - **An `exception_task`** that sets `status: "FAILED"`. Guard any reference to a task's output, because it doesn't exist when the request never got a reply. For example: `<%=(tasks.t && tasks.t.output && tasks.t.output.message) || 'Job failed'%>`.
4. **Subscriptions** in the same file:
   - add `{ topic: "<job>-response", subscription: "res-handler" }` to `subscriptions`
   - add `{ topic: "<job>-request", subscription: ["request-handler"] }` to `dlq_subscriptions`, so a dead-lettered request fails the job instead of leaving it `IN-PROGRESS`
5. **The endpoint** in the controller for the data type (e.g. `pathways-controller.ts`):
   - use `multer` for uploads
   - add `apiTracker` and `authenticate`, plus `authorize([...])` if only some roles may run it
   - check the upload size with `getDatasetUploadLimitBytes`
   - return `202` with the job ID and a `Location: /api/v1/jobs?job_id=…` header
6. **The service method,** with its declaration in the service's interface:
   - validate the request and throw `InputException` for bad input
   - upload any file to the worker's container (`storageService.uploadFile(…, containerName)`)
   - create the job with `CreateJobDTO` and `jobServiceInstance.createJob`. Keep credentials out of `request_input`.
   - call `appContext.orchestratorService_v2_Instance!.startWorkflow(job_id, WorkflowName.x, workflow_input, user_id)`
   - if the worker fetches URLs the user gives it, allow only what it needs, e.g. public https URLs of one kind
   - forward the caller's token only when the worker needs it, as Quality-Report and Pathways-Convert do
7. **Tests** (`npm test`):
   - **Service:** the job record, the workflow input and the invalid requests
   - **Controller:** 202, 400, 500 and the size limit
   - **`test/unit/workflow-config.test.ts`:** render the real templates with `OrchestratorUtility.map_props`, for the request, the reply, the job update and the failure update

## 4. The gateway

TDEI-gateway routes only the endpoints it lists. Add yours to `config/settings/<env>/endpoints.json`, on the `dev` branch for Dev:
- set `backend_host` to this service's App Service
- add a `timeout` for long uploads, as `gtfs-pathways/validate` has

Query strings are forwarded on every route.

## 5. Deploy and check

1. Merge this repo's PR, then the gateway's, into `dev`. Each deploys on merge.
2. Start a job through `https://api-dev.tdei.us`.
3. Watch it in `GET /api/v1/jobs?job_id=…`.
4. Download the result with `GET /api/v1/job/download/{job_id}`.
5. If the job stays `IN-PROGRESS`:
   - check the worker's container log
   - check the request subscription's active and dead-letter counts
   - check that this service is subscribed to the response topic (it subscribes at startup, so it needs a restart after a config change)
