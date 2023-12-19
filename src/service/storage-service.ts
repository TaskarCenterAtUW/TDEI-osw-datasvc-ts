/**
 * Generic class to store the files in the system
 */
import { randomUUID } from "crypto";
// import { StorageClient } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";

class StorageService {

    generateRandomUUID(): string {
        const randomUID = randomUUID().toString().replace(/-/g, ''); // Take out the - from UID
        return randomUID;
    }

    /**
     * Generates the folder path for the given record
     * @param projectGroupId ID of the  project group
     * @param recordId ID of the record
     * @returns string with path
     */
    getFolderPath(tdeiServiceId: string, recordId: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        return year + '/' + month + '/' + tdeiServiceId + '/' + recordId;
    }

    getFormatJobPath(uid: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        return 'jobs/' + year + '/' + month + '/' + uid;
    }

    /**
     * Upload the file to storage
     * @param filePath File path of the file
     * @param type mimetype of the file
     * @param body Readable stream of the body
     * @param containerName Name of the container. defaults to gtfs-osw
     */
    async uploadFile(filePath: string, type: string = 'application/zip', body: NodeJS.ReadableStream, containerName: string = 'osw') {
        const client = Core.getStorageClient();
        const container = await client?.getContainer(containerName);
        const file = container?.createFile(filePath, type);
        const uploadedEntity = await file?.upload(body);
        return uploadedEntity!.remoteUrl;
    }
}

const storageService: StorageService = new StorageService();
export default storageService;
