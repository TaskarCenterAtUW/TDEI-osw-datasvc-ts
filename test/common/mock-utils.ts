import { Core } from "nodets-ms-core"
import { IAuthorizer } from "nodets-ms-core/lib/core/auth/abstracts/IAuthorizer";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { FileEntity, StorageClient, StorageContainer } from "nodets-ms-core/lib/core/storage"
import { Readable } from "stream"
import { QueueMessageContent } from "../../src/model/queue-message-model";
import { NextFunction, Request, Response } from "express";
import appContext from "../../src/app-context";
import { OrchestratorContext } from "../../src/orchestrator/models/config-model";


export function getMockFileEntity() {
    const fileEntity: FileEntity = {
        fileName: "test_file_name",
        mimeType: "csv",
        filePath: "test_file_path",
        remoteUrl: "",
        getStream: function (): Promise<NodeJS.ReadableStream> {
            const mockedStream = new Readable();
            mockedStream._read = function () { /* do nothing */ };
            return Promise.resolve(mockedStream);
        },
        getBodyText: function (): Promise<string> {
            return Promise.resolve("Sample body test");
        },
        upload: function (): Promise<FileEntity> {
            return Promise.resolve(this);
        }
    };
    return fileEntity;
}

export function getMockStorageClient() {
    const storageClientObj: StorageClient = {
        getContainer: function (): Promise<StorageContainer> {
            return Promise.resolve(getMockStorageContainer());
        },
        getFile: function (): Promise<FileEntity> {
            return Promise.resolve(getMockFileEntity());
        },
        getFileFromUrl: function (): Promise<FileEntity> {
            return Promise.resolve(getMockFileEntity());
        }
    };
    return storageClientObj;
}

export function getMockStorageContainer() {
    const storageContainerObj: StorageContainer = {
        name: "test_container",
        listFiles: function (): Promise<FileEntity[]> {
            return Promise.resolve([getMockFileEntity()]);
        },
        createFile: function (): FileEntity {
            return getMockFileEntity();
        }
    };
    return storageContainerObj;
}

export function getMockTopic() {
    const mockTopic: Topic = new Topic({ provider: "Azure" }, "test");
    mockTopic.publish = (): Promise<void> => {
        return Promise.resolve();
    }

    return mockTopic;
}

export function mockAppContext() {
    appContext.orchestratorServiceInstance = {
        publishMessage: jest.fn(),
        delegateWorkflowHandlers: jest.fn(),
        delegateWorkflowIfAny: jest.fn(),
        validateDeclaredVsRegisteredWorkflowHandlers: jest.fn(),
        triggerWorkflow: jest.fn(),
        orchestratorContext: new OrchestratorContext({}),
    };
}

export function getMockAuthorizer(result: boolean) {
    const authorizor: IAuthorizer = {
        hasPermission(permissionRequest) {
            return Promise.resolve(result);
        },
    }
    return authorizor;
}

export function mockCoreAuth(result: boolean) {
    jest.spyOn(Core, 'getAuthorizer').mockImplementation(() => { return getMockAuthorizer(result); })

}


export function mockCore() {
    jest.spyOn(Core, "initialize");
    jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return getMockStorageClient(); });
    jest.spyOn(Core, "getTopic").mockImplementation(() => { return getMockTopic(); });
}

export function mockQueueMessageContent(permissionResolve = true) {
    jest.spyOn(QueueMessageContent, "from")
        .mockImplementation((json: any) => {
            var test: QueueMessageContent = new QueueMessageContent();
            test = JSON.parse(JSON.stringify(json));
            //This is due to not able to mock Prop() behaviour 
            test.tdeiRecordId = json.tdei_record_id;
            test.userId = json.user_id;
            test.projectGroupId = json.tdei_project_group_id;
            test.hasPermission = jest.fn().mockImplementation(() => {
                return Promise.resolve(permissionResolve);
            });
            return test;
        });
}


export function mockMulter() {
    jest.mock('multer', () => {
        const multer = () => ({
            any: () => {
                return (req: Request, res: Response, next: NextFunction) => {
                    req.body.user_id = 'sample-user';
                    req.file = {
                        originalname: 'sample.zip',
                        mimetype: 'application/zip',
                        path: 'sample/path/to.zip',
                        buffer: Buffer.from('sample-buffer'),
                        fieldname: 'file',
                        filename: 'sample.zip',
                        size: 100,
                        stream: Readable.from(''),
                        encoding: '',
                        destination: ''
                    }

                    return next()
                }
            }
        })
        multer.memoryStorage = () => jest.fn()
        return multer
    })
}
