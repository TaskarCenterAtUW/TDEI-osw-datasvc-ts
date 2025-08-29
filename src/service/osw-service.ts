import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import { DownloadStatsEntity } from "../database/entity/download-stats";
import HttpException from "../exceptions/http/http-base-exception";
import { ForbiddenRequest, InputException, OverlapException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { IUploadRequest } from "./interface/upload-request-interface";
import path from "path";
import { Readable } from "stream";
import storageService from "./storage-service";
import appContext from "../app-context";
import { IOswService } from "./interface/osw-service-interface";
import { BboxServiceRequest, InclinationServiceRequest, TagRoadServiceRequest } from "../model/backend-request-interface";
import jobService from "./job-service";
import { IJobService } from "./interface/job-service-interface";
import { CreateJobDTO } from "../model/job-dto";
import { JobStatus, JobType, TDEIDataType } from "../model/jobs-get-query-params";
import tdeiCoreService from "./tdei-core-service";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import { RecordStatus } from "../model/dataset-get-query-params";
import { MetadataModel } from "../model/metadata.model";
import { TdeiDate } from "../utility/tdei-date";
import { WorkflowName } from "../constants/app-constants";
import { SpatialJoinRequest, UnionRequest } from "../model/request-interfaces";
import { TagQualityMetricResponse, TagQualityMetricRequest } from "../model/tag-quality-metric";
import oswSchema from "../assets/opensidewalks_0.2.schema.json";
import osw_identifying_fields from "../assets/opensidewalks_0.2.identifying.fields.json";
import { Utility } from "../utility/utility";
import AdmZip from "adm-zip";
import { FeedbackRequestDto, FeedbackResponseDTO } from "../model/feedback-dto";
import { FeedbackEntity } from "../database/entity/feedback-entity";
import { QueryConfig } from "pg";
import { feedbackRequestParams } from "../model/feedback-request-params";
import { FeedbackMetadataDTO } from "../model/feedback-metadata-dto";
import { IProjectDataviewerConfig } from "./interface/project-dataviewer-config-interface";

class OswService implements IOswService {
    constructor(public jobServiceInstance: IJobService, public tdeiCoreServiceInstance: ITdeiCoreService) { }

    /**
     * Generates PMTiles for a given TDEI dataset ID.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param user_id - The ID of the user requesting the PMTiles generation.
     * @returns The generated Job id for PMTiles creation.
     */
    async generatePMTiles(user_id: string, tdei_dataset_id: string): Promise<string> {

        try {

            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not an osw dataset.`);

            if (dataset.status !== RecordStatus["Publish"])
                throw new ForbiddenRequest(`Dataset ${tdei_dataset_id} has not been released. PMTiles generation is not allowed.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-PMTiles"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            let workflow_start = WorkflowName.osw_generate_pmtiles;
            let workflow_input = {
                tdei_dataset_id: tdei_dataset_id,
                job_id: job_id.toString(),
                dataset_url: dataset.latest_dataset_url,
                user_id: user_id
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return job_id.toString();
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Updates the visibility of a dataset.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param allow_viewer_access - A boolean indicating whether to allow viewer access.
     * @returns A Promise that resolves to a boolean indicating success or failure.
     */
    async updateDatasetVisibility(tdei_dataset_id: string, allow_viewer_access: boolean): Promise<boolean> {
        try {
            // Check if the dataset exists
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not an osw dataset.`);

            if (dataset.status !== RecordStatus["Publish"])
                throw new ForbiddenRequest(`Dataset ${tdei_dataset_id} has not been released. You can update its visibility only once it is released.`);

            //verify project group dataviewer config is configured 
            let pg_data_viewer_config = await this.getProjectGroupDataviewerConfig(dataset.tdei_project_group_id);

            if (pg_data_viewer_config && pg_data_viewer_config.dataset_viewer_allowed === false)
                throw new ForbiddenRequest(`Please contact the project administrator to allow dataset viewer access for project group.`);

            // Update the dataset visibility
            const queryConfig: QueryConfig = {
                text: `UPDATE content.dataset SET data_viewer_allowed = $1 WHERE tdei_dataset_id = $2`,
                values: [allow_viewer_access, tdei_dataset_id]
            };
            await dbClient.query(queryConfig);
            return true;

        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
         * Gets feedback requests.
         * @param user_id - The ID of the user making the request.
         * @param params - The feedback request parameters.
         * @returns A Promise that resolves to an array of feedback DTOs.
         */
    async getFeedbacks(user_id: any, params: feedbackRequestParams): Promise<Array<FeedbackResponseDTO>> {
        try {
            const queryObject = params.getQuery(user_id);

            const queryConfig = <QueryConfig>{
                text: queryObject.text,
                values: queryObject.values
            }
            //Get feedback details
            const result = await dbClient.query(queryConfig);
            return result.rows.map((row: any) => {
                let info = FeedbackResponseDTO.from(row);
                info.project_group = {
                    tdei_project_group_id: row.tdei_project_group_id,
                    name: row.project_group_name
                };
                info.dataset = {
                    tdei_dataset_id: row.tdei_dataset_id,
                    name: row.dataset_name,

                };
                return info;
            });
        }
        catch (error) {
            throw error;
        }
    }

    /**
         * Gets feedbacks metadata.
     * @param user_id - The ID of the user making the request.
     * @param tdei_project_group_id - The ID of the TDEI project group.
     * @returns A Promise that resolves to an array of feedback DTOs.
     * @throws If there is an error retrieving the feedback metadata.
     * @throws If there is an error executing the query.
     */
    async getFeedbacksMetadata(user_id: any, tdei_project_group_id?: string): Promise<FeedbackMetadataDTO> {
        try {
            let queryConfig = <QueryConfig>{
                text: `
                SELECT COUNT(fd.id) as total_count, 
                SUM(CASE WHEN fd.due_date < NOW() AND fd.status = 'open' THEN 1 ELSE 0 END) as total_overdues,
                SUM(CASE WHEN fd.status = 'open' THEN 1 ELSE 0 END) as total_open 
                from content.feedback fd`,
                values: []
            }
            if (tdei_project_group_id) {
                queryConfig.text += ` WHERE fd.tdei_project_id = $1`;
                queryConfig.values?.push(tdei_project_group_id!);
            }
            //Get feedback details
            const result = await dbClient.query(queryConfig);
            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    total_count: Number(row.total_count) || 0,
                    total_overdues: Number(row.total_overdues) || 0,
                    total_open: Number(row.total_open) || 0
                } as FeedbackMetadataDTO;
            }
            return { total_count: 0, total_overdues: 0, total_open: 0 } as FeedbackMetadataDTO;
        }
        catch (error) {
            throw error;
        }
    }

    /**
     * Streams feedback records for a project group in CSV format.
     * @param params - Feedback request parameters.
     * @param excludeLimit - Indicates whether pagination should be excluded.
     * @returns A Readable stream containing CSV data.
     */
    async downloadFeedbacks(params: feedbackRequestParams, excludeLimit: boolean): Promise<Readable> {
        try {
            const queryObject = params.getQuery('', excludeLimit);
            const queryConfig: QueryConfig = {
                text: queryObject.text,
                values: queryObject.values
            };
            const result = await dbClient.query(queryConfig);

            function* csvGenerator() {
                const header = 'id,project_group_id,project_group_name,dataset_id,dataset_name,dataset_element_id,feedback_text,reporter_email,location_latitude,location_longitude,created_at,updated_at,status,due_date\n';
                yield header;
                for (const row of result.rows) {
                    const values = [
                        row.id,
                        row.tdei_project_group_id,
                        row.project_group_name,
                        row.tdei_dataset_id,
                        row.dataset_name,
                        row.dataset_element_id ?? '',
                        row.feedback_text ?? '',
                        row.customer_email ?? '',
                        row.location_latitude ?? '',
                        row.location_longitude ?? '',
                        row.created_at ? new Date(row.created_at).toISOString() : '',
                        row.updated_at ? new Date(row.updated_at).toISOString() : '',
                        row.status ?? '',
                        row.due_date ? new Date(row.due_date).toISOString() : ''
                    ].map((val: any) => {
                        const strVal = val !== null && val !== undefined ? String(val) : '';
                        // Escape double quotes by doubling them
                        return strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') ? `"${strVal.replace(/"/g, '""')}"` : strVal;
                    }).join(',');
                    yield values + '\n';
                }
            }

            return Readable.from(csvGenerator());
        }
        catch (error) {
            throw error;
        }
    }

    /**
     * Adds a feedback request.
     * @param feedback - The feedback data transfer object.
     * @param project_id - The ID of the project.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @returns A Promise that resolves to the ID of the created feedback.
     */
    async addFeedbackRequest(feedback: FeedbackRequestDto): Promise<string> {
        try {
            //verify dataset exists
            const feedbackDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(feedback.tdei_dataset_id);

            if (feedbackDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${feedback.tdei_dataset_id} is not an osw dataset.`);

            if (feedbackDataset.tdei_project_group_id != feedback.tdei_project_id)
                throw new InputException(`Dataset ${feedback.tdei_dataset_id} does not belong to project group ${feedback.tdei_project_id}.`);

            if (feedbackDataset.data_viewer_allowed === false)
                throw new InputException(`Dataset ${feedback.tdei_dataset_id} is not allowed for viewer access and cannot accept feedbacks. Please contact the project administrator.`);

            let pg_data_viewer_config: IProjectDataviewerConfig | undefined = undefined;
            if (feedback.tdei_project_id && feedback.tdei_project_id.trim() != '') {
                pg_data_viewer_config = await this.getProjectGroupDataviewerConfig(feedback.tdei_project_id);
                if (pg_data_viewer_config && pg_data_viewer_config.dataset_viewer_allowed === false)
                    throw new InputException(`Dataset viewer access is not allowed for project group ${feedback.tdei_project_id} and cannot accept feedbacks. Please contact the project administrator.`);
            }

            let entity = new FeedbackEntity();
            entity.tdei_project_id = feedback.tdei_project_id;
            entity.tdei_dataset_id = feedback.tdei_dataset_id;
            entity.feedback_text = feedback.feedback_text;
            entity.customer_email = feedback.customer_email;
            entity.location_latitude = feedback.location_latitude;
            entity.location_longitude = feedback.location_longitude;
            entity.dataset_element_id = feedback.dataset_element_id ?? '';

            if (pg_data_viewer_config != undefined && pg_data_viewer_config.feedback_turnaround_time.number && pg_data_viewer_config.feedback_turnaround_time.units && pg_data_viewer_config.feedback_turnaround_time.number > 0) {
                entity.due_date = TdeiDate.getFutureUTCDate(pg_data_viewer_config.feedback_turnaround_time.number, pg_data_viewer_config.feedback_turnaround_time.units);
            }

            const result = await dbClient.query(entity.getInsertQuery());
            return result.rows[0].id;

        } catch (error) {
            return Promise.reject(error);
        }
    }

    /*
        * Gets the project group dataviewer configuration.
        * @param tdei_project_id - The ID of the TDEI project.
        * @returns A Promise that resolves to the project dataviewer configuration or undefined if not configured.
        * @throws If the project group does not exist or if the dataviewer is not configured.
        */
    private async getProjectGroupDataviewerConfig(tdei_project_id: string): Promise<IProjectDataviewerConfig | undefined> {
        const queryConfig = <QueryConfig>{
            text: "select data_viewer_config from public.project_group where project_group_id = $1",
            values: [tdei_project_id]
        };
        let result = await dbClient.query(queryConfig);
        if (result.rowCount == 0) {
            throw new HttpException(404, `Project group with ${tdei_project_id} doesn't exist in the system`);
        }

        if (result.rows[0].data_viewer_config === null || Object.keys(result.rows[0].data_viewer_config).length === 0)
            throw new InputException(`Dataviewer not configured for project group ${tdei_project_id}. Please contact the project administrator.`);

        return result.rows[0].data_viewer_config ? result.rows[0].data_viewer_config : undefined;
    }

    /**
    * Processes a union join request.
    * 
    * @param user_id - The ID of the user making the request.
    * @param requestService - The union join request.
    * @returns The job_id of the union join request.
    */
    async processUnionRequest(user_id: string, requestService: UnionRequest): Promise<string> {
        try {
            const sourceDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.tdei_dataset_id_one);
            const targetDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.tdei_dataset_id_two);

            if (sourceDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.tdei_dataset_id_one} is not a osw dataset.`);
            if (targetDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.tdei_dataset_id_two} is not a osw dataset.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Union"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id_one: requestService.tdei_dataset_id_one,
                    tdei_dataset_id_two: requestService.tdei_dataset_id_two,
                    proximity: requestService.proximity,
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            let workflow_start = WorkflowName.osw_union_dataset;
            let workflow_input = {
                job_id: job_id.toString(),
                service: "union_dataset",
                parameters: requestService,
                user_id: user_id,
                tdei_dataset_id_one: requestService.tdei_dataset_id_one,
                tdei_dataset_id_two: requestService.tdei_dataset_id_two
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return job_id.toString();
        }
        catch (error) {
            throw error;
        }
    }
    /*
        REFERENCE SCRIPT
            WITH sidewalk_attributes AS (
            SELECT
            (CASE WHEN width is not null THEN 1 ELSE 0 END) AS has_width,
            (CASE WHEN surface is not null THEN 1 ELSE 0 END) AS has_surface,
            (CASE WHEN incline is not null THEN 1 ELSE 0 END) AS has_incline
            FROM content.edge
            WHERE highway = 'footway' AND footway = 'sidewalk'
            ),
            kerb_attributes AS (
            SELECT
            (CASE WHEN crossing_markings IS NOT NULL AND crossing_markings = 'yes' THEN 1 ELSE 0 END) AS has_marked,
            (CASE WHEN crossing_markings IS NOT NULL AND crossing_markings = 'no' THEN 1 ELSE 0 END) AS has_unmarked
            FROM content.edge
            WHERE highway = 'footway' AND footway = 'crossing'
            )
            SELECT
            'sidewalk' AS type,
            (ROUND(CASE WHEN COUNT(*) > 0 THEN (SUM(has_width) + SUM(has_surface) + SUM(has_incline)) * 100.0 / (COUNT(*) * 3) ELSE 0 END, 2)) as overall_quality_metric,
            JSON_BUILD_OBJECT(
            'width_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_width) * 100.0 / COUNT(*) ELSE 0 END, 2),
            'surface_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_surface) * 100.0 / COUNT(*) ELSE 0 END, 2),
            'incline_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_incline) * 100.0 / COUNT(*) ELSE 0 END, 2)
            ) AS metric_details
            FROM sidewalk_attributes

            UNION ALL

            SELECT
            'kerb' AS type,
            (ROUND(CASE WHEN COUNT(*) > 0 THEN (SUM(has_marked) + SUM(has_unmarked)) * 100.0 / (COUNT(*) * 2) ELSE 0 END, 2)) as overall_quality_metric,
            JSON_BUILD_OBJECT(
            'marked_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_marked) * 100.0 / COUNT(*) ELSE 0 END, 2),
            'unmarked_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_unmarked) * 100.0 / COUNT(*) ELSE 0 END, 2)
            ) AS metric_details
            FROM kerb_attributes;
    */
    /**
      * Processes a dataset tagging request.
      * 
      * @param user_id - The ID of the user making the request.
      * @param tdei_dataset_id - The ID of the TDEI dataset.
      * @param tagFile - The tag file to be uploaded.
      * @returns A Promise that resolves to the tag quality metric details.
      * @throws If there is an error processing the tagging request.
      */
    async calculateTagQualityMetric(tdei_dataset_id: string, tagFile: any, user_id: string): Promise<any> {
        //Check dataset exists
        const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

        if (dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${tdei_dataset_id} is not an osw dataset.`);

        const tagFileBuffer = JSON.parse(tagFile!.buffer);

        Utility.checkForSqlInjection(tagFileBuffer);

        let tag_list: TagQualityMetricRequest[] = [];
        for (let tagItem of tagFileBuffer) {
            tag_list.push(TagQualityMetricRequest.from(tagItem));
        }

        if (tag_list.length == 0)
            throw new InputException("No tags found in the tag file");

        //Validate the tag input data
        let definitions: any = oswSchema.definitions;
        for (let tagItem of tag_list) {

            if (!definitions[tagItem.entity_type])
                throw new InputException(`Entity type ${tagItem.entity_type} not found in the schema`);

            let entitySchema = definitions[`${tagItem.entity_type}Fields`].properties;

            for (let tag of tagItem.tags) {
                if (!tag.startsWith('ext:') && !entitySchema[tag])
                    throw new InputException(`Tag ${tag} not found in the schema for ${tagItem.entity_type}`);
            }
        }

        // Function to build CTE
        const buildCTE = (tagItem: any, identifying_fields: any) => {
            let cte = ` ${tagItem.entity_type} AS (SELECT`;

            tagItem.tags.forEach((key: any) => {
                let key_str = key.replace(":", "_");
                if (key.startsWith('ext:')) {
                    cte += ` (CASE WHEN feature::JSONB->'properties' ? '${key}' is not null THEN 1 ELSE 0 END) AS has_${key_str},`;
                }
                else {
                    cte += ` (CASE WHEN "${key}" is not null THEN 1 ELSE 0 END) AS has_${key_str},`;
                }
            });

            cte = cte.slice(0, -1);
            cte += ` FROM content.${identifying_fields.entity_type} WHERE  tdei_dataset_id = '${tdei_dataset_id}' AND `;

            Object.keys(identifying_fields.identifying_key_val).forEach((key: any) => {
                cte += `  ${key} = '${identifying_fields.identifying_key_val[key as keyof typeof identifying_fields]}' AND`;
            });

            cte = cte.slice(0, -3);
            cte += `),`;

            return cte;
        };

        // Function to build query
        const buildQuery = (tagItem: any) => {
            let query = ` SELECT '${tagItem.entity_type}' AS entity_type,(ROUND(CASE WHEN COUNT(*) > 0 THEN (`;

            tagItem.tags.forEach((key: any) => {
                let key_str = key.replace(":", "_");
                query += `SUM(has_${key_str}) + `;
            });

            query = query.slice(0, -2);
            query += `) * 100.0 / (COUNT(*) * ${tagItem.tags.length}) ELSE 0 END, 2)) as overall_quality_metric,
            JSON_BUILD_OBJECT(`;

            tagItem.tags.forEach((key: any) => {
                let key_str = key.replace(":", "_");
                query += `'${key}_percentage', ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(has_${key_str}) * 100.0 / COUNT(*) ELSE 0 END, 2),`;
            });

            query = query.slice(0, -1);
            query += `) AS metric_details, COUNT(*) as total_entity_count FROM ${tagItem.entity_type} `;

            return query;
        };

        // Build dynamic query 
        let tagQueryCTE = 'WITH';
        let tagQuery = '';

        // Iterate over tag list
        tag_list.forEach((tagItem: any, index: number) => {
            let identifying_fields = osw_identifying_fields[tagItem.entity_type as keyof typeof osw_identifying_fields];

            // Build CTE
            tagQueryCTE += buildCTE(tagItem, identifying_fields);

            // Build query
            tagQuery += buildQuery(tagItem);

            if (index < tag_list.length - 1) {
                tagQuery += ` UNION ALL `;
            }
        });

        tagQueryCTE = tagQueryCTE.slice(0, -1);
        tagQuery = tagQueryCTE + tagQuery;

        // Execute query
        let result = await dbClient.query(tagQuery);

        if (result.rows.length == 0) {
            throw new InputException("No data found for the tags provided");
        }

        let tagQualityMetrics: TagQualityMetricResponse[] = [];
        result.rows.forEach((row: any) => {
            tagQualityMetrics.push(TagQualityMetricResponse.from(row));
        });

        return tagQualityMetrics;
    }

    /**
    * Processes a spatial join request.
    * 
    * @param user_id - The ID of the user making the request.
    * @param requestService - The spatial join request.
    * @returns The result of the spatial join request.
    */
    async processSpatialQueryRequest(user_id: string, requestService: SpatialJoinRequest): Promise<string> {
        try {
            const sourceDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.source_dataset_id);
            const targetDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(requestService.target_dataset_id);

            if (sourceDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.source_dataset_id} is not a osw dataset.`);
            if (targetDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${requestService.target_dataset_id} is not a osw dataset.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Spatial-Join"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    source_dataset_id: requestService.source_dataset_id,
                    source_dimension: requestService.source_dimension,
                    target_dataset_id: requestService.target_dataset_id,
                    target_dimension: requestService.target_dimension,
                    join_condition: requestService.join_condition,
                    filter_target: requestService.join_filter_target,
                    filter_source: requestService.join_filter_source,
                    aggregate: requestService.aggregate
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            let workflow_start = WorkflowName.osw_spatial_join;
            let workflow_input = {
                job_id: job_id.toString(),
                service: "spatial_join",
                parameters: requestService,
                user_id: user_id,
                source_dataset_id: requestService.source_dataset_id,
                target_dataset_id: requestService.target_dataset_id
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return job_id.toString();
        }
        catch (error) {
            throw error;
        }
    }
    /**
    * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
    * @param backendRequest The backend request to process.
    * @returns A Promise that resolves to a string representing the job ID.
    * @throws Throws an error if an error occurs during processing.
    */
    async processDatasetTagRoadRequest(backendRequest: TagRoadServiceRequest): Promise<string> {
        try {
            // check if source dataset exisits
            const sourceDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.source_dataset_id);
            //Only if backendRequest.parameters.target_dataset_id id in pre-release status
            const targetDataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.target_dataset_id);
            if (targetDataset.status !== RecordStatus["Pre-Release"])
                throw new InputException(`Dataset ${backendRequest.parameters.target_dataset_id} is not in Pre-Release state. Dataset road tagging request allowed in Pre-Release state only.`);

            if (sourceDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`Dataset ${backendRequest.parameters.source_dataset_id} is not an osw dataset.`);
            if (targetDataset.data_type !== TDEIDataType.osw)
                throw new InputException(`Dataset ${backendRequest.parameters.target_dataset_id} is not an osw dataset.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Road-Tag"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters
                },
                tdei_project_group_id: '',
                user_id: backendRequest.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            //Compose the meessage
            // let workflow_identifier = "DATA_QUERY_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         service: backendRequest.service,
            //         user_id: backendRequest.user_id,
            //         parameters: backendRequest.parameters
            //     }
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.osw_dataset_road_tag;
            let workflow_input = {
                job_id: job_id.toString(),
                service: backendRequest.service,
                user_id: backendRequest.user_id,
                parameters: backendRequest.parameters,
                tdei_dataset_id: backendRequest.parameters.target_dataset_id,
                metadata_url: targetDataset.metadata_url,
                dataset_url: targetDataset.latest_dataset_url,
                changeset_url: targetDataset.changeset_url,
                tdei_project_group_id: targetDataset.tdei_project_group_id,
                source_dataset_id: backendRequest.parameters.source_dataset_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, backendRequest.user_id);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes a format request by uploading a file, creating a job, triggering a workflow, and returning the job ID.
     * @param source The source format of the file.
     * @param target The target format to convert the file to.
     * @param uploadedFile The file to be uploaded.
     * @param user_id The ID of the user making the request.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during the process.
     */
    async processFormatRequest(source: string, target: string, uploadedFile: Express.Multer.File, user_id: string): Promise<string> {
        try {
            // Get the upload path
            const uid = storageService.generateRandomUUID();
            const folderPath = storageService.getFormatJobPath(uid);
            const uploadPath = path.join(folderPath, uploadedFile!.originalname)
            const extension = path.extname(uploadedFile!.originalname)
            let fileType = 'application/xml'
            if (extension == 'zip') {
                fileType = 'application/zip'
            }
            const source_url = await storageService.uploadFile(uploadPath, fileType, Readable.from(uploadedFile!.buffer))
            console.log('Uplaoded to ', source_url);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Reformat"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    source_format: source,
                    target_format: target,
                    file_upload_name: uploadedFile!.originalname
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            // let workflow_identifier = "OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW";
            // const oswFormatRequest = OswFormatJobRequest.from({
            //     jobId: job_id.toString(),
            //     source: source,
            //     target: target,
            //     sourceUrl: source_url
            // });

            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: oswFormatRequest
            // });
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            let workflow_start = WorkflowName.osw_formatting_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                source: source,
                target: target,
                sourceUrl: decodeURIComponent(source_url),
                file_upload_name: uploadedFile!.originalname
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


            // Send the job_id back to the user.
            return Promise.resolve(job_id.toString());

        } catch (error) {
            throw error;
        }
    }

    /**
     * Calculates the confidence for a given TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param sub_regions_file - The sub-regions file to be used for calculating the confidence.
     * @param user_id - The ID of the user.
     * @returns A Promise that resolves to the ID of the created job.
     * @throws If there is an error calculating the confidence.
     */
    async calculateConfidence(tdei_dataset_id: string, sub_regions_file: Express.Multer.File | undefined, user_id: string): Promise<string> {
        // Check and get the record for the same in the database
        try {
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`Confidence calculation is not supported for ${dataset.data_type} datasets.`);
            // Create a job in the database for the same.
            let sub_regions_upload_url = undefined;
            if (sub_regions_file) {
                // Get the upload path
                const uid = storageService.generateRandomUUID();
                const folderPath = storageService.getConfidenceJobPath(uid);
                const uploadPath = path.join(folderPath, sub_regions_file!.originalname)
                sub_regions_upload_url = await storageService.uploadFile(uploadPath, 'application/json', Readable.from(sub_regions_file.buffer));
            }
            //TODO: Have to add these based on some of the input data.

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Confidence-Calculate"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id,
                    trigger_type: 'manual'
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            // Add the sub regions file to the request input.
            if (sub_regions_upload_url) {
                job.request_input['file_upload_name'] = sub_regions_file!.originalname;
            }

            const job_id = await this.jobServiceInstance.createJob(job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            // const confidenceRequestMsg = new OSWConfidenceJobRequest();
            // confidenceRequestMsg.jobId = job_id.toString();
            // confidenceRequestMsg.data_file = dataset.dataset_url;
            // //TODO: Once this is done, get the things moved.
            // confidenceRequestMsg.meta_file = dataset.metadata_url;
            // if (sub_regions_upload_url)
            //     confidenceRequestMsg.sub_regions_file = sub_regions_upload_url;
            // confidenceRequestMsg.trigger_type = 'manual';

            // //Compose the meessage
            // let workflow_identifier = "OSW_ON_DEMAND_CONFIDENCE_METRIC_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: confidenceRequestMsg
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            let workflow_start = WorkflowName.osw_confidence_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: dataset.latest_dataset_url,
                metadata_url: dataset.metadata_url,
                sub_regions_file: sub_regions_upload_url ? decodeURIComponent(sub_regions_upload_url) : "",
                tdei_dataset_id: tdei_dataset_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


            // Send the jobId back to the user.
            return Promise.resolve(job_id.toString());
        }
        catch (error) {
            console.log("Error calculating confidence ", error);
            return Promise.reject(error);
        }
    }

    /**
     * Processes a publish request for a TDEI dataset.
     * 
     * @param user_id - The ID of the user making the request.
     * @param tdei_dataset_id - The ID of the TDEI dataset to publish.
     * @returns A Promise that resolves when the publish request is processed successfully.
     * @throws {InputException} If the dataset is already published.
     * @throws {OverlapException} If there is a record with the same date.
     * @throws {Error} If an error occurs during the processing of the publish request.
     */
    async processPublishRequest(user_id: string, tdei_dataset_id: string): Promise<string> {
        try {
            let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

            if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);

            if (dataset.status === RecordStatus.Publish)
                throw new InputException(`${tdei_dataset_id} already publised.`);

            if (dataset.status !== RecordStatus["Pre-Release"])
                throw new InputException(`${tdei_dataset_id} is not in Pre-Release state.`);

            // Check if there is a record with the same date
            // const queryResult = await dbClient.query(dataset.getOverlapQuery(TDEIDataType.osw, dataset.tdei_project_group_id, dataset.tdei_service_id));
            // if (queryResult.rowCount && queryResult.rowCount > 0) {
            //     const recordId = queryResult.rows[0]["tdei_dataset_id"];
            //     throw new OverlapException(recordId);
            // }

            //Validate the metadata dates
            tdeiCoreService.validateDatasetDates(dataset);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Publish"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_dataset_id: tdei_dataset_id
                },
                tdei_project_group_id: dataset.tdei_project_group_id,
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            // let workflow_identifier = "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW";
            // const confidenceRequestMsg = new OSWConfidenceJobRequest();
            // confidenceRequestMsg.jobId = job_id.toString();
            // confidenceRequestMsg.data_file = dataset.dataset_url;
            // confidenceRequestMsg.meta_file = dataset.metadata_url;
            // confidenceRequestMsg.trigger_type = 'release';

            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: confidenceRequestMsg
            // });

            // //Delete exisitng workflow if exists
            // let trigger_workflow = appContext.orchestratorServiceInstance!.getWorkflowByIdentifier(workflow_identifier);
            // workflowDatabaseService.obseleteAnyExistingWorkflowHistory(job_id.toString(), trigger_workflow?.group!);
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);

            //Compose the meessage
            let workflow_start = WorkflowName.osw_publish;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: decodeURIComponent(dataset.latest_dataset_url),
                metadata_url: decodeURIComponent(dataset.metadata_url),
                tdei_dataset_id: tdei_dataset_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);


            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes a backend request and returns a Promise that resolves to a string representing the job ID.
     * @param backendRequest The backend request to process.
     * @param file_type Output file type.
     * @returns A Promise that resolves to a string representing the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    async processBboxRequest(backendRequest: BboxServiceRequest, file_type: string): Promise<string> {
        try {
            let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.tdei_dataset_id);
            if (dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${backendRequest.parameters.tdei_dataset_id} is not a osw dataset.`);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-BBox"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters,
                    file_type: file_type
                },
                tdei_project_group_id: '',
                user_id: backendRequest.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            // //Compose the meessage
            // let workflow_identifier = "DATA_QUERY_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         service: backendRequest.service,
            //         user_id: backendRequest.user_id,
            //         parameters: backendRequest.parameters
            //     }
            // });

            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = "";
            let workflow_input = {};

            if (file_type == 'osm') {
                workflow_start = WorkflowName.osm_dataset_bbox;
                workflow_input = {
                    job_id: job_id.toString(),
                    service: backendRequest.service,
                    parameters: backendRequest.parameters,
                    user_id: backendRequest.user_id,// Required field for message authorization
                    tdei_project_group_id: dataset.tdei_project_group_id,
                    tdei_dataset_id: backendRequest.parameters.tdei_dataset_id
                };
            } else if (file_type == 'osw') {
                workflow_start = WorkflowName.osw_dataset_bbox;
                workflow_input = {
                    job_id: job_id.toString(),
                    service: backendRequest.service,
                    parameters: backendRequest.parameters,
                    user_id: backendRequest.user_id,// Required field for message authorization
                    tdei_dataset_id: backendRequest.parameters.tdei_dataset_id
                };
            }
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, backendRequest.user_id);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes a validation-only request.
     * 
     * @param user_id - The ID of the user making the request.
     * @param datasetFile - The dataset file to be uploaded and processed.
     * @returns A Promise that resolves to the job ID.
     * @throws Throws an error if an error occurs during processing.
     */
    async processValidationOnlyRequest(user_id: string, datasetFile: any): Promise<string> {
        try {

            //Upload the files to the storage
            const uid = storageService.generateRandomUUID();
            const storageFolderPath = storageService.getValidationJobPath(uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, datasetFile.originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(datasetFile.buffer))

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Validate"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    file_upload_name: datasetFile.originalname
                },
                tdei_project_group_id: '',
                user_id: user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);
            //Compose the meessage
            // let workflow_identifier = "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW";
            // let queueMessage = QueueMessage.from({
            //     messageId: job_id.toString(),
            //     messageType: workflow_identifier,
            //     data: {
            //         user_id: user_id, // Required field for message authorization
            //         file_upload_path: datasetUploadUrl
            //     }
            // });
            // //Trigger the workflow
            // await appContext.orchestratorServiceInstance!.triggerWorkflow(workflow_identifier, queueMessage);
            let workflow_start = WorkflowName.osw_validation_only;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,// Required field for message authorization
                dataset_url: decodeURIComponent(datasetUploadUrl),
                file_upload_name: datasetFile.originalname
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }

    /**
     * Processes the upload request and performs various validations and operations.
     * 
     * @param uploadRequestObject - The upload request object containing the necessary information.
     * @returns A promise that resolves to the generated unique dataset ID.
     * @throws {InputException} If any validation fails or required data is missing.
     * @throws {ServiceNotFoundException} If the service associated with the request is not found.
     * @throws {Error} If any other error occurs during the process.
     */
    async processUploadRequest(uploadRequestObject: IUploadRequest): Promise<string> {
        let uid = "";
        try {

            //validate derived dataset id
            if (uploadRequestObject.derived_from_dataset_id.length > 0) {
                const query = {
                    text: 'Select * from content.dataset WHERE tdei_dataset_id = $1',
                    values: [uploadRequestObject.derived_from_dataset_id],
                }

                const result = await dbClient.query(query);
                if (result.rowCount == 0) {
                    throw new HttpException(404, "Derived dataset id not found");
                }
            }

            //Validate service_id 
            const service = await this.tdeiCoreServiceInstance.getServiceById(uploadRequestObject.tdei_service_id);
            if (!service) {
                // Service not found exception.
                throw new ServiceNotFoundException(uploadRequestObject.tdei_service_id);
            }
            else if (service!.owner_project_group != uploadRequestObject.tdei_project_group_id) {
                throw new InputException(`${uploadRequestObject.tdei_project_group_id} id not associated with the tdei_service_id`);
            }

            //Validate metadata
            let metadata = JSON.parse(uploadRequestObject.metadataFile[0].buffer);
            const metaObj = MetadataModel.from(metadata);
            await this.tdeiCoreServiceInstance.validateMetadata(metaObj, TDEIDataType.osw);


            // //Check for unique name and version combination
            // if (await this.tdeiCoreServiceInstance.checkMetaNameAndVersionUnique(metadata.name, metadata.version))
            //     throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

            // Generate unique UUID for the upload request 
            uid = storageService.generateRandomUUID();

            //Upload the files to the storage
            const storageFolderPath = storageService.getFolderPath(uploadRequestObject.tdei_project_group_id, uid);
            // Upload dataset file
            const uploadStoragePath = path.join(storageFolderPath, uploadRequestObject.datasetFile[0].originalname)
            const datasetUploadUrl = await storageService.uploadFile(uploadStoragePath, 'application/zip', Readable.from(uploadRequestObject.datasetFile[0].buffer))
            // Upload the metadata file  
            const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
            const metadataUploadUrl = await storageService.uploadFile(metadataStorageFilePath, 'text/json', Readable.from(uploadRequestObject.metadataFile[0].buffer));
            // Upload the changeset file  
            let changesetUploadUrl = "";
            if (uploadRequestObject.changesetFile) {
                let zipBuffer = uploadRequestObject.changesetFile[0].buffer;
                if (uploadRequestObject.changesetFile[0].originalname.endsWith('.osc')) {
                    const zip = new AdmZip();
                    zip.addFile(uploadRequestObject.changesetFile[0].originalname, uploadRequestObject.changesetFile[0].buffer);
                    zipBuffer = zip.toBuffer();
                }
                const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.zip');
                changesetUploadUrl = await storageService.uploadFile(changesetStorageFilePath, 'application/zip', Readable.from(zipBuffer));
            }

            // Insert osw version into database
            const datasetEntity = new DatasetEntity();
            datasetEntity.tdei_dataset_id = uid;
            datasetEntity.data_type = TDEIDataType.osw;
            datasetEntity.status = RecordStatus.Draft;
            datasetEntity.tdei_service_id = uploadRequestObject.tdei_service_id;
            datasetEntity.tdei_project_group_id = uploadRequestObject.tdei_project_group_id;
            datasetEntity.derived_from_dataset_id = uploadRequestObject.derived_from_dataset_id;
            datasetEntity.changeset_url = changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "";
            datasetEntity.metadata_url = decodeURIComponent(metadataUploadUrl);
            datasetEntity.dataset_url = decodeURIComponent(datasetUploadUrl);
            datasetEntity.uploaded_by = uploadRequestObject.user_id;
            datasetEntity.updated_by = uploadRequestObject.user_id;

            // Calculate total size of files inside the uploaded ZIP
            datasetEntity.upload_file_size_bytes = Utility.calculateTotalSize(uploadRequestObject.datasetFile);

            //flatten the metadata to level 1
            metadata = MetadataModel.flatten(metadata);
            metadata.collection_date = TdeiDate.UTC(metadata.collection_date);

            if (metadata.valid_from && metadata.valid_from.trim() != "")
                metadata.valid_from = TdeiDate.UTC(metadata.valid_from);
            else
                metadata.valid_from = null;

            if (metadata.valid_to && metadata.valid_to.trim() != "")
                metadata.valid_to = TdeiDate.UTC(metadata.valid_to);
            else
                metadata.valid_to = null;
            //Add metadata to the entity
            datasetEntity.metadata_json = metadata;
            await this.tdeiCoreServiceInstance.createDataset(datasetEntity);

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Upload"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    tdei_service_id: uploadRequestObject.tdei_service_id,
                    dataset_name: metadata.name,
                    dataset_version: metadata.version,
                    dataset_file_upload_name: uploadRequestObject.datasetFile[0].originalname,
                    metadata_file_upload_name: uploadRequestObject.metadataFile[0].originalname,
                    changeset_file_upload_name: uploadRequestObject.changesetFile ? uploadRequestObject.changesetFile[0].originalname : ""
                },
                response_props: {
                    tdei_dataset_id: uid
                },
                tdei_project_group_id: uploadRequestObject.tdei_project_group_id,
                user_id: uploadRequestObject.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            //Compose the meessage
            let workflow_start = WorkflowName.osw_upload;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: uploadRequestObject.user_id,// Required field for message authorization
                tdei_project_group_id: uploadRequestObject.tdei_project_group_id,// Required field for message authorization
                dataset_url: decodeURIComponent(datasetUploadUrl),
                metadata_url: decodeURIComponent(metadataUploadUrl),
                changeset_url: changesetUploadUrl ? decodeURIComponent(changesetUploadUrl) : "",
                tdei_dataset_id: uid,
                latest_dataset_url: decodeURIComponent(datasetUploadUrl),
                dataset_file_upload_name: uploadRequestObject.datasetFile[0].originalname
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, uploadRequestObject.user_id);

            //Return the tdei_dataset_id
            return Promise.resolve(job_id.toString());
        } catch (error) {
            await this.tdeiCoreServiceInstance.deleteDraftDataset(uid);
            throw error;
        }
    }

    /**
     * Retrieves the OswStream by its ID.
     * @param tdei_dataset_id - The ID of the OswStream.
     * @param format - The format of the OswStream (default is "osw").
     * @returns A promise that resolves to an array of FileEntity objects.
     * @throws HttpException if the OswStream is not found or if the request record is deleted.
     * @throws Error if the storage is not configured.
     */
    async getOswStreamById(tdei_dataset_id: string, format: string = "osw", file_version: string = "latest"): Promise<FileEntity[]> {
        let fileEntities: FileEntity[] = [];

        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);

        if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        var url: string = '';
        if (format == "osm") {
            //if file_version is latest, get the latest version of the file
            if (file_version == "latest") {
                if (dataset.latest_osm_url && dataset.latest_osm_url != '')
                    url = decodeURIComponent(dataset.latest_osm_url);
                else
                    throw new HttpException(404, "Requested OSM file format not found");
            }
            else {
                //original file
                if (dataset.osm_url && dataset.osm_url != '')
                    url = decodeURIComponent(dataset.osm_url);
                else
                    throw new HttpException(404, "Requested OSM file format not found");
            }

        } else if (format == "osw") {
            if (file_version == "latest") {
                url = decodeURIComponent(dataset.latest_dataset_url);
            }
            else {
                //original file
                url = decodeURIComponent(dataset.dataset_url);
            }
        }
        else {
            //default osw
            url = decodeURIComponent(dataset.dataset_url);
        }

        fileEntities.push(await storageClient.getFileFromUrl(url));
        fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.metadata_url)));
        if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null)
            fileEntities.push(await storageClient.getFileFromUrl(decodeURIComponent(dataset.changeset_url)));

        return fileEntities;
    }

    async getDownloadableOSWUrl(id: string, user_id: string, format: string = "osw", file_version: string = "latest"): Promise<string> {

        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(id);
        if (file_version != "latest") {
            throw new InputException("Only latest version of the file can be downloaded");
        }
        if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${id} is not a osw dataset.`);
        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");
        let dataset_db_url = '';
        if (format == "osm") {
            if (dataset.dataset_osm_download_url && dataset.dataset_osm_download_url != '') {
                dataset_db_url = decodeURIComponent(dataset.dataset_osm_download_url);
            }
            else
                throw new HttpException(404, "Requested OSM file format not found");
        } else {
            if (dataset.dataset_download_url && dataset.dataset_download_url != '') {
                dataset_db_url = decodeURIComponent(dataset.dataset_download_url);
            }
            else
                throw new HttpException(404, "Requested OSW file format not found");
        }
        let dlUrl = new URL(dataset_db_url);
        let relative_path = dlUrl.pathname;
        let container = relative_path.split('/')[1];
        let file_path_in_container = relative_path.split('/').slice(2).join('/');
        let sasUrl = storageClient.getSASUrl(container, file_path_in_container, 12); // 12 hours expiry

        const downloadStatsEntity = new DownloadStatsEntity();
        downloadStatsEntity.blob_url = dataset_db_url;
        downloadStatsEntity.file_size = dataset.upload_file_size_bytes || 0;
        downloadStatsEntity.tdei_dataset_id = dataset.tdei_dataset_id;
        downloadStatsEntity.data_type = TDEIDataType.osw;
        downloadStatsEntity.requested_datetime = new Date().toISOString();
        downloadStatsEntity.user_id = user_id;
        await this.tdeiCoreServiceInstance.createDownloadStats(downloadStatsEntity);

        return sasUrl;


    }

    /**
     * Get downloadable OSM PM tiles URL
     * @param id Dataset ID
     * @param user_id User ID
     * @returns Downloadable URL
     */
    async getDownloadableOSWPmTilesUrl(id: string): Promise<string> {

        let dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(id);

        if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
            throw new InputException(`${id} is not a osw dataset.`);

        if (dataset.data_viewer_allowed === false)
            throw new ForbiddenRequest(`Dataset ${id} is not allowed for data viewer access.`);

        let pg_data_viewer_config = await this.getProjectGroupDataviewerConfig(dataset.tdei_project_group_id);

        if (pg_data_viewer_config && pg_data_viewer_config.dataset_viewer_allowed === false)
            throw new ForbiddenRequest(`Please contact the project administrator to allow dataset viewer access for project group.`);


        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");
        let pm_tiles_db_url = '';

        if (dataset.pm_tiles_url && dataset.pm_tiles_url != '') {
            pm_tiles_db_url = decodeURIComponent(dataset.pm_tiles_url);
        }
        else
            throw new HttpException(404, "Requested OSM PM tiles file not found");

        let dlUrl = new URL(pm_tiles_db_url);
        let relative_path = dlUrl.pathname;
        let container = relative_path.split('/')[1];
        let file_path_in_container = relative_path.split('/').slice(2).join('/');
        let sasUrl = storageClient.getSASUrl(container, file_path_in_container, 24); // 24 hours expiry

        return sasUrl;
    }

    async calculateQualityMetric(tdei_dataset_id: string, algorithm: string, sub_regions_file: any, user_id: string): Promise<string> {
        try {
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(tdei_dataset_id);
            if (dataset.data_type && dataset.data_type !== TDEIDataType.osw)
                throw new InputException(`${tdei_dataset_id} is not a osw dataset.`);
            // Check the input algorithm types
            if (algorithm.length == 0) {
                throw new InputException("No quality metric algorithms provided");
            }
            const acceptedAlgorithms = ['fixed', 'ixn'] // Need to move it somewhere.
            if (!acceptedAlgorithms.includes(algorithm)) {
                throw new InputException("Invalid quality metric algorithm provided");
            }

            let sub_regions_upload_url = undefined;
            if (sub_regions_file) {
                // Get the upload path
                const uid = storageService.generateRandomUUID();
                const folderPath = storageService.getQualityMetricJobPath(uid);
                const uploadPath = path.join(folderPath, sub_regions_file!.originalname)
                sub_regions_upload_url = await storageService.uploadFile(uploadPath, 'application/json', Readable.from(sub_regions_file.buffer));
            }
            // Create job for this
            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Quality-Metric"], // Change this
                status: JobStatus["IN-PROGRESS"],
                request_input: {
                    tdei_dataset_id: tdei_dataset_id,
                    algorithm: algorithm,
                    sub_regions_file: sub_regions_upload_url ? sub_regions_file!.originalname : ""
                },
                tdei_project_group_id: '',
                user_id: user_id
            })
            const job_id = await this.jobServiceInstance.createJob(job);

            // Start the workflow for this
            let workflow_start = WorkflowName.osw_quality_on_demand;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: user_id,
                file_url: dataset.latest_dataset_url,
                algorithm: algorithm,
                sub_regions_file: sub_regions_upload_url ? decodeURIComponent(sub_regions_upload_url) : "",
                tdei_dataset_id: tdei_dataset_id
            };

            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);

            return Promise.resolve(job_id.toString());

        } catch (error) {
            console.log('Error calculating quality metric ', error);
            return Promise.reject(error);
        }
    }

    /**
    * Processes a inclination request by uploading a file, creating a job, triggering a workflow, and returning the job ID.
    * @param backendRequest The backend request to process.
    * @returns A Promise that resolves to a string representing the job ID.
    * @throws Throws an error if an error occurs during processing.
    */
    async calculateInclination(backendRequest: InclinationServiceRequest): Promise<string> {
        try {

            // Only if backendRequest.parameters.target_dataset_id id in pre-release status
            const dataset = await this.tdeiCoreServiceInstance.getDatasetDetailsById(backendRequest.parameters.dataset_id);
            if (dataset.status !== RecordStatus["Pre-Release"])
                throw new InputException(`Dataset ${backendRequest.parameters.dataset_id} is not in Pre-Release state. Dataset incline tagging request allowed in Pre-Release state only.`);

            if (dataset.data_type && dataset.data_type !== TDEIDataType.osw) {
                throw new InputException(`Dataset ${backendRequest.parameters.dataset_id} is not an osw dataset.`)
            }

            let job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Incline-Tag"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: {
                    user_id: backendRequest.user_id,
                    dataset_id: backendRequest.parameters.dataset_id
                },
                tdei_project_group_id: '',
                user_id: backendRequest.user_id,
            });

            const job_id = await this.jobServiceInstance.createJob(job);

            let workflow_start = WorkflowName.osw_dataset_incline_tag;
            let workflow_input = {
                job_id: job_id.toString(),
                user_id: backendRequest.user_id,
                dataset_url: dataset.latest_dataset_url,
                metadata_url: dataset.metadata_url,
                changeset_url: dataset.changeset_url,
                tdei_project_group_id: dataset.tdei_project_group_id,
                tdei_dataset_id: dataset.tdei_dataset_id
            };
            //Trigger the workflow
            await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, backendRequest.user_id);

            return Promise.resolve(job_id.toString());
        } catch (error) {
            throw error;
        }
    }
}

const oswService: IOswService = new OswService(jobService, tdeiCoreService);
export default oswService;

