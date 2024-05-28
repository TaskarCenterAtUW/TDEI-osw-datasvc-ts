import { QueryResult } from "pg";
import dbClient from "../../src/database/data-source";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import UniqueKeyDbException from "../../src/exceptions/db/database-exceptions";
import { DuplicateException, InputException } from "../../src/exceptions/http/http-exceptions";
import tdeiCoreService from "../../src/service/tdei-core-service";
import { DatasetEntity } from "../../src/database/entity/dataset-entity";
import { DatasetDTO } from "../../src/model/dataset-dto";
import { ServiceEntity } from "../../src/database/entity/service-entity";
import { DatasetQueryParams, RecordStatus } from "../../src/model/dataset-get-query-params";

// group test using describe
describe("TDEI core Service Test", () => {
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
            const mockVersion = 'existingVersion';
            const mockQueryResult = <QueryResult<any>>{ rowCount: 1 };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);
            const result = await tdeiCoreService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(true);
        });

        it('should resolve with false if no record with the same name and version exists', async () => {
            const mockName = 'nonExistingName';
            const mockVersion = 'nonExistingVersion';
            const mockQueryResult = <QueryResult<any>>{ rowCount: 0 };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);

            const result = await tdeiCoreService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(false);
        });

        it('should resolve with true if an error occurs during the query', async () => {
            const mockName = 'existingName';
            const mockVersion = 'existingVersion';
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
});

