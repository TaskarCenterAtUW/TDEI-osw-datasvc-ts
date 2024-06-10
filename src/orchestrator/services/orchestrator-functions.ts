import dbClient from "../../database/data-source";
import { QueryCriteria } from "../../database/dynamic-update-query";
import path from "path";

export class OrchestratorFunctions {
    constructor() { }

    /**
     * Function to decode the url
     * @param url
     * @returns decoded url
     **/
    public static decode_url(url: string): Promise<any> {
        try {
            return Promise.resolve({
                sucess: true,
                message: "Url decoded successfully",
                url: decodeURIComponent(url)
            });
        } catch (e) {
            return Promise.resolve({
                sucess: false,
                message: "Error while decoding url",
                url: url
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
            return Promise.resolve({
                success: false,
                message: "Error while updating table" + e + ", Input : " + input
            });
        }
    }

    /**
     * Get the dataset blob folder path
     * @param blobUrl 
     * @param tdei_dataset_id 
     * @returns folder path
     */
    static async get_dataset_blob_folder_path(blobUrl: string, tdei_dataset_id: string): Promise<any> {
        try {
            let directory = path.dirname(blobUrl);
            let output_path = directory + '/zip/' + tdei_dataset_id + '.zip';
            return Promise.resolve({
                success: true,
                message: "Folder path generated successfully",
                folder_path: output_path
            });
        } catch (error) {
            return Promise.resolve({
                success: false,
                message: "Error while generating folder path",
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