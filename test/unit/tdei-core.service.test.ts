import { QueryResult } from "pg";
import dbClient from "../../src/database/data-source";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import UniqueKeyDbException from "../../src/exceptions/db/database-exceptions";
import { DuplicateException, InputException, ServiceNotFoundException } from "../../src/exceptions/http/http-exceptions";
import tdeiCoreService from "../../src/service/tdei-core-service";
import { DatasetEntity } from "../../src/database/entity/dataset-entity";
import { DatasetDTO } from "../../src/model/dataset-dto";
import { ServiceEntity } from "../../src/database/entity/service-entity";
import { DatasetQueryParams, RecordStatus } from "../../src/model/dataset-get-query-params";
import { IDatasetCloneRequest } from "../../src/model/request-interfaces";
import fetchMock from "jest-fetch-mock";
import { MetadataModel } from "../../src/model/metadata.model";
import { TDEIDataType } from "../../src/model/jobs-get-query-params";
import { TdeiDate } from "../../src/utility/tdei-date";

// group test using describe
describe("TDEI core Service Test", () => {

    describe("Clone Dataset", () => {
        test("When cloning a dataset with valid input, expect to return the new dataset ID", async () => {
            // Arrange
            const datasetCloneRequestObject: IDatasetCloneRequest = {
                tdei_dataset_id: "dataset_id",
                tdei_project_group_id: "project_group_id",
                tdei_service_id: "service_id",
                metafile: {
                    buffer: JSON.stringify(TdeiObjectFaker.getMetadataSample())
                },
                user_id: "user_id",
                isAdmin: false
            };

            const datasetDetails = TdeiObjectFaker.getDatasetVersion();
            const service = ServiceEntity.from({ owner_project_group: "project_group_id" });

            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValue(datasetDetails);
            jest.spyOn(tdeiCoreService, "getServiceById").mockResolvedValue(service);
            jest.spyOn(tdeiCoreService, "validateMetadata").mockResolvedValue(true);
            jest.spyOn(tdeiCoreService, "preReleaseCheck").mockResolvedValue();
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<QueryResult<any>>{
                rows: [{ tdei_clone_dataset: "new_dataset_id" }]
            });
            jest.spyOn(tdeiCoreService, "cloneBlob").mockResolvedValue();
            jest.spyOn(tdeiCoreService, "triggerCloneWorkflow").mockResolvedValue("job_id");
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<QueryResult<any>>{});

            // Act
            const result = await tdeiCoreService.cloneDataset(datasetCloneRequestObject);

            // Assert
            expect(result.new_tdei_dataset_id).toBe("new_dataset_id");
        });

        test("When cloning a dataset with invalid service ID, expect to throw ServiceNotFoundException", async () => {
            // Arrange
            const datasetCloneRequestObject: IDatasetCloneRequest = {
                tdei_dataset_id: "dataset_id",
                tdei_project_group_id: "project_group_id",
                tdei_service_id: "service_id",
                metafile: {
                    buffer: JSON.stringify({ /* metadata object */ })
                },
                user_id: "user_id",
                isAdmin: false
            };

            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<QueryResult<any>>{
                rows: [{ tdei_dataset_id: "dataset_id" }]
            });
            jest.spyOn(tdeiCoreService, "getServiceById").mockResolvedValue(undefined);

            // Act & Assert
            await expect(tdeiCoreService.cloneDataset(datasetCloneRequestObject)).rejects.toThrow(ServiceNotFoundException);
        });

        test("When cloning a dataset with invalid project group ID, expect to throw InputException", async () => {
            // Arrange
            const datasetCloneRequestObject: IDatasetCloneRequest = {
                tdei_dataset_id: "dataset_id",
                tdei_project_group_id: "project_group_id",
                tdei_service_id: "service_id",
                metafile: {
                    buffer: JSON.stringify({ /* metadata object */ })
                },
                user_id: "user_id",
                isAdmin: false
            };

            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<QueryResult<any>>{
                rows: [{ tdei_dataset_id: "dataset_id" }]
            }); const service = ServiceEntity.from({ owner_project_group: "other_project_group_id" });

            jest.spyOn(tdeiCoreService, "getServiceById").mockResolvedValue(service);

            // Act & Assert
            await expect(tdeiCoreService.cloneDataset(datasetCloneRequestObject)).rejects.toThrow(InputException);
        });

    });

    describe("Get all Datasets", () => {
        describe("Functional", () => {
            test("When requested with empty search filters, Expect to return Dataset list", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);


                const params: DatasetQueryParams = new DatasetQueryParams();
                //Act
                const result = await tdeiCoreService.getDatasets("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof DatasetDTO));
            });

            test("When requested with all search filters, expect to return Dataset list", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                const params: DatasetQueryParams = new DatasetQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.name = "testing";
                params.version = "v1";
                params.valid_to = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_dataset_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                const result = await tdeiCoreService.getDatasets("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof DatasetDTO));
            });

            test("When requested with invalid date search filter, Expect to throw InputException", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                const params: DatasetQueryParams = new DatasetQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.valid_to = "13-13-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_dataset_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                //Assert
                await expect(tdeiCoreService.getDatasets("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested with invalid bbox search filter, Expect to throw InputException", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                const params: DatasetQueryParams = new DatasetQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.valid_to = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_dataset_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                await expect(tdeiCoreService.getDatasets("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested for 'Pre-Release' records and user not associsted with any project groups, Expect to throw InputException", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                const params: DatasetQueryParams = new DatasetQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.status = RecordStatus["Pre-Release"]
                params.valid_to = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_dataset_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                await expect(tdeiCoreService.getDatasets("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested for 'Pre-Release' records and user associsted with any project groups, Expect to return DATASET list", async () => {
                //Arrange
                const datasetObj = TdeiObjectFaker.getDatasetVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                const params: DatasetQueryParams = new DatasetQueryParams();
                params.status = RecordStatus["Pre-Release"]
                //Act
                //Act
                const result = await tdeiCoreService.getDatasets("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof DatasetDTO));
            });
        });
    });

    describe("Create Dataset version", () => {
        describe("Functional", () => {
            test("When requested for creating DATASET version with valid input, Expect to return DatasetDTO object", async () => {
                //Arrange
                const datasetObj = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        datasetObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await tdeiCoreService.createDataset(datasetObj);
                //Assert
                expect(result instanceof DatasetDTO);
            });

            test("When database exception with duplicate tdei_dataset_id occured while processing request, Expect to throw DuplicateException", async () => {
                //Arrange
                const datasetObj = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new UniqueKeyDbException("Unique contraint error"));

                //Act
                //Assert
                await expect(tdeiCoreService.createDataset(datasetObj)).rejects.toThrow(DuplicateException);
            });

            test("When database exception occured while processing request, Expect to throw error", async () => {
                //Arrange
                const datasetObj = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new Error("Unknown Error"));

                //Act
                //Assert
                await expect(tdeiCoreService.createDataset(datasetObj)).rejects.toThrow();
            });
        });
    });

    describe('check metadata name And version unique', () => {
        beforeEach(() => {
            // Clear all mocks before each test
            jest.clearAllMocks();
        });

        it('should resolve with true if record with the same name and version exists', async () => {
            const mockName = 'existingName';
            const mockVersion = "1.1";
            const mockQueryResult = <QueryResult<any>>{ rowCount: 1 };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);
            const result = await tdeiCoreService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(true);
        });

        it('should resolve with false if no record with the same name and version exists', async () => {
            const mockName = 'nonExistingName';
            const mockVersion = "1";
            const mockQueryResult = <QueryResult<any>>{ rowCount: 0 };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);

            const result = await tdeiCoreService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(false);
        });

        it('should resolve with true if an error occurs during the query', async () => {
            const mockName = 'existingName';
            const mockVersion = "2.3";
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query").mockRejectedValueOnce(originalError);

            const result = await tdeiCoreService.checkMetaNameAndVersionUnique(mockName, mockVersion);
            expect(result).toBe(true);
        });
    });

    describe('get service by Id', () => {
        const serviceId = 'service-id';
        it('should get service by ID successfully', async () => {
            jest.spyOn(dbClient, "query").mockResolvedValueOnce({ rowCount: 1, rows: [{ id: serviceId }] } as any);
            const result = await tdeiCoreService.getServiceById(serviceId);
            expect(result instanceof ServiceEntity);
        });

        it('should get undefined if no service found', async () => {
            jest.spyOn(dbClient, "query").mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);
            expect(await tdeiCoreService.getServiceById(serviceId)).toBeUndefined();
        });

    });

    describe("Invalidate Record Request", () => {
        it("should invalidate the record and return true if query result has rowCount > 0", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_dataset_id = "mock-tdei-record-id";

            const dummyResponse = <QueryResult<any>>{ rowCount: 1 };
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockResolvedValueOnce(dummyResponse);

            // Act
            const result = await tdeiCoreService.invalidateRecordRequest(user_id, tdei_dataset_id);

            // Assert
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
            expect(result).toBe(true);
        });

        it("should not invalidate the record and return false if query result has rowCount <= 0", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_dataset_id = "mock-tdei-record-id";
            const dummyResponse = <QueryResult<any>>{ rowCount: 0 };
            const error = new InputException("mock-tdei-record-id not found.");
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockResolvedValueOnce(dummyResponse);
            // Act
            // Assert
            await expect(tdeiCoreService.invalidateRecordRequest(user_id, tdei_dataset_id)).rejects.toThrow(error);
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
        });

        it("should throw an error if an error occurs while invalidating the record", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_dataset_id = "mock-tdei-record-id";
            const error = new Error("Database error");
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockRejectedValueOnce(error);

            // Act & Assert
            await expect(tdeiCoreService.invalidateRecordRequest(user_id, tdei_dataset_id)).rejects.toThrow(error);
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
        });
    });

    describe("recover-password", () => {
        test("should send password recovery email", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 200,
                text: () => Promise.resolve('true'),
            }));
            // Act
            const result = await tdeiCoreService.recoverPassword(email);

            // Assert
            expect(result).toBe(true);
        });

        test("should throw an error if email not found", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 404,
                text: () => Promise.resolve('User not found'),
            }));

            // Act, Assert
            await expect(tdeiCoreService.recoverPassword(email)).rejects.toThrow(
                "User not found"
            );

        });

        test("should throw an error if password recovery email fails", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 500,
                text: () => Promise.resolve('Internal server error'),
            }));

            // Act, Assert
            await expect(tdeiCoreService.recoverPassword(email)).rejects.toThrow(
                "Internal server error"
            );

        });
    });

    describe("verify email", () => {
        test("should send email verification link", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 200,
                text: () => Promise.resolve('true'),
            }));
            // Act
            const result = await tdeiCoreService.verifyEmail(email);

            // Assert
            expect(result).toBe(true);
        });

        test("should throw an error if email not found", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 404,
                text: () => Promise.resolve('User not found'),
            }));

            // Act, Assert
            await expect(tdeiCoreService.verifyEmail(email)).rejects.toThrow(
                "User not found"
            );

        });

        test("should throw an error if email verification link sending fails", async () => {
            // Arrange
            const email = "test@example.com";

            fetchMock.mockResolvedValueOnce(Promise.resolve(<any>{
                status: 500,
                text: () => Promise.resolve('Internal server error'),
            }));

            // Act, Assert
            await expect(tdeiCoreService.verifyEmail(email)).rejects.toThrow(
                "Internal server error"
            );

        });
    });

    describe('validateMetadata', () => {
        it('should throw an InputException if the metadata is invalid', async () => {
            // Arrange
            let metadata = new MetadataModel();
            metadata = JSON.parse(JSON.stringify(TdeiObjectFaker.getMetadataSample()));
            metadata.dataset_detail.schema_version = "v0.1"; // Invalid schema version

            // Act & Assert
            await expect(tdeiCoreService.validateMetadata(metadata, TDEIDataType.osw)).rejects.toThrow(InputException);
        });

        it('should throw an InputException if the data type is not supported', async () => {
            // Arrange
            let metadata = new MetadataModel();
            metadata = JSON.parse(JSON.stringify(TdeiObjectFaker.getMetadataSample()));
            metadata.dataset_detail.schema_version = "v0.2"; // Valid schema version

            // Act & Assert
            await expect(tdeiCoreService.validateMetadata(metadata, "invalid-data-type" as any)).rejects.toThrow(InputException);
        });

        it('Support polygon dataset area, should return valid metadata', async () => {
            // Arrange
            let metadata = MetadataModel.from({});
            metadata = JSON.parse(JSON.stringify(TdeiObjectFaker.getMetadataSample()));
            jest.spyOn(tdeiCoreService, "checkMetaNameAndVersionUnique").mockResolvedValue(false);

            // Act & Assert
            await expect(tdeiCoreService.validateMetadata(metadata, TDEIDataType.osw, 'tdei_dataset_id')).resolves.toBeTruthy();
        });

        it('Support multi polygon dataset area, should return valid metadata', async () => {
            // Arrange
            let metadata = MetadataModel.from({});
            metadata = JSON.parse(JSON.stringify(TdeiObjectFaker.getMetadataSampleMultiPolygon()));
            jest.spyOn(tdeiCoreService, "checkMetaNameAndVersionUnique").mockResolvedValue(false);

            // Act & Assert
            await expect(tdeiCoreService.validateMetadata(metadata, TDEIDataType.osw, 'tdei_dataset_id')).resolves.toBeTruthy();
        });
    });

    describe('validateDatasetDates', () => {
        it('should throw an error if valid_from or valid_to is missing', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = undefined as any;
            dataset.valid_to = undefined as any;

            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow(InputException);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow('Valid from and valid to dates are required for publishing the dataset.');
        });

        it('should throw an error if valid_from date is invalid', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = 'invalid-date' as any;
            dataset.valid_to = '2023-12-31' as any;

            jest.spyOn(TdeiDate, 'isValid').mockReturnValueOnce(false);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow(InputException);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow('Invalid valid_from date.');
        });

        it('should throw an error if valid_to date is invalid', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = '2023-12-31' as any;
            dataset.valid_to = 'invalid-date' as any;

            jest.spyOn(TdeiDate, 'isValid').mockReturnValueOnce(true).mockReturnValueOnce(false);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow(InputException);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow('Invalid valid_to date.');
        });

        it('should throw an error if valid_from is greater than valid_to', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = '2023-12-31' as any;
            dataset.valid_to = '2023-01-01' as any;
            jest.spyOn(TdeiDate, 'isValid').mockReturnValue(true);
            jest.spyOn(TdeiDate, 'UTC').mockImplementation(date => (new Date(date!)).toISOString());
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow(InputException);
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow('Invalid valid_from date. valid_from should be less than or equal to valid_to.');
        });

        it('should throw an error if valid_to is less than valid_from', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = '2023-01-01' as any;
            dataset.valid_to = '2022-12-31' as any;
            jest.spyOn(TdeiDate, 'isValid').mockReturnValue(true);
            jest.spyOn(TdeiDate, 'UTC').mockImplementation(date => (new Date(date!)).toISOString());
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).toThrow(InputException);
        });

        it('should not throw an error for valid dates', () => {
            let dataset = DatasetEntity.from(TdeiObjectFaker.getDatasetVersion());
            dataset.valid_from = '2023-01-01' as any;
            dataset.valid_to = '2023-12-31' as any;
            jest.spyOn(TdeiDate, 'isValid').mockReturnValue(true);
            jest.spyOn(TdeiDate, 'UTC').mockImplementation(date => (new Date(date!)).toISOString());
            expect(() => tdeiCoreService.validateDatasetDates(dataset)).not.toThrow();
        });
    });

});

