import { QueryResult } from "pg";
import dbClient from "../../src/database/data-source";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { mockAppContext, mockCore } from "../common/mock-utils";
import { InputException, ServiceNotFoundException } from "../../src/exceptions/http/http-exceptions";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { Core } from "nodets-ms-core";
import storageService from "../../src/service/storage-service";
import appContext from "../../src/app-context";
import workflowDatabaseService from "../../src/orchestrator/services/workflow-database-service";
import { IUploadRequest } from "../../src/service/interface/upload-request-interface";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { ServiceRequest } from "../../src/model/backend-request-interface";
import tdeiCoreService from "../../src/service/tdei-core-service";
import jobService from "../../src/service/job-service";
import oswService from "../../src/service/osw-service";
import { DatasetEntity } from "../../src/database/entity/dataset-entity";
import { ServiceEntity } from "../../src/database/entity/service-entity";

// group test using describe
describe("OSW Service Test", () => {
    beforeAll(async () => {
        // oswService.jobServiceInstance = jobService;
        // oswService.tdeiCoreServiceInstance = tdeiCoreService;
    }, 1000);

    describe("Get OSW file by Id", () => {
        describe("Functional", () => {
            test("When requested for get OSW file by tdei_dataset_id, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            download_osw_url: "test_path",
                            download_osm_url: "test_path",
                            download_metadata_url: "test_path",
                            download_changeset_url: "test_path",
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_dataset_id and osm format, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            download_osw_url: "test_path",
                            download_osm_url: "test_path",
                            download_metadata_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_dataset_id and xml format, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            download_osw_url: "test_path",
                            download_osm_url: "test_path",
                            download_metadata_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "xml");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file where conversion for osm for tdei_dataset_id not available, Expect to throw HttpException", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "",
                            download_metadata_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "osm")).rejects.toThrow(HttpException);
            });

            test("When requested for get OSW file with invalid tdei_dataset_id, Expect to throw HttpException", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>><unknown>{
                    rows: [],
                    rowCount: 0
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "osw")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>><unknown>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "",
                            download_metadata_url: "test_path"
                        }
                    ]
                };

                mockCore();
                //Overrride getStorageClient mock
                jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return null; }
                );
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "")).rejects.toThrow();
            });
        });
    });

    describe('process format request', () => {

        it('should process the format request and return jobId', async () => {
            // Mock data
            const mockSource = 'mockSource';
            const mockTarget = 'mockTarget';
            const mockUploadedFile = <any>{
                originalname: 'mockFile.xml',
                buffer: Buffer.from('mockFileContent'),
            };
            const mockUserId = 'mockUserId';
            const mockUid = 'mockUid';
            const mockFolderPath = 'mockFolderPath';
            const mockRemoteUrl = Promise.resolve("mockRemoteUrl");

            // Mock storage service functions
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValueOnce(mockUid);
            jest.spyOn(storageService, "getFormatJobPath").mockReturnValueOnce(mockFolderPath);
            jest.spyOn(storageService, "uploadFile").mockReturnValueOnce(mockRemoteUrl);

            mockAppContext();

            // Mock createOSWFormatJob function
            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock OswFormatJobRequest.from function
            const mockOswFormatRequest = {
                jobId: mockJobId,
                source: mockSource,
                target: mockTarget,
                sourceUrl: "mockRemoteUrl",
            };

            // Mock QueueMessage.from function
            const mockQueueMessage = {
                messageId: mockJobId,
                messageType: 'OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW',
                data: mockOswFormatRequest,
            };

            // Execute the function
            const result = await oswService.processFormatRequest(mockSource, mockTarget, mockUploadedFile, mockUserId);

            // Assertions
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getFormatJobPath).toHaveBeenCalledWith(mockUid);
            expect(result).toBe(mockJobId.toString());
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW',
                expect.anything()
            );
        });
    });

    describe('calculate confidence metric', () => {
        const tdeiRecordId = 'tdei-dataset-id';
        const userId = 'user-id';

        it('should calculate confidence successfully', async () => {
            // Mock the behavior of getOSWRecordById
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    download_osw_url: 'download-osw-url',
                    download_metadata_url: 'download-metadata-url',
                }));

            // Mock createOSWFormatJob function
            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow
            mockAppContext();

            // Call the function
            const result = await oswService.calculateConfidence(tdeiRecordId, userId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(tdeiCoreService.getDatasetDetailsById).toHaveBeenCalledWith(tdeiRecordId);
            expect(jobService.createJob).toHaveBeenCalledWith(expect.anything()); // You may want to provide more specific expectations
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_ON_DEMAND_CONFIDENCE_METRIC_REQUEST_WORKFLOW',
                expect.anything()
            );
        });
    });

    describe('process validation only request', () => {
        const userId = 'user-id';
        const datasetFile = {
            originalname: 'original-name.zip',
            buffer: Buffer.from('file-content'),
        };

        it('should process validation request successfully', async () => {
            // Mock the behavior of storageService
            jest.spyOn(storageService, "generateRandomUUID")
                .mockReturnValue('uuid');
            jest.spyOn(storageService, "getValidationJobPath")
                .mockReturnValue('validation-job-path');
            jest.spyOn(storageService, "uploadFile")
                .mockResolvedValue('dataset-upload-url');

            // Mock the behavior of dbClient
            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow
            mockAppContext();
            // Call the function
            const result = await oswService.processValidationOnlyRequest(userId, datasetFile);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getValidationJobPath).toHaveBeenCalledWith('uuid');
            expect(storageService.uploadFile).toHaveBeenCalledWith('validation-job-path/original-name.zip', 'application/zip', expect.anything());
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW',
                expect.anything()
            );
        });

        // Add more test cases as needed
    });

    describe('process publish request', () => {
        const userId = 'user-id';
        const tdeiRecordId = 'tdei-dataset-id';

        it('should process publish request successfully', async () => {
            // Mock the behavior of dbClient
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rowCount: 0 });// Assume no overlap

            // Mock the behavior of getOSWRecordById and getOSWMetadataById
            const oswRecordMock = { status: 'Draft', tdei_project_group_id: 'project-group-id', download_osw_url: 'download-url' };
            const oswMetadataMock = { getOverlapQuery: jest.fn() };
            const getOSWRecordByIdSpy = jest.spyOn(tdeiCoreService, 'getDatasetDetailsById').mockResolvedValue(<any>oswRecordMock);
            const getOSWMetadataByIdSpy = jest.spyOn(tdeiCoreService, 'getMetadataDetailsById').mockResolvedValue(<any>oswMetadataMock);

            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow and obseleteAnyExistingWorkflowHistory
            mockAppContext();
            jest.spyOn(workflowDatabaseService, 'obseleteAnyExistingWorkflowHistory').mockResolvedValue(true);

            // Call the function
            let result = await oswService.processPublishRequest(userId, tdeiRecordId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(getOSWRecordByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            expect(getOSWMetadataByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            expect(dbClient.query).toHaveBeenCalled();
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_PUBLISH_VALIDATION_REQUEST_WORKFLOW',
                expect.anything()
            );
            expect(workflowDatabaseService.obseleteAnyExistingWorkflowHistory).toHaveBeenCalledWith(tdeiRecordId, undefined);
        });
    });

    describe('process upload request', () => {
        const uploadRequestObject: IUploadRequest = {
            tdei_service_id: 'service-id',
            tdei_project_group_id: 'project-group-id',
            user_id: 'user-id',
            derived_from_dataset_id: "",
            datasetFile: [
                {
                    originalname: 'dataset.zip',
                    buffer: Buffer.from('mocked-dataset-content'),
                },
            ],
            metadataFile: [
                {
                    originalname: 'metadata.json',
                    buffer: Buffer.from('{"name": "test", "version": "1.0"}'),
                },
            ],
            changesetFile: undefined,
        };

        it('should process upload request successfully', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue({
                    owner_project_group: "project-group-id"
                } as ServiceEntity);

            mockCore();
            mockAppContext();
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ tdei_project_group_id: 'project-group-id' });
            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);
            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(tdeiCoreService, 'validateObject').mockResolvedValue("");
            const uploadSpy = jest.spyOn(storageService, 'uploadFile').mockResolvedValue("file-path");
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValueOnce('mocked-uuid');

            // Mock the behavior of checkMetaNameAndVersionUnique
            jest.spyOn(tdeiCoreService, 'checkMetaNameAndVersionUnique').mockResolvedValue(false);

            // Call the function
            const result = await oswService.processUploadRequest(uploadRequestObject);

            // Assertions
            expect(dbClient.query).toHaveBeenCalled();
            expect(validateMetadataSpy).toHaveBeenCalledWith(expect.any(Object)); // You may want to improve this assertion
            expect(uploadSpy).toHaveBeenCalledTimes(2); // Two files: dataset and metadata
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW',
                expect.any(Object)
            );
            expect(result).toEqual(mockJobId.toString()); // Adjust the expected value based on your implementation
        });

        it('should throw ServiceNotFoundException if service id not found', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(undefined);

            // Call the function
            expect(oswService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(ServiceNotFoundException)); // Adjust the expected value based on your implementation
        });

        it('should throw InputException if metadata name and version not unique', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(
                    {
                        owner_project_group: "project-group-id"
                    } as ServiceEntity);


            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(tdeiCoreService, 'validateObject').mockResolvedValue("");

            // Mock the behavior of checkMetaNameAndVersionUnique
            jest.spyOn(tdeiCoreService, 'checkMetaNameAndVersionUnique').mockResolvedValue(true);

            // Call the function
            expect(oswService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(InputException)); // Adjust the expected value based on your implementation
        });

    });

    describe("Process Dataset Flattening Request", () => {
        test("When override is false and there is an existing record, expect to throw InputException", async () => {
            // Arrange
            const tdei_dataset_id = "test_id";
            const override = false;
            const queryResult = <QueryResult<any>>{
                rowCount: 1
            };
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(new DatasetEntity({}));
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(queryResult);

            // Act & Assert
            await expect(oswService.processDatasetFlatteningRequest("user_id", tdei_dataset_id, override)).rejects.toThrow(InputException);
            expect(dbClient.query).toHaveBeenCalledTimes(1);
        });

        test("When override is true, expect to create a new job and trigger the workflow", async () => {
            // Arrange
            const tdei_dataset_id = "test_id";
            const override = true;
            const job_id = "job_id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(new DatasetEntity({}));
            jest.spyOn(dbClient, "query").mockResolvedValue({ rows: [{ job_id }] } as any);
            // Mock the behavior of triggerWorkflow
            mockAppContext();
            // Act
            const result = await oswService.processDatasetFlatteningRequest("user_id", tdei_dataset_id, override);

            // Assert
            expect(dbClient.query).toHaveBeenCalledTimes(2);
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                "ON_DEMAND_DATASET_FLATTENING_REQUEST_WORKFLOW",
                expect.any(QueueMessage)
            );
            expect(result).toBe(job_id);
        });
    });

    describe("processBackendRequest", () => {
        test("Should create a backend job and trigger the workflow", async () => {
            // Arrange
            const backendRequest: ServiceRequest = {
                user_id: "user_id",
                service: "service",
                parameters: {
                    tdei_dataset_id: "string",
                    bbox: "string"
                }
            };

            const mockJobId = "job_id";
            const mockWorkflowIdentifier = "BACKEND_SERVICE_REQUEST_WORKFLOW";

            const queryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{ job_id: mockJobId }],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(queryResult);

            mockAppContext();
            // Act
            const result = await oswService.processBackendRequest(backendRequest);

            // Assert
            expect(dbClient.query).toHaveBeenCalledTimes(1);
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith("BACKEND_SERVICE_REQUEST_WORKFLOW",
                expect.any(QueueMessage));
            expect(result).toBe(mockJobId);
        });

        test("Should throw an error if an exception occurs", async () => {
            // Arrange
            const backendRequest: ServiceRequest = {
                user_id: "user_id",
                service: "service",
                parameters: {
                    tdei_dataset_id: "string",
                    bbox: "string"
                }
            };

            const mockError = new Error("Some error message");

            jest.spyOn(dbClient, "query").mockRejectedValueOnce(mockError);

            // Act & Assert
            await expect(oswService.processBackendRequest(backendRequest)).rejects.toThrow(mockError);
        });
    });
});

