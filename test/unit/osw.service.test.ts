import { QueryResult } from "pg";
import fetchMock from "jest-fetch-mock";
import dbClient from "../../src/database/data-source";
import oswService from "../../src/service/osw-service";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import { OswQueryParams, RecordStatus } from "../../src/model/osw-get-query-params";
import { OswDTO } from "../../src/model/osw-dto";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { mockAppContext, mockCore } from "../common/mock-utils";
import { OswVersions } from "../../src/database/entity/osw-version-entity";
import UniqueKeyDbException from "../../src/exceptions/db/database-exceptions";
import { DuplicateException, InputException, JobIdNotFoundException, ServiceNotFoundException } from "../../src/exceptions/http/http-exceptions";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { Core } from "nodets-ms-core";
import { ProjectGroupRoleDto } from "../../src/model/project-group-role-dto";
import { OswMetadataEntity } from "../../src/database/entity/osw-metadata";
import { OswConfidenceJob } from "../../src/database/entity/osw-confidence-job-entity";
import { OswFormatJob } from "../../src/database/entity/osw-format-job-entity";
import { OswFormatJobResponse } from "../../src/model/osw-format-job-response";
import { OswValidationJobs } from "../../src/database/entity/osw-validate-jobs";
import { OSWConfidenceResponse } from "../../src/model/osw-confidence-response";
import storageService from "../../src/service/storage-service";
import appContext from "../../src/app-context";
import workflowDatabaseService from "../../src/orchestrator/services/workflow-database-service";
import { IUploadRequest } from "../../src/service/interface/upload-request-interface";
import { ServiceDto } from "../../src/model/service-dto";
import { Utility } from "../../src/utility/utility";

// group test using describe
describe("OSW Service Test", () => {
    describe("Get all OSW", () => {
        describe("Functional", () => {
            test("When requested with empty search filters, Expect to return OSW list", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersion();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([]);

                const params: OswQueryParams = new OswQueryParams();
                //Act
                const result = await oswService.getAllOsw("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with all search filters, expect to return OSW list", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([]);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.name = "testing";
                params.version = "v1";
                params.date_time = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                const result = await oswService.getAllOsw("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with invalid date search filter, Expect to throw InputException", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([]);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "13-13-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                //Assert
                expect(oswService.getAllOsw("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested with invalid bbox search filter, Expect to throw InputException", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([]);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                expect(oswService.getAllOsw("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested for 'Pre-Release' records and user not associsted with any project groups, Expect to throw InputException", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([]);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.status = RecordStatus["Pre-Release"]
                params.date_time = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                expect(oswService.getAllOsw("user_id", params)).rejects.toThrow(InputException);
            });

            test("When requested for 'Pre-Release' records and user associsted with any project groups, Expect to return OSW list", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                jest
                    .spyOn(oswService, "getUserProjectGroups")
                    .mockResolvedValueOnce([new ProjectGroupRoleDto()]);
                const params: OswQueryParams = new OswQueryParams();
                params.status = RecordStatus["Pre-Release"]
                //Act
                //Act
                const result = await oswService.getAllOsw("user_id", params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });
        });
    });

    describe("Get OSW file by Id", () => {
        describe("Functional", () => {
            test("When requested for get OSW file by tdei_record_id, Expect to return FileEntity object", async () => {
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
                const result = await oswService.getOswStreamById("tdei_record_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_record_id and osm format, Expect to return FileEntity object", async () => {
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
                const result = await oswService.getOswStreamById("tdei_record_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_record_id and xml format, Expect to return FileEntity object", async () => {
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
                const result = await oswService.getOswStreamById("tdei_record_id", "xml");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file where conversion for osm for tdei_record_id not available, Expect to throw HttpException", async () => {
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
                expect(oswService.getOswStreamById("tdei_record_id", "osm")).rejects.toThrow(HttpException);
            });

            test("When requested for get OSW file with invalid tdei_record_id, Expect to throw HttpException", async () => {
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
                expect(oswService.getOswStreamById("tdei_record_id", "osw")).rejects.toThrow(HttpException);
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
                expect(oswService.getOswStreamById("tdei_record_id", "")).rejects.toThrow();
            });
        });
    });

    describe("Create OSW version", () => {
        describe("Functional", () => {
            test("When requested for creating OSW version with valid input, Expect to return OswDTO object", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.createOsw(oswObj);
                //Assert
                expect(result instanceof OswDTO);
            });

            test("When database exception with duplicate tdei_record_id occured while processing request, Expect to throw DuplicateException", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());
                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new UniqueKeyDbException("Unique contraint error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow(DuplicateException);
            });

            test("When database exception occured while processing request, Expect to throw error", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new Error("Unknown Error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow();
            });
        });
    });

    describe("Create OSW metadata", () => {
        describe("Functional", () => {
            test("When requested for creating OSW metadata with valid input, Expect to return OswDTO object", async () => {
                //Arrange
                const oswObj = OswMetadataEntity.from(TdeiObjectFaker.getOswMetadataSample());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.createOswMetadata(oswObj);
                //Assert
                expect(result).toBeUndefined();
            });

            test("When database exception with duplicate tdei_record_id occured while processing request, Expect to throw DuplicateException", async () => {
                //Arrange
                const oswObj = OswMetadataEntity.from(TdeiObjectFaker.getOswMetadataSample());
                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new UniqueKeyDbException("Unique contraint error"));

                //Act
                //Assert
                expect(oswService.createOswMetadata(oswObj)).rejects.toThrow(DuplicateException);
            });

            test("When database exception occured while processing request, Expect to throw error", async () => {
                //Arrange
                const oswObj = OswMetadataEntity.from(TdeiObjectFaker.getOswMetadataSample());

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new Error("Unknown Error"));

                //Act
                //Assert
                expect(oswService.createOswMetadata(oswObj)).rejects.toThrow();
            });
        });
    });

    describe('get OSW record by Id', () => {
        it('should resolve with the record if it exists', async () => {
            const mockId = 'someRecordId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{ /* mock record data */ }],
            };

            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.getOSWRecordById(mockId);

            expect(result instanceof OswVersions).toBe(true);
        });

        it('should throw HttpException with 404 status if the record does not exist', async () => {
            const mockId = 'nonExistentRecordId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };

            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.getOSWRecordById(mockId)).rejects.toThrowError(HttpException);
        });
    });

    describe('get OSW metadata by Id', () => {
        it('should resolve with the record if it exists', async () => {
            const mockId = 'someRecordId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{ /* mock record data */ }],
            };

            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.getOSWMetadataById(mockId);

            expect(result instanceof OswMetadataEntity).toBe(true);
        });

        it('should throw HttpException with 404 status if the record does not exist', async () => {
            const mockId = 'nonExistentRecordId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };

            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.getOSWMetadataById(mockId)).rejects.toThrowError(HttpException);
        });
    });

    describe('create OSW confidence job', () => {
        it('should resolve with the inserted job ID', async () => {
            const mockInfo = new OswConfidenceJob();
            const mockQueryResult = <QueryResult<any>>{
                rows: [{ jobid: 'someJobId' }],
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);
            const result = await oswService.createOSWConfidenceJob(mockInfo);

            expect(result).toBe('someJobId');
        });

        it('should reject with the original error if an error occurs during insertion', async () => {
            const mockInfo = new OswConfidenceJob();
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);
            await expect(oswService.createOSWConfidenceJob(mockInfo)).rejects.toThrowError(originalError);
        });
    });

    describe('get OSW confidence job', () => {

        it('should resolve with the job if the job ID is found', async () => {
            const mockJobId = 'someJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{}],
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.getOSWConfidenceJob(mockJobId);

            expect(result instanceof OswConfidenceJob).toBe(true);
        });

        it('should reject with JobIdNotFoundException if the job ID is not found', async () => {
            const mockJobId = 'nonExistentJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.getOSWConfidenceJob(mockJobId)).rejects.toThrowError(JobIdNotFoundException);
        });

        it('should reject with the original error if an error occurs during the query', async () => {
            const mockJobId = 'someJobId';
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);

            await expect(oswService.getOSWConfidenceJob(mockJobId)).rejects.toThrowError(originalError);
        });
    });

    describe('create OSW format job', () => {
        beforeEach(() => {
            // Clear all mocks before each test
            jest.clearAllMocks();
        });

        it('should resolve with the created job ID if the insertion is successful', async () => {
            const mockInfo = new OswFormatJob();
            const mockQueryResult = <QueryResult<any>>{
                rows: [{ jobid: 'someJobId' }],
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.createOSWFormatJob(mockInfo);

            expect(result).toBe('someJobId');
        });

        it('should reject with an error if the job ID is not found in the query result', async () => {
            const mockInfo = new OswFormatJob();
            const mockQueryResult = <QueryResult<any>>{
                rows: [{}], // Simulate missing jobid in the result
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.createOSWFormatJob(mockInfo)).rejects.toThrowError('Formatting job creation failed');
        });

        it('should reject with the original error if an error occurs during insertion', async () => {
            const mockInfo = new OswFormatJob();
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);

            await expect(oswService.createOSWFormatJob(mockInfo)).rejects.toThrowError(originalError);
        });
    });

    describe('get OSW format job', () => {
        it('should resolve with the job if the job ID is found', async () => {
            const mockJobId = 'someJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{}],
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.getOSWFormatJob(mockJobId);

            expect(result instanceof OswFormatJob).toBe(true);
        });

        it('should reject with JobIdNotFoundException if the job ID is not found', async () => {
            const mockJobId = 'nonExistentJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.getOSWFormatJob(mockJobId)).rejects.toThrowError(JobIdNotFoundException);
        });

        it('should reject with the original error if an error occurs during the query', async () => {
            const mockJobId = 'someJobId';
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);
            await expect(oswService.getOSWFormatJob(mockJobId)).rejects.toThrowError(originalError);
        });
    });

    describe('update OSW format job', () => {
        it('should not throw error if rows are updated', async () => {
            const mockInfo = OswFormatJobResponse.from({});

            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{}], // Simulate missing jobid in the result
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            // await oswService.updateOSWFormatJob(mockInfo);

            expect(await oswService.updateOSWFormatJob(mockInfo)).toBeUndefined();
        });

        it('should throw an error if no rows are updated', async () => {
            const mockInfo = OswFormatJobResponse.from({});
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.updateOSWFormatJob(mockInfo)).rejects.toThrowError('Error updating formatting job');
        });

        it('should reject with the original error if an error occurs during the update', async () => {
            const mockInfo = OswFormatJobResponse.from({});
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);

            await expect(oswService.updateOSWFormatJob(mockInfo)).rejects.toThrowError(originalError);
        });
    });

    describe('get OSW validation job', () => {
        it('should resolve with the job if the job ID is found', async () => {
            const mockJobId = 'someJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{}],
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            const result = await oswService.getOSWValidationJob(mockJobId);

            expect(result instanceof OswValidationJobs).toBe(true);
        });

        it('should reject with JobIdNotFoundException if the job ID is not found', async () => {
            const mockJobId = 'nonExistentJobId';
            const mockQueryResult = <QueryResult<any>>{
                rowCount: 0,
            };
            jest.spyOn(dbClient, "query")
                .mockResolvedValueOnce(mockQueryResult);

            await expect(oswService.getOSWValidationJob(mockJobId)).rejects.toThrowError(JobIdNotFoundException);
        });

        it('should reject with the original error if an error occurs during the query', async () => {
            const mockJobId = 'someJobId';
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query")
                .mockRejectedValueOnce(originalError);
            await expect(oswService.getOSWValidationJob(mockJobId)).rejects.toThrowError(originalError);
        });
    });

    describe('update confidence metric', () => {
        it('should update status and return jobId if rows are updated', async () => {
            const mockInfo = OSWConfidenceResponse.from({ jobId: '10' });
            const mockTdeiRecordId = 'someTdeiRecordId';
            const mockQueryResult = <QueryResult<any>>{ rowCount: 1, rows: [{ tdei_record_id: mockTdeiRecordId }] };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);

            const result = await oswService.updateConfidenceMetric(mockInfo);

            expect(result).toBe(mockInfo.jobId.toString());
        });

        it('should throw an error if no rows are updated during status update', async () => {
            const mockInfo = OSWConfidenceResponse.from({});
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<QueryResult<any>>{ rowCount: 0 });

            await expect(oswService.updateConfidenceMetric(mockInfo)).rejects.toThrowError('Error updating confidence job');
        });

        it('should reject with the original error if an error occurs during the status update', async () => {
            const mockInfo = new OSWConfidenceResponse(/* mock response data */);
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query").mockRejectedValueOnce(originalError);

            await expect(oswService.updateConfidenceMetric(mockInfo)).rejects.toThrowError(originalError);
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
            const result = await oswService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(true);
        });

        it('should resolve with false if no record with the same name and version exists', async () => {
            const mockName = 'nonExistingName';
            const mockVersion = 'nonExistingVersion';
            const mockQueryResult = <QueryResult<any>>{ rowCount: 0 };
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(mockQueryResult);

            const result = await oswService.checkMetaNameAndVersionUnique(mockName, mockVersion);

            expect(result).toBe(false);
        });

        it('should resolve with true if an error occurs during the query', async () => {
            const mockName = 'existingName';
            const mockVersion = 'existingVersion';
            const originalError = new Error('Some unexpected error');
            jest.spyOn(dbClient, "query").mockRejectedValueOnce(originalError);

            const result = await oswService.checkMetaNameAndVersionUnique(mockName, mockVersion);
            expect(result).toBe(true);
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
            const mockJobId = 'mockJobId';

            // Mock storage service functions
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValueOnce(mockUid);
            jest.spyOn(storageService, "getFormatJobPath").mockReturnValueOnce(mockFolderPath);
            jest.spyOn(storageService, "uploadFile").mockReturnValueOnce(mockRemoteUrl);

            mockAppContext();

            // Mock createOSWFormatJob function
            jest.spyOn(oswService, "createOSWFormatJob")
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
            expect(result).toBe(mockJobId);
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_ON_DEMAND_FORMATTING_REQUEST_WORKFLOW',
                expect.anything()
            );
        });
    });

    describe('calculate confidence metric', () => {
        const tdeiRecordId = 'tdei-record-id';
        const userId = 'user-id';

        it('should calculate confidence successfully', async () => {
            // Mock the behavior of getOSWRecordById
            jest.spyOn(oswService, "getOSWRecordById")
                .mockResolvedValue(Promise.resolve(<any>{
                    download_osw_url: 'download-osw-url',
                    download_metadata_url: 'download-metadata-url',
                }));

            // Mock the behavior of createOSWConfidenceJob
            jest.spyOn(oswService, "createOSWConfidenceJob")
                .mockResolvedValue('job-id');

            // Mock the behavior of triggerWorkflow
            mockAppContext();

            // Call the function
            const result = await oswService.calculateConfidence(tdeiRecordId, userId);

            // Assertions
            expect(result).toBe('job-id'); // Adjust based on your expected result
            expect(oswService.getOSWRecordById).toHaveBeenCalledWith(tdeiRecordId);
            expect(oswService.createOSWConfidenceJob).toHaveBeenCalledWith(expect.anything()); // You may want to provide more specific expectations
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
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: [{ job_id: 'job-id' }] });

            // Mock the behavior of triggerWorkflow
            mockAppContext();
            // Call the function
            const result = await oswService.processValidationOnlyRequest(userId, datasetFile);

            // Assertions
            expect(result).toBe('job-id'); // Adjust based on your expected result
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getValidationJobPath).toHaveBeenCalledWith('uuid');
            expect(storageService.uploadFile).toHaveBeenCalledWith('validation-job-path/original-name.zip', 'application/zip', expect.anything());
            expect(dbClient.query).toHaveBeenCalled();
            expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
                'OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW',
                expect.anything()
            );
        });

        // Add more test cases as needed
    });

    describe('process publish request', () => {
        const userId = 'user-id';
        const tdeiRecordId = 'tdei-record-id';

        it('should process publish request successfully', async () => {
            // Mock the behavior of dbClient
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rowCount: 0 });// Assume no overlap

            // Mock the behavior of getOSWRecordById and getOSWMetadataById
            const oswRecordMock = { status: 'Draft', tdei_project_group_id: 'project-group-id', download_osw_url: 'download-url' };
            const oswMetadataMock = { getOverlapQuery: jest.fn() };
            const getOSWRecordByIdSpy = jest.spyOn(oswService, 'getOSWRecordById').mockResolvedValue(<any>oswRecordMock);
            const getOSWMetadataByIdSpy = jest.spyOn(oswService, 'getOSWMetadataById').mockResolvedValue(<any>oswMetadataMock);

            // Mock the behavior of triggerWorkflow and obseleteAnyExistingWorkflowHistory
            mockAppContext();
            jest.spyOn(workflowDatabaseService, 'obseleteAnyExistingWorkflowHistory').mockResolvedValue(true);

            // Call the function
            await oswService.processPublishRequest(userId, tdeiRecordId);

            // Assertions
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
            jest.spyOn(oswService, "getServiceById")
                .mockResolvedValue(new ServiceDto({
                    tdei_project_group_id: "project-group-id"
                }));

            mockCore();
            mockAppContext();
            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ tdei_project_group_id: 'project-group-id' });

            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(oswService, 'validateMetadata').mockResolvedValue();
            const uploadSpy = jest.spyOn(storageService, 'uploadFile').mockResolvedValue("file-path");
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValueOnce('mocked-uuid');

            // Mock the behavior of checkMetaNameAndVersionUnique
            jest.spyOn(oswService, 'checkMetaNameAndVersionUnique').mockResolvedValue(false);

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
            expect(result).toEqual('mocked-uuid'); // Adjust the expected value based on your implementation
        });

        it('should throw ServiceNotFoundException if service id not found', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(oswService, "getServiceById")
                .mockResolvedValue(undefined);

            // Call the function
            expect(oswService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(ServiceNotFoundException)); // Adjust the expected value based on your implementation
        });

        it('should throw InputException if metadata name and version not unique', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(oswService, "getServiceById")
                .mockResolvedValue(new ServiceDto({
                    tdei_project_group_id: "project-group-id"
                }));


            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(oswService, 'validateMetadata').mockResolvedValue();

            // Mock the behavior of checkMetaNameAndVersionUnique
            jest.spyOn(oswService, 'checkMetaNameAndVersionUnique').mockResolvedValue(true);

            // Call the function
            expect(oswService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(InputException)); // Adjust the expected value based on your implementation
        });

    });

    describe('get service by Id', () => {
        const serviceId = 'service-id';
        const projectGroupId = 'project-group-id';

        it('should get service by ID successfully', async () => {
            fetchMock.mockResponseOnce(JSON.stringify([{}]));
            jest.spyOn(Utility, "generateSecret").mockResolvedValueOnce("secret");
            const result = await oswService.getServiceById(serviceId, projectGroupId);
            expect(result instanceof ServiceDto)

        });

        it('should handle error during fetch', async () => {
            jest.spyOn(Utility, "generateSecret").mockResolvedValueOnce("secret");
            // fetchMock.mockResponseOnce(JSON.stringify({}));
            fetchMock.mockReject(new Error('Fetch error'));

            expect(oswService.getServiceById(serviceId, projectGroupId)).resolves.toBeUndefined();
        });

    });

    describe('get user project groups', () => {
        const user_id = 'user_id';

        it('should get service by ID successfully', async () => {
            jest.spyOn(Utility, "generateSecret").mockResolvedValueOnce("secret");
            fetchMock.mockResponseOnce(JSON.stringify([]));
            const result = await oswService.getUserProjectGroups(user_id);
            expect(Array.isArray(result));

        });

        it('should handle error during fetch', async () => {
            jest.spyOn(Utility, "generateSecret").mockResolvedValueOnce("secret");
            fetchMock.mockReject(new Error('Fetch error'));

            expect(oswService.getUserProjectGroups(user_id)).resolves.toBeUndefined();
        });

    });

    describe("Invalidate Record Request", () => {
        it("should invalidate the record and return true if query result has rowCount > 0", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_record_id = "mock-tdei-record-id";

            const dummyResponse = <QueryResult<any>>{ rowCount: 1 };
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockResolvedValueOnce(dummyResponse);

            // Act
            const result = await oswService.invalidateRecordRequest(user_id, tdei_record_id);

            // Assert
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
            expect(result).toBe(true);
        });

        it("should not invalidate the record and return false if query result has rowCount <= 0", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_record_id = "mock-tdei-record-id";
            const dummyResponse = <QueryResult<any>>{ rowCount: 0 };
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockResolvedValueOnce(dummyResponse);
            // Act
            const result = await oswService.invalidateRecordRequest(user_id, tdei_record_id);

            // Assert
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
            expect(result).toBe(false);
        });

        it("should throw an error if an error occurs while invalidating the record", async () => {
            // Arrange
            const user_id = "mock-user-id";
            const tdei_record_id = "mock-tdei-record-id";
            const error = new Error("Database error");
            const dbspy = jest
                .spyOn(dbClient, "query")
                .mockRejectedValueOnce(error);

            // Act & Assert
            await expect(oswService.invalidateRecordRequest(user_id, tdei_record_id)).rejects.toThrow(error);
            expect(dbspy).toHaveBeenCalledWith(expect.any(Object));
        });
    });
});

