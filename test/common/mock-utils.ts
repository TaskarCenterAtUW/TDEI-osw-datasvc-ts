import { Core } from "nodets-ms-core"
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { FileEntity, StorageClient, StorageContainer } from "nodets-ms-core/lib/core/storage"
import { Readable } from "stream"
import { QueueMessageContent } from "../../src/model/queue-message-model";

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
            return Promise.resolve("Sample body test");
        },
        upload: function (body: NodeJS.ReadableStream): Promise<FileEntity> {
            return Promise.resolve(this);
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

export function getMockTopic() {
    var mockTopic: Topic = new Topic({ provider: "Azure" }, "test");
    mockTopic.publish = (messaage: QueueMessage): Promise<void> => {
        return Promise.resolve();
    }

    return mockTopic;
}

export function mockCore() {
    jest.spyOn(Core, "initialize");
    jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return getMockStorageClient(); });
    jest.spyOn(Core, "getTopic").mockImplementation(() => { return getMockTopic(); });
}

export function mockQueueMessageContent(permissionResolve: boolean = true) {
    jest.spyOn(QueueMessageContent, "from")
        .mockImplementation((json: any) => {
            var test: QueueMessageContent = new QueueMessageContent();
            test = structuredClone(json);
            //This is due to not able to mock Prop() behaviour 
            test.tdeiRecordId = json.tdei_record_id;
            test.userId = json.user_id;
            test.orgId = json.tdei_org_id;
            test.hasPermission = jest.fn().mockImplementation((roles: []) => {
                return Promise.resolve(permissionResolve);
            });
            return test;
        });
}