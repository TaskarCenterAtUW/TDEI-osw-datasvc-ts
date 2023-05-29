import { Core } from "nodets-ms-core"
import { FileEntity, StorageClient, StorageContainer } from "nodets-ms-core/lib/core/storage"
import { Readable } from "stream"

export function getMockFileEntity() {
    var fileEntity: FileEntity = {
        fileName: "test_file_name",
        mimeType: "csv",
        filePath: "test_file_path",
        getStream: function (): Promise<NodeJS.ReadableStream> {
            var mockedStream = new Readable();
            mockedStream._read = function (size) { /* do nothing */ };
            return Promise.resolve(mockedStream);
        },
        getBodyText: function (): Promise<string> {
            throw Promise.resolve("Sample body test");
        },
        upload: function (body: NodeJS.ReadableStream): Promise<FileEntity> {
            throw Promise.resolve(this);
        }
    };
    return fileEntity;
}

export function getMockStorageClient() {
    var storageClientObj: StorageClient = {
        getContainer: function (name: string): Promise<StorageContainer> {
            return Promise.resolve(getMockStorageContainer());
        },
        getFile: function (containerName: string, fileName: string): Promise<FileEntity> {
            return Promise.resolve(getMockFileEntity());
        },
        getFileFromUrl: function (fullUrl: string): Promise<FileEntity> {
            return Promise.resolve(getMockFileEntity());
        }
    };
    return storageClientObj;
}

export function getMockStorageContainer() {
    var storageContainerObj: StorageContainer = {
        name: "test_container",
        listFiles: function (): Promise<FileEntity[]> {
            return Promise.resolve([getMockFileEntity()]);
        },
        createFile: function (name: string, mimeType: string): FileEntity {
            return getMockFileEntity();
        }
    };
    return storageContainerObj;
}

export function mockCore() {
    jest.spyOn(Core, "initialize");
    jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return getMockStorageClient(); }
    );
}
