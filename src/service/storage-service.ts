/**
 * Generic class to store the files in the system
 */
import { randomUUID } from "crypto";
// import { StorageClient } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";

class StorageService {

    generateRandomUUID():string {
        const randomUID = randomUUID().toString().replace(/-/g,''); // Take out the - from UID
        return randomUID;
    }

    /**
     * Generates the folder path for the given record
     * @param orgId ID of the organization
     * @param recordId ID of the record
     * @returns string with path
     */
    getFolderPath(tdeiOrgId:string, recordId:string):string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth()+1;
        
        return year+'/'+month+'/'+tdeiOrgId+'/'+recordId;
    }

    /**
     * Upload the file to storage
     * @param filePath File path of the file
     * @param type mimetype of the file
     * @param body Readable stream of the body
     * @param containerName Name of the container. defaults to gtfs-flex
     */
    async uploadFile(filePath:string, type:string = 'application/zip' ,body:NodeJS.ReadableStream, containerName:string = 'osw'){
        const client = Core.getStorageClient();
        const container = await client?.getContainer(containerName);
        const file = container?.createFile(filePath, type);
        const uploadedEntity = await file?.upload(body);
        // need to get the full path here and return
        // console.log('File path',uploadedEntity!.filePath);
        // console.log('File name',uploadedEntity?.fileName);
        // const otherEntity = await client?.getFile(containerName,uploadedEntity!.filePath);
        // console.log(otherEntity?.filePath);
        return uploadedEntity!.remoteUrl; 
    }
}

const storageService: StorageService = new StorageService();
export default storageService;
