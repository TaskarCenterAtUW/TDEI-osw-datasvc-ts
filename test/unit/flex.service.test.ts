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
import tdeiCoreService from "../../src/service/tdei-core-service";
import jobService from "../../src/service/job-service";
import flexService from "../../src/service/flex-service";
import { ServiceEntity } from "../../src/database/entity/service-entity";

// group test using describe
describe("Flex Service Test", () => {

    describe("Get Flex file by Id", () => {
        describe("Functional", () => {
            test("When requested for get flex file by tdei_dataset_id, Expect to return FileEntity object", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'flex',
                        dataset_url: 'dataset_url',
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));
                mockCore();

                //Act
                const result = await flexService.getFlexStreamById("tdei_dataset_id");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get flex file with invalid tdei_dataset_id, Expect to throw HttpException", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockRejectedValueOnce(new HttpException(404, "Not Found"));
                mockCore();

                //Act
                //Assert
                expect(flexService.getFlexStreamById("tdei_dataset_id")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'flex',
                        dataset_url: 'dataset_url',
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));

                mockCore();
                //Overrride getStorageClient mock
                jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return null; }
                );

                //Act
                //Assert
                expect(flexService.getFlexStreamById("tdei_dataset_id")).rejects.toThrow();
            });
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
            const result = await flexService.processValidationOnlyRequest(userId, datasetFile);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getValidationJobPath).toHaveBeenCalledWith('uuid');
            expect(storageService.uploadFile).toHaveBeenCalledWith('validation-job-path/original-name.zip', 'application/zip', expect.anything(), "gtfsflex");
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'FLEX_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW',
                expect.anything()
            );
        });

    });

    describe('process publish request', () => {
        const userId = 'user-id';
        const tdeiRecordId = 'tdei-dataset-id';

        it('should process publish request successfully', async () => {
            // Mock the behavior of dbClient
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rowCount: 0 });// Assume no overlap

            // Mock the behavior of getFLEXRecordById and getFLEXMetadataById
            const flexRecordMock = { data_type: 'flex', status: 'Draft', tdei_project_group_id: 'project-group-id' };
            const metadataMock = { getOverlapQuery: jest.fn() };
            const getFLEXRecordByIdSpy = jest.spyOn(tdeiCoreService, 'getDatasetDetailsById').mockResolvedValue(<any>flexRecordMock);
            const getFLEXMetadataByIdSpy = jest.spyOn(tdeiCoreService, 'getMetadataDetailsById').mockResolvedValue(<any>metadataMock);

            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow and obseleteAnyExistingWorkflowHistory
            mockAppContext();
            jest.spyOn(workflowDatabaseService, 'obseleteAnyExistingWorkflowHistory').mockResolvedValue(true);

            // Call the function
            let result = await flexService.processPublishRequest(userId, tdeiRecordId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(getFLEXRecordByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            expect(getFLEXMetadataByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            expect(dbClient.query).toHaveBeenCalled();
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'FLEX_PUBLISH_VALIDATION_REQUEST_WORKFLOW',
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
                    buffer: Buffer.from('{"name": "test", "schema_version": "v2.0"}'),
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
            const result = await flexService.processUploadRequest(uploadRequestObject);

            // Assertions
            expect(dbClient.query).toHaveBeenCalled();
            expect(validateMetadataSpy).toHaveBeenCalledWith(expect.any(Object)); // You may want to improve this assertion
            expect(uploadSpy).toHaveBeenCalledTimes(2); // Two files: dataset and metadata
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'FLEX_UPLOAD_VALIDATION_REQUEST_WORKFLOW',
                expect.any(Object)
            );
            expect(result).toEqual(mockJobId.toString()); // Adjust the expected value based on your implementation
        });

        it('should throw ServiceNotFoundException if service id not found', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(undefined);

            // Call the function
            expect(flexService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(ServiceNotFoundException)); // Adjust the expected value based on your implementation
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
            expect(flexService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(InputException)); // Adjust the expected value based on your implementation
        });

    });
});

