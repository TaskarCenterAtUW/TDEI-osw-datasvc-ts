import { ValidationError, validate } from "class-validator";
import dbClient from "../database/data-source";
import { DatasetEntity } from "../database/entity/dataset-entity";
import { ServiceEntity } from "../database/entity/service-entity";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException } from "../exceptions/http/http-exceptions";
import { ITdeiCoreService } from "./interface/tdei-core-service-interface";
import UniqueKeyDbException from "../exceptions/db/database-exceptions";
import { DatasetDTO } from "../model/dataset-dto";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";
import { Geometry, Feature } from "geojson";
import { QueryConfig } from "pg";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import { ConfidenceJobResponse } from "../model/job-request-response/osw-confidence-job-response";
import { TdeiDate } from "../utility/tdei-date";
import { MetadataModel } from "../model/metadata.model";
import { TDEIDataType } from "../model/jobs-get-query-params";
import Ajv, { ErrorObject } from "ajv";
import metaschema from "../../schema/metadata.schema.json";

const ajv = new Ajv({ allErrors: true });
const metadataValidator = ajv.compile(metaschema);
class TdeiCoreService implements ITdeiCoreService {
    constructor() { }

    /**
     * Edits the metadata of a TDEI dataset.
     * 
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param metadataFile - The metadata file to be edited.
     * @param user_id - The ID of the user performing the edit.
     * @param data_type - The type of TDEI data.
     * @returns A Promise that resolves when the metadata is successfully edited.
     */
    async editMetadata(tdei_dataset_id: string, metadataFile: any, user_id: string, data_type: TDEIDataType): Promise<void> {
        const metadataBuffer = JSON.parse(metadataFile.buffer);
        const metadata = MetadataModel.from(metadataBuffer);
        await this.validateMetadata(metadata, data_type, tdei_dataset_id);
        //Date handling
        metadata.dataset_detail.collection_date = TdeiDate.UTC(metadata.dataset_detail.collection_date);
        metadata.dataset_detail.valid_from = TdeiDate.UTC(metadata.dataset_detail.valid_from);
        metadata.dataset_detail.valid_to = TdeiDate.UTC(metadata.dataset_detail.valid_to);
        //Update the metadata
        const query = {
            text: 'UPDATE content.dataset SET metadata_json = $1, updated_at = CURRENT_TIMESTAMP , updated_by = $2 WHERE tdei_dataset_id = $3',
            values: [MetadataModel.flatten(metadata), user_id, tdei_dataset_id],
        }
        await dbClient.query(query);
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
            let requiredMsg = metadataValidator.errors?.filter(z => z.keyword == "required").map((error: ErrorObject) => `${error.params.missingProperty}`).join(", ");
            let additionalMsg = metadataValidator.errors?.filter(z => z.keyword == "additionalProperties").map((error: ErrorObject) => `${error.params.additionalProperty}`).join(", ");
            let typeMsg = metadataValidator.errors?.filter(z => z.keyword == "type").map((error: ErrorObject) => `${error.instancePath} ${error.message}`).join(", ");
            requiredMsg = requiredMsg != "" ? "Required properties : " + requiredMsg + " missing" : "";
            //get type mismatch error
            additionalMsg = additionalMsg != "" ? "Additional properties found : " + additionalMsg + " not allowed" : "";
            typeMsg = typeMsg != "" ? "Type mismatch found : " + typeMsg + " mismatched" : "";
            console.error("Metadata json validation error : ", additionalMsg, requiredMsg, typeMsg);
            throw new InputException((requiredMsg + "\n" + additionalMsg) as string);
        }

        switch (data_type) {
            case "osw":
                if (!["v0.2"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Schema version is not supported. Please use v0.2 schema version.");
                break;
            case "pathways":
                if (!["v1.0"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Schema version is not supported. Please use v0.2 schema version.");
                break;
            case "flex":
                if (!["v2.0"].includes(metadata.dataset_detail.schema_version))
                    throw new InputException("Schema version is not supported. Please use v0.2 schema version.");
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
                queryText = `SELECT * FROM content.dataset WHERE name=$1 AND version=$2 AND status != 'Deleted'`;
                values = [name, version];
            } else {
                queryText = `SELECT * FROM content.dataset WHERE name=$1 AND version=$2 AND tdei_dataset_id != $3  AND status != 'Deleted'`;
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
                cm_version= $2, 
                cm_last_calculated_at=$3,
                updated_at= CURRENT_TIMESTAMP  
                WHERE 
                tdei_dataset_id=$4`,
                values: [confidence_level, info.confidence_library_version, TdeiDate.UTC(), tdei_dataset_id]
            }

            await dbClient.query(queryObject);
        } catch (error) {
            console.error(`Error updating the confidence metric for dataset: ${tdei_dataset_id}`, error);
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
            console.error(`Error while fetching the service details for service_id: ${service_id}`, error);
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
            console.error(`Error invalidating the record for dataset_id: ${tdei_dataset_id}`, error);
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
            throw new HttpException(404, `Record with id: ${id} not found`);

        if (result.rows[0].status == "Deleted")
            throw new HttpException(400, `Requested record with id: ${id} is invalid/deleted`);

        const record = result.rows[0];
        const osw = DatasetEntity.from(record);

        return osw;
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

}

const tdeiCoreService: ITdeiCoreService = new TdeiCoreService();

export default tdeiCoreService;