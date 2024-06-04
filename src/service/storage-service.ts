/**
 * Generic class to store the files in the system
 */
import { randomUUID } from "crypto";
// import { StorageClient } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";

class StorageService {

    generateRandomUUID(): string {
        // const randomUID = randomUUID().toString().replace(/-/g, ''); // Take out the - from UID
        return randomUUID().toString();
    }

    getStorageFileNameFromUrl(fullUrl: string): string {
        let url = new URL(fullUrl);
        let pathname = url.pathname;
        let filenameWithExtension = pathname.split("/").pop();
        let filenameWithoutExtension = filenameWithExtension!.split(".").slice(0, -1).join(".");
        return filenameWithoutExtension;
    }

    /**
     * Generates the folder path for the given record
     * @param projectGroupId ID of the  project group
     * @param recordId ID of the record
     * @returns string with path
     */
    getFolderPath(projectGroupId: string, recordId: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        return year + '/' + month + '/' + projectGroupId + '/' + recordId;
    }

    getFormatJobPath(uid: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        return 'jobs/formatting/' + year + '/' + month + '/' + uid;
    }

    getConfidenceJobPath(uid: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        return 'jobs/confidence/' + year + '/' + month + '/' + uid;
    }

    getValidationJobPath(uid: string): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        return 'jobs/validation/' + year + '/' + month + '/' + uid;
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

    /**
     * Clones a file from one container to another
     * @param fileUrl file url. 
     * @param destinationContainerName Destination container name
     * @param destinationFilePath Destination file path, full path from container root. ex. /path/to/file.txt
     * @returns a promise of the file entity
     */
    async cloneFile(fileUrl: string, destinationContainerName: string, destinationFilePath: string): Promise<FileEntity | undefined> {
        const client = Core.getStorageClient();
        let clonedFileEntity = client?.cloneFile(fileUrl, destinationContainerName, destinationFilePath);
        return clonedFileEntity;
    }

    /**
     * Deletes a file from the storage
     * @param fileUrl file url
     */
    async deleteFile(fileUrl: string) {
        const client = Core.getStorageClient();
        let fileEntity = await client?.getFileFromUrl(fileUrl);
        await fileEntity?.deleteFile();
    }
}

const storageService: StorageService = new StorageService();
export default storageService;
