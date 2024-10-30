import { ValidationError, validate } from "class-validator";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import { ServiceEntity } from "../database/entity/service-entity";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException, ServiceNotFoundException } from "../exceptions/http/http-exceptions";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import { DatasetDTO } from "../model/dataset-dto";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";
import { Geometry, Feature } from "geojson";
import { QueryConfig } from "pg";
import { DatasetQueryParams, RecordStatus } from "../model/dataset-get-query-params";
import { ConfidenceJobResponse } from "../model/job-request-response/osw-confidence-job-response";
import { TdeiDate } from "../utility/tdei-date";
import { MetadataModel } from "../model/metadata.model";
import { JobStatus, JobType, TDEIDataType, TDEIRole } from "../model/jobs-get-query-params";
import Ajv, { ErrorObject } from "ajv";
import metaschema from "../../schema/metadata.schema.json";
import { CloneContext, IDatasetCloneRequest } from "../model/request-interfaces";
import storageService from "./storage-service";
import path from "path";
import { Readable } from "stream";
import { WorkflowName } from "../constants/app-constants";
import { CreateJobDTO } from "../model/job-dto";
import jobService from "./job-service";
import appContext from "../app-context";
import { environment } from "../environment/environment";
import fetch from "node-fetch";

const ajv = new Ajv({ allErrors: true });
const metadataValidator = ajv.compile(metaschema);
class TdeiCoreService implements ITdeiCoreService {
    constructor() { }

    /*
     Send the email to the user with the password recovery link
     *@param email - The email of the user
     */
    async verifyEmail(email: string): Promise<Boolean> {
        try {
            let requestBody = {
                "username": email,
                "email_actions": [
                    "VERIFY_EMAIL"
                ]
            }
            const result = await fetch(environment.triggerEmailUrl as string, {
                method: 'post',
                body: JSON.stringify(requestBody),
                headers: { 'Content-Type': 'application/json' }
            });

            let data;
            try {
                data = await result.text();
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    // data is not JSON, so leave it as text
                }
            } catch (e) {
                console.error('Failed to parse result', e);
            }

            if (result.status != undefined && result.status != 200)
                throw new HttpException(result.status, data);

            return Boolean(data);
        } catch (error: any) {
            console.error(error);
            if (error instanceof HttpException) {
                if (error.status == 404)
                    throw new InputException("User not found");
                throw error;
            }

            throw new Error("Error while sending the email verification link");
        }
    }

    /*
     Send the email to the user with the password recovery link
     *@param email - The email of the user
     */
    async recoverPassword(email: string): Promise<Boolean> {
        try {
            let requestBody = {
                "username": email,
                "email_actions": [
                    "UPDATE_PASSWORD"
                ]
            }
            const result = await fetch(environment.triggerEmailUrl as string, {
                method: 'post',
                body: JSON.stringify(requestBody),
                headers: { 'Content-Type': 'application/json' }
            });

            let data;
            try {
                data = await result.text();
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    // data is not JSON, so leave it as text
                }
            } catch (e) {
                console.error('Failed to parse result', e);
            }

            if (result.status != undefined && result.status != 200)
                throw new HttpException(result.status, data);

            return Boolean(data);
        } catch (error: any) {
            console.error(error);
            if (error instanceof HttpException) {
                if (error.status == 404)
                    throw new InputException("User not found");
                throw error;
            }

            throw new Error("Error while sending the password recovery email");
        }
    }

    /**
     * Edits the metadata of a TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param metadataFile - The metadata file to be edited.
     * @param user_id - The ID of the user performing the edit.
     * @param data_type - The type of TDEI data.
     * @returns A Promise that resolves when the metadata is successfully edited.
     */
    async editMetadata(tdei_dataset_id: string, metadataFile: any, user_id: string, data_type: TDEIDataType): Promise<string> {
        let dataset_to_be_edited = await this.getDatasetDetailsById(tdei_dataset_id);
        const metadataBuffer = JSON.parse(metadataFile.buffer);
        const metadata = MetadataModel.from(metadataBuffer);
        await this.validateMetadata(metadata, data_type, tdei_dataset_id);
        //Date handling
        metadata.dataset_detail.collection_date = TdeiDate.UTC(metadata.dataset_detail.collection_date);

        //Valid from and valid to fields are mandatory when record in publish state
        if (dataset_to_be_edited.status == RecordStatus["Publish"] &&
            (!metadata.dataset_detail.valid_from || !metadata.dataset_detail.valid_to)) {
            {
                throw new InputException(`Valid from and valid to dates are required for publishing the dataset.`);
            }
        }

        if (metadata.dataset_detail.valid_from && metadata.dataset_detail.valid_to?.trim() != "")
            metadata.dataset_detail.valid_from = TdeiDate.UTC(metadata.dataset_detail.valid_from);
        else
            metadata.dataset_detail.valid_from = null;

        if (metadata.dataset_detail.valid_to && metadata.dataset_detail.valid_to?.trim() != "")
            metadata.dataset_detail.valid_to = TdeiDate.UTC(metadata.dataset_detail.valid_to);
        else
            metadata.dataset_detail.valid_to = null;


        //Update the metadata
        const query = {
            text: 'UPDATE content.dataset SET metadata_json = $1, updated_at = CURRENT_TIMESTAMP , updated_by = $2 WHERE tdei_dataset_id = $3',
            values: [MetadataModel.flatten(metadata), user_id, tdei_dataset_id],
        }
        await dbClient.query(query);

        const url = new URL(dataset_to_be_edited.metadata_url);
        const filePath = url.pathname;
        const fileComponents = filePath.split('/');
        const containerName = fileComponents[1];
        const fileRelativePath = fileComponents.slice(2).join('/');

        // Upload the metadata file  
        await storageService.uploadFile(fileRelativePath, 'text/json', Readable.from(metadataFile.buffer), containerName);

        //Create job
        let job = CreateJobDTO.from({
            data_type: TDEIDataType.osw,
            job_type: JobType["Edit-Metadata"],
            status: JobStatus["IN-PROGRESS"],
            message: 'Job started',
            request_input: {
                tdei_dataset_id: tdei_dataset_id,
                metadata_file_upload_name: metadataFile.originalname
            },
            user_id: user_id,
            tdei_project_group_id: dataset_to_be_edited.tdei_project_group_id
        });

        const job_id = await jobService.createJob(job);

        //Compose the meessage
        let workflow_start = dataset_to_be_edited.data_type == TDEIDataType.osw ? WorkflowName.build_osw_osm_dataset_download : WorkflowName.build_dataset_download;
        let workflow_input = {
            job_id: job_id.toString(),
            user_id: user_id,// Required field for message authorization
            tdei_dataset_id: tdei_dataset_id,
            dataset_url: decodeURIComponent(dataset_to_be_edited.latest_dataset_url),
            metadata_url: decodeURIComponent(dataset_to_be_edited.metadata_url),
            changeset_url: dataset_to_be_edited.changeset_url ? decodeURIComponent(dataset_to_be_edited.changeset_url) : "",
            dataset_osm_url: dataset_to_be_edited.latest_osm_url ? decodeURIComponent(dataset_to_be_edited.latest_osm_url) : ""
        };
        //Trigger the workflow
        await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);
        console.log(`Edit metadata job started with job_id: ${job_id}`);

        return job_id.toString();
    }

    /**
     * Validates the metadata for a given data type.
     * 
     * @param metadata - The metadata to be validated.
     * @param data_type - The type of data being validated.
     * @param tdei_dataset_id - The ID of the TDEI dataset. (Optional) Used for Edit Metadata.
     * @returns A Promise that resolves to a boolean indicating whether the metadata is valid.
     * @throws {InputException} If the metadata is invalid or if the data type is not supported.
     */
    async validateMetadata(metadata: MetadataModel, data_type: TDEIDataType, tdei_dataset_id?: string): Promise<boolean> {
        //Validate metadata
        const valid = metadataValidator(metadata);
        if (!valid) {
            let requiredMsg = metadataValidator.errors?.filter(z => z.keyword == "required").map((error: ErrorObject) => `${error.instancePath} : ${error.params.missingProperty}`).join(`, \n`);
            let additionalMsg = metadataValidator.errors?.filter(z => z.keyword == "additionalProperties").map((error: ErrorObject) => `${error.params.additionalProperty}`).join(`, \n`);
            let typeMsg = metadataValidator.errors?.filter(z => z.keyword == "type").map((error: ErrorObject) => `${error.instancePath} ${error.message}`).join(`, \n`);
            requiredMsg = requiredMsg != "" ? `Missing required properties : \n ${requiredMsg} ` : "";
            //get type mismatch error
            additionalMsg = additionalMsg != "" ? `\n Additional properties found are not allowed : \n ${additionalMsg} ` : "";
            typeMsg = typeMsg != "" ? `\n Type mismatch found : \n ${typeMsg}  mismatched` : "";
            console.error("Metadata json validation error : ", additionalMsg, requiredMsg, typeMsg);
            throw new InputException((`Metadata error : ${requiredMsg} \n ${additionalMsg} \n ${typeMsg}`) as string);
        }

        switch (data_type) {
            case "osw":
                if (!["v0.2"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Metadata->dataset_detail : Schema version is not supported. Please use v0.2 schema version.");
                break;
            case "pathways":
                if (!["v1.0"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Metadata->dataset_detail : Schema version is not supported. Please use v1.0 schema version.");
                break;
            case "flex":
                if (!["v2.0"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Metadata->dataset_detail : Schema version is not supported. Please use v2.0 schema version.");
                break;
            default:
                throw new InputException("Invalid data type");
        }

        //Check for unique name and version combination
        if (tdei_dataset_id && await this.checkMetaNameAndVersionUnique(metadata.dataset_detail.name, metadata.dataset_detail.version, tdei_dataset_id))
            throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")
        if (!tdei_dataset_id && await this.checkMetaNameAndVersionUnique(metadata.dataset_detail.name, metadata.dataset_detail.version))
            throw new InputException("Record already exists for Name and Version specified in metadata. Suggest to please update the name or version and request for upload with updated metadata")

        return true;
    }

    /*
       Validates the dataset dates.
       @param dataset - The dataset to validate.
       @throws {InputException}
       */
    validateDatasetDates(dataset: DatasetEntity): Boolean {
        if (!dataset.valid_from || !dataset.valid_to)
            throw new InputException(`Valid from and valid to dates are required for publishing the dataset.`);
        if (!TdeiDate.isValid(dataset.valid_from))
            throw new InputException(`Invalid valid_from date.`);
        if (!TdeiDate.isValid(dataset.valid_to))
            throw new InputException(`Invalid valid_to date.`);
        if (TdeiDate.UTC(dataset.valid_from) > TdeiDate.UTC(dataset.valid_to))
            throw new InputException(`Invalid valid_from date. valid_from should be less than or equal to valid_to.`);
        if (TdeiDate.UTC(dataset.valid_to) < TdeiDate.UTC(dataset.valid_from))
            throw new InputException(`Invalid valid_to date. valid_to should be greater than or equal to valid_from.`);

        return true;
    }

    /**
     * Retrieves datasets based on the provided user ID and query parameters.
     * @param user_id The ID of the user.
     * @param params The query parameters for filtering datasets.
     * @returns A promise that resolves to an array of DatasetDTO objects.
     */
    async getDatasets(user_id: string, params: DatasetQueryParams): Promise<DatasetDTO[]> {

        const queryObject = params.getQuery(user_id);

        const queryConfig = <QueryConfig>{
            text: queryObject.text,
            values: queryObject.values
        }

        const result = await dbClient.query(queryConfig);

        const list: DatasetDTO[] = result.rows.map(x => {
            const osw = DatasetDTO.from(x);
            // osw.name = x.dataset_name;
            osw.metadata = MetadataModel.unflatten(x.metadata_json);
            osw.service = {
                name: x.service_name,
                tdei_service_id: x.tdei_service_id,
            };
            osw.project_group = {
                name: x.project_group_name,
                tdei_project_group_id: x.tdei_project_group_id,
            };
            if (osw.metadata.dataset_detail.dataset_area) {
                const polygon = JSON.parse(x.dataset_area2) as Geometry;
                osw.metadata.dataset_detail.dataset_area = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            geometry: polygon,
                            properties: {}
                        } as Feature
                    ]
                }
            }
            return osw;
        })

        return list;
    }

    /**
     * Retrieves a FileEntity from the specified URL.
     * @param fullUrl The full URL of the file.
     * @returns A Promise that resolves to the FileEntity.
     */
    getFileEntity(fullUrl: string): Promise<FileEntity> {
        const storageClient = Core.getStorageClient();
        return storageClient!.getFileFromUrl(fullUrl);

    }

    /**
     * Creates a dataset.
     * 
     * @param datasetObj - The dataset object to be created.
     * @returns A promise that resolves to the created dataset DTO.
     * @throws {DuplicateException} If a duplicate dataset is detected.
     * @throws {Error} If an error occurs while saving the dataset version.
     */
    async createDataset(datasetObj: DatasetEntity): Promise<DatasetDTO> {
        try {
            datasetObj.dataset_url = decodeURIComponent(datasetObj.dataset_url!);

            await dbClient.query(datasetObj.getInsertQuery());
            const osw = DatasetDTO.from(datasetObj);
            return osw;
        } catch (error) {
            if (error instanceof UniqueKeyDbException) {
                throw new DuplicateException(datasetObj.tdei_dataset_id);
            }
            console.error(`Error saving the dataset version: ${datasetObj.tdei_dataset_id}`, error);
            throw error;
        }
    }

    /**
     * Checks if the name and version are unique.
     * @param name - The name of the metadata.
     * @param version - The version of the metadata.
     * @param tdei_dataset_id - The ID of the TDEI dataset. (Optional) Used for Edit Metadata.
     * @returns A promise that resolves to a boolean indicating whether the name and version are unique.
     */
    async checkMetaNameAndVersionUnique(name: string, version: string, tdei_dataset_id?: string): Promise<Boolean> {
        try {
            let queryText: string;
            let values: (string | number)[];

            if (!tdei_dataset_id) {
                queryText = `SELECT * FROM content.dataset WHERE name = $1 AND version = $2 AND status != 'Deleted'`;
                values = [name, version];
            } else {
                queryText = `SELECT * FROM content.dataset WHERE name = $1 AND version = $2 AND tdei_dataset_id != $3  AND status != 'Deleted'`;
                values = [name, version, tdei_dataset_id];
            }

            const queryObject = {
                text: queryText.replace(/\n/g, ""),
                values: values,
            };

            let result = await dbClient.query(queryObject);

            // If record exists then return true, else false
            return result.rowCount ? result.rowCount > 0 : false;

        } catch (error) {
            console.error("Error checking the name and version", error);
            return Promise.resolve(true);
        }
    }

    /**
     * Updates the confidence metric for a given TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param info - The confidence job response containing the updated confidence level and library version.
     * @returns A Promise that resolves with void when the update is successful, or rejects with an error if there's an issue.
     */
    async updateConfidenceMetric(tdei_dataset_id: string, info: ConfidenceJobResponse): Promise<void> {
        let confidence_level = 0;
        if (info.confidence_scores) {
            confidence_level = info.confidence_scores.features[0].properties.confidence_score;
        }
        try {
            const queryObject = {
                text: `UPDATE content.dataset SET 
                confidence_level = $1,
                cm_version = $2,
                cm_last_calculated_at = $3,
                updated_at = CURRENT_TIMESTAMP  
                WHERE 
                tdei_dataset_id = $4`,
                values: [confidence_level, info.confidence_library_version, TdeiDate.UTC(), tdei_dataset_id]
            }

            await dbClient.query(queryObject);
        } catch (error) {
            console.error(`Error updating the confidence metric for dataset: ${tdei_dataset_id} `, error);
            throw error;
        }
    }

    /**
     * Validates the metadata object.
     * @param metadataObj - The metadata object to be validated.
     * @returns A promise that resolves to a string containing validation error messages, or undefined if there are no errors.
     */
    async validateObject<T>(classObject: T): Promise<string | undefined> {
        let message;
        const metadata_result = await validate(classObject as object);

        if (metadata_result.length) {
            console.log('Input validation failed');
            message = metadata_result.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            return message;
        }
        return message;
    }

    /**
     * Retrieves a service by its ID.
     * @param service_id The ID of the service to retrieve.
     * @returns A Promise that resolves to the ServiceEntity if found, or undefined if not found.
     */
    async getServiceById(service_id: string): Promise<ServiceEntity | undefined> {
        try {
            const query = {
                text: 'Select * from public.service WHERE service_id = $1 AND is_active = true',
                values: [service_id],
            }

            const result = await dbClient.query(query);

            if (result.rowCount == 0)
                return undefined;

            let service = ServiceEntity.from(result.rows[0]);

            return service;
        } catch (error) {
            console.error(`Error while fetching the service details for service_id: ${service_id} `, error);
            return undefined;
        }
    }

    /**
     * Invalidates a record request.
     * 
     * @param user_id - The user ID.
     * @param tdei_dataset_id - The TDEI dataset ID.
     * @returns A promise that resolves to a boolean indicating whether the record request was invalidated successfully.
     * @throws {InputException} If the record request is not found.
     * @throws {Error} If there is an error invalidating the record request.
     */
    async invalidateRecordRequest(user_id: any, tdei_dataset_id: string): Promise<boolean> {
        try {
            const queryResult = await dbClient.query(DatasetEntity.getDeleteRecordQuery(tdei_dataset_id, user_id));
            if (queryResult.rowCount && queryResult.rowCount > 0) {
                return true;
            }

            throw new InputException(`${tdei_dataset_id} not found.`);

        } catch (error) {
            console.error(`Error invalidating the record for dataset_id: ${tdei_dataset_id} `, error);
            throw error;
        }
    }

    /**
     * Retrieves dataset details by ID.
     * @param id - The ID of the dataset.
     * @returns A promise that resolves to a DatasetEntity object representing the dataset details.
     * @throws HttpException with status 404 if the record is not found.
     * @throws HttpException with status 400 if the request record is invalid or deleted.
     */
    async getDatasetDetailsById(id: string): Promise<DatasetEntity> {
        const query = {
            text: `Select * from content.dataset WHERE tdei_dataset_id = $1`,
            values: [id],
        }

        const result = await dbClient.query(query);

        if (result.rowCount == 0)
            throw new HttpException(404, `Dataset with id: ${id} not found`);

        if (result.rows[0].status == "Deleted")
            throw new HttpException(400, `Requested dataset with id: ${id} is invalid / deleted`);

        const record = result.rows[0];
        const osw = DatasetEntity.from(record);

        return osw;
    }

    /**
     * Checks if a project group exists by its ID.
     * @param id - The ID of the project group.
     * @returns A promise that resolves to a boolean indicating whether the project group was found.
     * @throws HttpException with status 404 if the project group is not found.
     */
    async checkProjectGroupExistsById(id: string): Promise<Boolean> {
        const query = {
            text: `Select count(*) from public.project_group WHERE project_group_id = $1`,
            values: [id],
        }
        const result = await dbClient.query(query);
        if (result.rowCount == 0)
            throw new HttpException(404, `Project Group with id: ${id} not found`);
        return true;
    }

    /**
     * Deletes a draft dataset with the specified ID from the content.dataset table.
     * 
     * @param tdei_dataset_id - The ID of the draft dataset to delete.
     * @returns A Promise that resolves to void.
     */
    async deleteDraftDataset(tdei_dataset_id: string): Promise<void> {
        const query = {
            text: `DELETE FROM content.dataset WHERE tdei_dataset_id = $1 AND status = 'Draft'`,
            values: [tdei_dataset_id],
        }
        const result = await dbClient.query(query);
        if (result.rowCount && result.rowCount == 0) {
            console.log(`Draft dataset with id: ${tdei_dataset_id} not found or not in draft status`);
        }
    }

    /**
  * Clones a dataset.
  * 
  * @param datasetCloneRequestObject - The dataset clone request object.
  * @returns A Promise that resolves to a boolean indicating whether the dataset was cloned successfully.
  */
    async cloneDataset(datasetCloneRequestObject: IDatasetCloneRequest): Promise<{ new_tdei_dataset_id: string, job_id: string }> {

        let cloneContext: CloneContext = {
            db_clone_dataset_updated: false,
            blob_clone_uploaded: false,
            osw_dataset_elements_cloned: false,
            dest_changeset_upload_entity: undefined,
            dest_dataset_upload_entity: undefined,
            dest_metadata_upload_entity: undefined,
            dest_osm_upload_entity: undefined,
            new_tdei_dataset_id: "",
        };

        try {
            let dataset_to_be_clone = await this.getDatasetDetailsById(datasetCloneRequestObject.tdei_dataset_id);

            const service = await this.getServiceById(datasetCloneRequestObject.tdei_service_id);
            if (!service) {
                throw new ServiceNotFoundException(datasetCloneRequestObject.tdei_service_id);
            } else if (service!.service_type != dataset_to_be_clone.data_type) {
                throw new InputException(`Operation not permitted : Trying to clone dataset type ${dataset_to_be_clone.data_type} to a service of type : ${service!.service_type}`);
            }
            //Validate service owner project group is same as the request project group
            else if (service!.owner_project_group != datasetCloneRequestObject.tdei_project_group_id) {
                throw new InputException(`${datasetCloneRequestObject.tdei_project_group_id} id not associated with the tdei_service_id`);
            }

            let metadata = JSON.parse(datasetCloneRequestObject.metafile!.buffer);
            const metaObj = MetadataModel.from(metadata);
            await this.validateMetadata(metaObj, dataset_to_be_clone.data_type as TDEIDataType);

            //Check 'pre-release' dataset belongs to user project group id
            await this.preReleaseCheck(dataset_to_be_clone, datasetCloneRequestObject);

            //Date handling for metadata
            metadata.dataset_detail.collection_date = TdeiDate.UTC(metadata.dataset_detail.collection_date);
            metadata.dataset_detail.valid_from = TdeiDate.UTC(metadata.dataset_detail.valid_from);
            metadata.dataset_detail.valid_to = TdeiDate.UTC(metadata.dataset_detail.valid_to);
            //Flatten metadata for persistence
            let flat_meta = MetadataModel.flatten(metadata);

            let queryConfig: QueryConfig = {
                text: `SELECT content.tdei_clone_dataset($1, $2, $3, $4, $5)`.replace(/\n/g, ""),
                values: [
                    datasetCloneRequestObject.tdei_dataset_id,
                    datasetCloneRequestObject.tdei_project_group_id,
                    datasetCloneRequestObject.tdei_service_id,
                    flat_meta,
                    datasetCloneRequestObject.user_id
                ]
            };
            let result = await dbClient.query(queryConfig);
            cloneContext.new_tdei_dataset_id = result.rows[0].tdei_clone_dataset;
            cloneContext.db_clone_dataset_updated = true;

            await this.cloneBlob(dataset_to_be_clone, datasetCloneRequestObject, cloneContext);

            if (dataset_to_be_clone.data_type == TDEIDataType.osw) {

                let clone_dataset_query: QueryConfig = {
                    text: `Select content.tdei_clone_osw_dataset_elements($1, $2, $3)`.replace(/\n/g, ""),
                    values: [
                        datasetCloneRequestObject.tdei_dataset_id,
                        cloneContext.new_tdei_dataset_id,
                        datasetCloneRequestObject.user_id
                    ]
                };
                await dbClient.query(clone_dataset_query);
                cloneContext.osw_dataset_elements_cloned = true;
            }

            //Final Step: Mark the cloned dataset as 'Pre-release'
            let condition = new Map<string, string>();
            condition.set("tdei_dataset_id", cloneContext.new_tdei_dataset_id);
            let updateFields = new DatasetEntity({
                status: RecordStatus["Pre-Release"]
            });
            await dbClient.query(DatasetEntity.getUpdateQuery(condition, updateFields));

            let job_id = this.triggerCloneWorkflow(cloneContext, dataset_to_be_clone, cloneContext.new_tdei_dataset_id, datasetCloneRequestObject.user_id, datasetCloneRequestObject);

            return { new_tdei_dataset_id: cloneContext.new_tdei_dataset_id, job_id: (await job_id).toString() };
        } catch (error) {
            console.error(`Error cloning the dataset: ${datasetCloneRequestObject.tdei_dataset_id} `, error);
            //Clean up
            if (cloneContext.db_clone_dataset_updated) {
                //Delete the cloned dataset
                await this.deleteDraftDataset(cloneContext.new_tdei_dataset_id);
            }
            if (cloneContext.blob_clone_uploaded) {
                //Delete the cloned blobs
                if (cloneContext.dest_dataset_upload_entity) await storageService.deleteFile(cloneContext.dest_dataset_upload_entity.remoteUrl);
                if (cloneContext.dest_metadata_upload_entity) await storageService.deleteFile(cloneContext.dest_metadata_upload_entity);
                if (cloneContext.dest_changeset_upload_entity) await storageService.deleteFile(cloneContext.dest_changeset_upload_entity.remoteUrl);
                if (cloneContext.dest_osm_upload_entity) await storageService.deleteFile(cloneContext.dest_osm_upload_entity.remoteUrl);
            }
            if (cloneContext.osw_dataset_elements_cloned) {
                //Delete the cloned dataset elements
                let delete_dataset_elements_query: QueryConfig = {
                    text: `SELECT content.tdei_delete_osw_dataset_elements($1)`.replace(/\n/g, ""),
                    values: [cloneContext.new_tdei_dataset_id]
                };
                await dbClient.query(delete_dataset_elements_query);
            }
            throw error;
        }


    }


    /**
     * Triggers the clone workflow for a dataset.
     * 
     * @param cloneContext - The clone context.
     * @param dataset_to_be_clone - The dataset to be cloned.
     * @param new_tdei_dataset_id - The ID of the new TDEI dataset.
     * @param user_id - The ID of the user triggering the workflow.
     * @param datasetCloneRequestObject - The dataset clone request object.
     * @returns The ID of the job created for the clone workflow.
     */
    async triggerCloneWorkflow(cloneContext: CloneContext, dataset_to_be_clone: DatasetEntity, new_tdei_dataset_id: string, user_id: string, datasetCloneRequestObject: IDatasetCloneRequest) {
        //Create job
        let job = CreateJobDTO.from({
            data_type: TDEIDataType.osw,
            job_type: JobType["Clone-Dataset"],
            status: JobStatus["IN-PROGRESS"],
            message: 'Job started',
            request_input: {
                to_be_cloned_tdei_dataset_id: datasetCloneRequestObject.tdei_dataset_id,
                new_tdei_dataset_id: new_tdei_dataset_id
            },
            user_id: user_id,
            tdei_project_group_id: datasetCloneRequestObject.tdei_project_group_id
        });

        const job_id = await jobService.createJob(job);

        //Compose the meessage
        let workflow_start = dataset_to_be_clone.data_type == TDEIDataType.osw ? WorkflowName.build_osw_osm_dataset_download : WorkflowName.build_dataset_download;
        let workflow_input = {
            job_id: job_id.toString(),
            user_id: user_id,// Required field for message authorization
            tdei_dataset_id: new_tdei_dataset_id,
            dataset_url: decodeURIComponent(cloneContext.dest_dataset_upload_entity!.remoteUrl),
            metadata_url: decodeURIComponent(cloneContext.dest_metadata_upload_entity!),
            changeset_url: cloneContext.dest_changeset_upload_entity ? decodeURIComponent(cloneContext.dest_changeset_upload_entity!.remoteUrl) : "",
            dataset_osm_url: cloneContext.dest_osm_upload_entity ? decodeURIComponent(cloneContext.dest_osm_upload_entity!.remoteUrl) : ""
        };
        //Trigger the workflow
        await appContext.orchestratorService_v2_Instance!.startWorkflow(job_id.toString(), workflow_start, workflow_input, user_id);
        console.log(`Clone dataset job started with job_id: ${job_id} `);

        return job_id.toString();
    }

    /**
     * Clones the blobs of a dataset.
     * 
     * @param dataset_to_be_clone - The dataset to be cloned.
     * @param datasetCloneRequestObject - The dataset clone request object.
     * @param cloneContext - The clone context object.
     * @returns A Promise that resolves when the blobs are successfully cloned.
     */
    async cloneBlob(dataset_to_be_clone: DatasetEntity, datasetCloneRequestObject: IDatasetCloneRequest, cloneContext: CloneContext) {
        let containerName = '';
        switch (dataset_to_be_clone.data_type) {
            case TDEIDataType.osw:
                containerName = 'osw';
                break;
            case TDEIDataType.flex:
                containerName = 'gtfsflex';
                break;
            case TDEIDataType.pathways:
                containerName = 'gtfspathways';
                break;
        }

        const storageFolderPath = storageService.getFolderPath(datasetCloneRequestObject.tdei_project_group_id, cloneContext.new_tdei_dataset_id);

        // Clone dataset file
        let datasetFileName = storageService.getStorageFileNameFromUrl(dataset_to_be_clone.latest_dataset_url);
        const datasetUploadStoragePath = path.join(storageFolderPath, datasetFileName);
        cloneContext.dest_dataset_upload_entity = await storageService.cloneFile(dataset_to_be_clone.latest_dataset_url, containerName, datasetUploadStoragePath);


        // Clone the metadata file  
        const metadataStorageFilePath = path.join(storageFolderPath, 'metadata.json');
        cloneContext.dest_metadata_upload_entity = await storageService.uploadFile(metadataStorageFilePath, 'text/json', Readable.from(datasetCloneRequestObject.metafile.buffer), containerName);

        // Clone the changeset file  
        if (dataset_to_be_clone.changeset_url) {
            const changesetStorageFilePath = path.join(storageFolderPath, 'changeset.zip');
            cloneContext.dest_changeset_upload_entity = await storageService.cloneFile(dataset_to_be_clone.changeset_url, containerName, changesetStorageFilePath);
        }

        //clone osm file
        if (dataset_to_be_clone.latest_osm_url) {
            let osmFileName = storageService.getStorageFileNameFromUrl(dataset_to_be_clone.latest_osm_url);
            const osmUploadStoragePath = path.join(storageFolderPath, osmFileName);
            cloneContext.dest_osm_upload_entity = await storageService.cloneFile(dataset_to_be_clone.latest_osm_url, containerName, osmUploadStoragePath);
        }


        cloneContext.blob_clone_uploaded = true;
        //build where clause
        let condition = new Map<string, string>();
        condition.set("tdei_dataset_id", cloneContext.new_tdei_dataset_id);
        //build update fields
        let updateFields = new DatasetEntity({
            dataset_url: decodeURIComponent(cloneContext.dest_dataset_upload_entity!.remoteUrl),
            latest_dataset_url: decodeURIComponent(cloneContext.dest_dataset_upload_entity!.remoteUrl),
            metadata_url: decodeURIComponent(cloneContext.dest_metadata_upload_entity),
            changeset_url: cloneContext.dest_changeset_upload_entity ? decodeURIComponent(cloneContext.dest_changeset_upload_entity!.remoteUrl) : undefined,
            osm_url: cloneContext.dest_osm_upload_entity ? decodeURIComponent(cloneContext.dest_osm_upload_entity!.remoteUrl) : undefined,
            latest_osm_url: cloneContext.dest_osm_upload_entity ? decodeURIComponent(cloneContext.dest_osm_upload_entity!.remoteUrl) : undefined,
        });
        // //Update the cloned dataset with new urls
        await dbClient.query(DatasetEntity.getUpdateQuery(condition, updateFields));
    }

    /**
     * Validates the user permission to clone a dataset.
     * 
     * @param dataset_to_be_clone - The dataset to be cloned.
     * @param datasetCloneRequestObject - The dataset clone request object.
     * @returns A Promise that resolves when the user has permission to clone the dataset.
     * @throws {InputException} If the user does not have permission to clone the dataset.
     */
    async preReleaseCheck(dataset_to_be_clone: DatasetEntity, datasetCloneRequestObject: IDatasetCloneRequest) {
        if (dataset_to_be_clone.status == RecordStatus["Pre-Release"] && !datasetCloneRequestObject.isAdmin) {
            let role_to_check = "";
            if (dataset_to_be_clone.data_type == TDEIDataType.osw) {
                role_to_check = TDEIRole.osw_data_generator;
            } else if (dataset_to_be_clone.data_type == TDEIDataType.flex) {
                role_to_check = TDEIRole.flex_data_generator;
            } else if (dataset_to_be_clone.data_type == TDEIDataType.pathways) {
                role_to_check = TDEIRole.pathways_data_generator;
            }

            let queryConfig: QueryConfig = {
                text: `SELECT * from public.user_roles ur
                INNER JOIN public.roles r on ur.role_id = r.role_id
                WHERE user_id = $1 AND project_group_id = $2 AND r.name IN('tdei_admin', 'poc', $3)`.replace(/\n/g, ""),
                values: [
                    datasetCloneRequestObject.user_id,
                    dataset_to_be_clone.tdei_project_group_id,
                    role_to_check
                ]
            };
            let result = await dbClient.query(queryConfig);

            if (result.rows.length == 0) {
                throw new InputException("User does not have permission to clone the dataset");
            }
        }
    }

    /**
     * Fetches the system metrics
     */
    async getSystemMetrics(): Promise<any> {
        try {
            const query = {
                text: 'SELECT * FROM content.tdei_fetch_system_metrics()',
            };
            var result = await dbClient.query(query);
            return result.rows[0].tdei_fetch_system_metrics;
        } catch (error: any) {
            console.error(error);
            throw new Error("Error fetching the system metrics");
        }
    }

    /**
    * Fetches the data metrics
    */
    async getDataMetrics(): Promise<any> {
        try {
            const query = {
                text: 'SELECT * FROM content.tdei_fetch_data_metrics()',
            };
            var result = await dbClient.query(query);
            return result.rows[0].tdei_fetch_data_metrics;
        } catch (error: any) {
            console.error(error);
            throw new Error("Error fetching the data metrics");
        }
    }
}

const tdeiCoreService = new TdeiCoreService();

export default tdeiCoreService;