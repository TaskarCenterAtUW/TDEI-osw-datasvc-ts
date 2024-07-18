import { QueryConfig } from "pg";
import dbClient from "../../database/data-source";
import { QueryCriteria } from "../../database/dynamic-update-query";
import path from "path";

export class OrchestratorFunctions {
    constructor() { }


    public static async bbox_response_validation(input: any): Promise<any> {
        try {
            if (input.success && input.file_upload_path.length == 0) {
                //Terminate the workflow as no further processing is required
                let where = new Map<string, string>();
                where.set("job_id", input.job_id);
                let data = {
                    "status": "COMPLETED",
                    "message": input.message
                };

                let query = new QueryCriteria()
                    .setTable("content.job")
                    .setData(data)
                    .setWhere(where);

                await dbClient.query(query.buildUpdateQuery());

                return Promise.resolve({
                    success: true,
                    terminate: true,
                    message: input.message
                });
            }
            else {
                return Promise.resolve({
                    success: true,
                    message: "Bbox response validated successfully"
                });
            }
        } catch (error) {
            return Promise.resolve({
                success: false,
                message: "Error while validating the bbox response"
            });
        }
    }

    /**
     * Delete the draft dataset
     * @param input 
     * @returns void
     */
    public static async delete_draft_dataset(input: any): Promise<any> {
        try {
            const queryConfig = <QueryConfig>{
                text: `DELETE FROM content.dataset WHERE tdei_dataset_id = $1`,
                values: [input.tdei_dataset_id]
            }
            await dbClient.query(queryConfig);
            return Promise.resolve({
                success: true,
                message: "Draft dataset deleted successfully"
            });

        } catch (error) {
            return Promise.resolve({
                success: false,
                message: "Error while deleting draft dataset"
            });
        }
    }

    /**
     * Update the database table
     * @param input 
     * @returns void
     */
    public static async update_table(input: any): Promise<any> {

        try {
            let where = new Map<string, string>();
            for (let key in input.where) {
                where.set(key, input.where[key]);
            }

            let query = new QueryCriteria()
                .setTable(input.table)
                .setData(input.data)
                .setWhere(where);

            await dbClient.query(query.buildUpdateQuery());

            return Promise.resolve({
                success: true,
                message: "Table updated successfully"
            });
        } catch (e) {
            console.error("Error while updating table", e);
            return Promise.resolve({
                success: false,
                message: "Error while updating table" + e + ", Input : " + input
            });
        }
    }

    /**
     * Get the dataset blob folder path for osw , osm
     * @param blobUrl 
     * @param tdei_dataset_id 
     * @returns folder path
     */
    static async get_osw_osm_dataset_blob_folder_zip_path(input: any): Promise<any> {
        let blobUrl: string = input.blobUrl;
        let tdei_dataset_id: string = input.tdei_dataset_id;
        try {
            let directory = path.dirname(blobUrl);
            let osm_output_path = `${directory}/zip/${tdei_dataset_id}.osm.zip`;
            let osw_output_path = `${directory}/zip/${tdei_dataset_id}.osw.zip`;
            return Promise.resolve({
                success: true,
                message: "Folder path generated successfully",
                osm_output_path: osm_output_path,
                osw_output_path: osw_output_path
            });
        } catch (error) {
            console.error("Error while generating blob folder path", error);
            return Promise.resolve({
                success: false,
                message: "Error while generating blob folder path",
                folder_path: ""
            });
        }
    }

    /**
     * Get the dataset blob folder path  
     * @param blobUrl 
     * @param tdei_dataset_id 
     * @returns folder path
     */
    static async get_blob_folder_path_wo_ext(input: any): Promise<any> {
        let blobUrl: string = input.blobUrl;
        let identifier: string = input.identifier;
        try {
            let directory = path.dirname(blobUrl);
            let output_path = `${directory}/zip/${identifier}`;
            return Promise.resolve({
                success: true,
                message: "Folder path generated successfully",
                folder_path: output_path
            });
        } catch (error) {
            console.error("Error while generating blob folder path", error);
            return Promise.resolve({
                success: false,
                message: "Error while generating blob folder path",
                folder_path: ""
            });
        }
    }

    /**
     * Function to invoke the method based on the method name
     * @param methodName
     * @param args
     * @returns response of method
     */
    static async invokeMethod(methodName: string, ...args: any[]): Promise<any> {
        // Check if the method exists on the class instance
        if (typeof (this as any)[methodName] === 'function') {
            return await (this as any)[methodName](...args);
        } else {
            console.log(`Method ${methodName} does not exist on OrchestratorFunctions.`);
            return {
                success: false,
                message: `Method ${methodName} does not exist on OrchestratorFunctions.`
            };
        }
    }
}