import { QueryResult } from "pg";
import dbClient from "../../src/database/data-source";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { mockAppContext, mockCore } from "../common/mock-utils";
import { InputException, ServiceNotFoundException } from "../../src/exceptions/http/http-exceptions";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { Core } from "nodets-ms-core";
import storageService from "../../src/service/storage-service";
import appContext from "../../src/app-context";
import { IUploadRequest } from "../../src/service/interface/upload-request-interface";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import tdeiCoreService from "../../src/service/tdei-core-service";
import jobService from "../../src/service/job-service";
import oswService from "../../src/service/osw-service";
import { DatasetEntity } from "../../src/database/entity/dataset-entity";
import { ServiceEntity } from "../../src/database/entity/service-entity";
import { BboxServiceRequest } from "../../src/model/backend-request-interface";
import { RecordStatus } from "../../src/model/dataset-get-query-params";
import { CreateJobDTO } from "../../src/model/job-dto";
import { TDEIDataType, JobType, JobStatus } from "../../src/model/jobs-get-query-params";
import { WorkflowName } from "../../src/constants/app-constants";
import { SpatialJoinRequest, UnionRequest } from "../../src/model/request-interfaces";
import { Utility } from "../../src/utility/utility";
import { feedbackRequestParams } from "../../src/model/feedback-request-params";
import { FeedbackDownloadRequestParams } from "../../src/model/feedback-download-request-params";

// group test using describe
describe("OSW Service Test", () => {

    describe("calculateTagQualityMetric", () => {
        test("When called with valid inputs, Expect to return tag quality metrics", async () => {
            // Arrange
            const tdei_dataset_id = "mock-dataset-id";
            const tagFile = {
                buffer: JSON.stringify([
                    {
                        entity_type: "Sidewalk",
                        tags: ["surface", "width"],
                    },
                    {
                        entity_type: "Footway",
                        tags: ["surface", "width"],
                    },
                    {
                        entity_type: "PrimaryStreet",
                        tags: ["ext:maxspeed"],
                    }
                ]),
            };
            const user_id = "mock-user-id";
            const expectedMetrics = [
                {
                    entity_type: "Sidewalk",
                    overall_quality_metric: 50,
                    metric_details: {
                        surface_percentage: 25,
                        width_percentage: 25,
                    },
                    total_entity_count: 10,
                },
                {
                    entity_type: "Footway",
                    overall_quality_metric: 75,
                    metric_details: {
                        surface_percentage: 25,
                        width_percentage: 25,
                    },
                    total_entity_count: 20,
                },
            ];

            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'osw',
                    dataset_url: 'dataset_url',
                    metadata_url: 'metadata_url',
                    changeset_url: 'changeset_url',
                }));

            jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: expectedMetrics });

            // Act
            const result = await oswService.calculateTagQualityMetric(
                tdei_dataset_id,
                tagFile,
                user_id
            );

            // Assert
            expect(result).toEqual(expectedMetrics);
            expect(dbClient.query).toHaveBeenCalledTimes(1);
        });

        test("When called with invalid entity type, Expect to input exception", async () => {
            // Arrange
            const tdei_dataset_id = "mock-dataset-id";
            const tagFile = {
                buffer: JSON.stringify([
                    {
                        entity_type: "SidewalkInvalid",
                        tags: ["surface", "width"],
                    },
                    {
                        entity_type: "FootwayInvalid",
                        tags: ["surface", "width"],
                    },
                ]),
            };
            const user_id = "mock-user-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'osw',
                    dataset_url: 'dataset_url',
                    metadata_url: 'metadata_url',
                    changeset_url: 'changeset_url',
                }));
            let dbSpy = jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: [] });

            // Assert
            await expect(
                oswService.calculateTagQualityMetric(tdei_dataset_id, tagFile, user_id)
            ).rejects.toThrow(InputException);
            expect(dbSpy).not.toHaveBeenCalled();
        });

        test("When called with invalid tag, Expect to input exception", async () => {
            // Arrange
            const tdei_dataset_id = "mock-dataset-id";
            const tagFile = {
                buffer: JSON.stringify([
                    {
                        entity_type: "Sidewalk",
                        tags: ["surface_Invalid", "width"],
                    },
                    {
                        entity_type: "Footway",
                        tags: ["surface_Invalid", "width"],
                    },
                ]),
            };
            const user_id = "mock-user-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'osw',
                    dataset_url: 'dataset_url',
                    metadata_url: 'metadata_url',
                    changeset_url: 'changeset_url',
                }));
            let dbSpy = jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: [] });

            // Assert
            await expect(
                oswService.calculateTagQualityMetric(tdei_dataset_id, tagFile, user_id)
            ).rejects.toThrow(InputException);
            expect(dbSpy).not.toHaveBeenCalled();
        });

        test("When called with empty tag list, Expect to throw an InputException", async () => {
            // Arrange
            const tdei_dataset_id = "mock-dataset-id";
            const tagFile = {
                buffer: JSON.stringify([]),
            };
            const user_id = "mock-user-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'osw',
                    dataset_url: 'dataset_url',
                    metadata_url: 'metadata_url',
                    changeset_url: 'changeset_url',
                }));
            let dbSpy = jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: [] });
            // Act & Assert
            await expect(
                oswService.calculateTagQualityMetric(tdei_dataset_id, tagFile, user_id)
            ).rejects.toThrow(InputException);
            expect(dbSpy).not.toHaveBeenCalled();
        });

        test("When called with pathways dataset id, Expect to throw an InputException", async () => {
            // Arrange
            const tdei_dataset_id = "mock-dataset-id";
            const tagFile = {
                buffer: JSON.stringify([
                    {
                        entity_type: "Sidewalk",
                        tags: ["surface_Invalid", "width"],
                    },
                    {
                        entity_type: "Footway",
                        tags: ["surface_Invalid", "width"],
                    },
                ]),
            };
            const user_id = "mock-user-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'pathways',
                    dataset_url: 'dataset_url',
                    metadata_url: 'metadata_url',
                    changeset_url: 'changeset_url',
                }));
            let dbSpy = jest.spyOn(dbClient, "query")
                .mockResolvedValue(<any>{ rows: [] });
            // Act & Assert
            await expect(
                oswService.calculateTagQualityMetric(tdei_dataset_id, tagFile, user_id)
            ).rejects.toThrow(InputException);
            expect(dbSpy).not.toHaveBeenCalled();
        });
    });

    describe("processSpatialQueryRequest", () => {
        test("When source dataset is not a osw dataset, Expect to throw InputException", async () => {
            mockAppContext();
            // Arrange
            const user_id = "mock-user-id";
            const requestService = SpatialJoinRequest.from({
                source_dataset_id: "mock-source-dataset-id",
                target_dataset_id: "mock-target-dataset-id",
                source_dimension: "edge",
                target_dimension: "point",
                join_condition: "ST_Contains(geometry_target, geometry_source)",
                transform_target: "ST_Buffer(geometry_target, 5)",
                transform_source: "",
                filter_target: "highway='footway' AND footway='sidewalk'",
                filter_source: "highway='street_lamp'",
                aggregate: ["array_agg(highway)"],
                attributes: ["highway"]
            });
            let job_id = 303;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue({
                data_type: TDEIDataType.flex
            } as any);
            jest.spyOn(jobService, "createJob").mockResolvedValue(job_id);

            // Act & Assert
            await expect(oswService.processSpatialQueryRequest(user_id, requestService)).rejects.toThrow(InputException);
        });

        test("When target dataset is not a osw dataset, Expect to throw InputException", async () => {
            // Arrange
            mockAppContext();
            const user_id = "mock-user-id";
            const requestService = SpatialJoinRequest.from({
                source_dataset_id: "mock-source-dataset-id",
                target_dataset_id: "mock-target-dataset-id",
                source_dimension: "edge",
                target_dimension: "point",
                join_condition: "ST_Contains(geometry_target, geometry_source)",
                transform_target: "ST_Buffer(geometry_target, 5)",
                transform_source: "",
                filter_target: "highway='footway' AND footway='sidewalk'",
                filter_source: "highway='street_lamp'",
                aggregate: ["array_agg(highway)"],
                attributes: ["highway"]
            });

            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValueOnce({
                data_type: TDEIDataType.osw
            } as any).mockResolvedValueOnce({
                data_type: TDEIDataType.pathways
            } as any);

            // Act & Assert
            await expect(oswService.processSpatialQueryRequest(user_id, requestService)).rejects.toThrow(InputException);
        });

        test("When all conditions are met, Expect to create job, start workflow, and return job_id", async () => {
            // Arrange
            mockAppContext();
            const user_id = "mock-user-id";
            const requestService = SpatialJoinRequest.from({
                source_dataset_id: "mock-source-dataset-id",
                target_dataset_id: "mock-target-dataset-id",
                source_dimension: "edge",
                target_dimension: "point",
                join_condition: "ST_Contains(geometry_target, geometry_source)",
                transform_target: "ST_Buffer(geometry_target, 5)",
                transform_source: "",
                filter_target: "highway='footway' AND footway='sidewalk'",
                filter_source: "highway='street_lamp'",
                aggregate: ["array_agg(highway)"],
                attributes: ["highway"]
            });

            const sourceDataset = {
                data_type: TDEIDataType.osw
            };
            const targetDataset = {
                data_type: TDEIDataType.osw
            };

            const job_id = 303;
            const createJobDTO = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Spatial-Join"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: requestService,
                tdei_project_group_id: '',
                user_id: user_id,
            });

            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById")
                .mockResolvedValueOnce(sourceDataset as any)
                .mockResolvedValueOnce(targetDataset as any);
            jest.spyOn(jobService, "createJob").mockResolvedValueOnce(job_id);
            jest.spyOn(appContext.orchestratorService_v2_Instance!, "startWorkflow").mockResolvedValueOnce();

            // Act
            const result = await oswService.processSpatialQueryRequest(user_id, requestService);

            // Assert
            expect(result).toBe(job_id.toString());
            expect(oswService.jobServiceInstance.createJob).toHaveBeenCalledWith(createJobDTO);
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                job_id.toString(),
                WorkflowName.osw_spatial_join,
                {
                    job_id: job_id.toString(),
                    service: "spatial_join",
                    parameters: requestService,
                    user_id: user_id,
                    source_dataset_id: requestService.source_dataset_id,
                    target_dataset_id: requestService.target_dataset_id
                },
                user_id
            );
        });
    });

    describe("Get OSW file by Id", () => {
        describe("Functional", () => {
            test("When requested for get OSW file by tdei_dataset_id, Expect to return FileEntity object", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'osw',
                        dataset_url: 'download-osw-url',
                        osm_url: "test-url",
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));
                mockCore();

                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "osw", "");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_dataset_id and osm format, Expect to return FileEntity object", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'osw',
                        dataset_url: 'download-osw-url',
                        osm_url: "test-url",
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));
                mockCore();
                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "osw", "");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_dataset_id and osw format, Expect to return FileEntity object", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'osw',
                        dataset_url: 'download-osw-url',
                        osm_url: "test-url",
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));

                mockCore();
                //Act
                const result = await oswService.getOswStreamById("tdei_dataset_id", "osw", "");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file where conversion for osm for tdei_dataset_id not available, Expect to throw HttpException", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'osw',
                        dataset_url: 'download-osw-url',
                        osm_url: "",
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));

                mockCore();
                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "osm", "")).rejects.toThrow(HttpException);
            });

            test("When requested for get OSW file with invalid tdei_dataset_id, Expect to throw HttpException", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockRejectedValueOnce(new HttpException(404, "Not Found"));
                mockCore();

                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "osw", "")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'osw',
                        dataset_url: 'download-osw-url',
                        osm_url: "",
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));

                mockCore();
                //Overrride getStorageClient mock
                jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return null; }
                );

                //Act
                //Assert
                expect(oswService.getOswStreamById("tdei_dataset_id", "", "")).rejects.toThrow();
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
                messageType: WorkflowName.osw_formatting_on_demand,
                data: mockOswFormatRequest,
            };

            // Execute the function
            const result = await oswService.processFormatRequest(mockSource, mockTarget, mockUploadedFile, mockUserId);

            // Assertions
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getFormatJobPath).toHaveBeenCalledWith(mockUid);
            expect(result).toBe(mockJobId.toString());
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                WorkflowName.osw_formatting_on_demand,
                expect.anything(),
                mockUserId
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
                    data_type: 'osw',
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
            const result = await oswService.calculateConfidence(tdeiRecordId, undefined, userId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(tdeiCoreService.getDatasetDetailsById).toHaveBeenCalledWith(tdeiRecordId);
            expect(jobService.createJob).toHaveBeenCalledWith(expect.anything()); // You may want to provide more specific expectations
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                WorkflowName.osw_confidence_on_demand,
                expect.anything(),
                userId
            );
        });

        it('should throw error for confidence request is not for osw dataset', async () => {
            // Mock the behavior of getOSWRecordById
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                .mockResolvedValue(Promise.resolve(<any>{
                    data_type: 'pathways',
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
            const resultAsync = oswService.calculateConfidence(tdeiRecordId, undefined, userId);

            // Assertions
            expect(tdeiCoreService.getDatasetDetailsById).toHaveBeenCalledWith(tdeiRecordId);
            expect(resultAsync).rejects.toThrow(InputException);

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
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                WorkflowName.osw_validation_only,
                expect.anything(),
                userId
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

            // Mock the behavior of getOSWRecordById and getOSWMetadataById
            const oswRecordMock = { valid_from: '2023-12-01', valid_to: '2023-12-12', data_type: 'osw', status: 'Pre-Release', tdei_project_group_id: 'project-group-id', download_osw_url: 'download-url', getOverlapQuery: jest.fn() };
            const getOSWRecordByIdSpy = jest.spyOn(tdeiCoreService, 'getDatasetDetailsById').mockResolvedValue(<any>oswRecordMock);
            const validateDatasetDatesSpy = jest.spyOn(tdeiCoreService, 'validateDatasetDates').mockReturnValue(true);

            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow and obseleteAnyExistingWorkflowHistory
            mockAppContext();
            // jest.spyOn(workflowDatabaseService, 'obseleteAnyExistingWorkflowHistory').mockResolvedValue(true);

            // Call the function
            let result = await oswService.processPublishRequest(userId, tdeiRecordId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(getOSWRecordByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            // expect(dbClient.query).toHaveBeenCalled();
            expect(validateDatasetDatesSpy).toHaveBeenCalled();
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                WorkflowName.osw_publish,
                expect.anything(),
                userId
            );
            // expect(workflowDatabaseService.obseleteAnyExistingWorkflowHistory).toHaveBeenCalledWith(mockJobId.toString(), undefined);
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
                    buffer: Buffer.from(`{"dataset_detail": {
                        "name": "test-flex",
                        "description": "test2",
                        "version": "1.0",
                        "custom_metadata": null,
                        "collected_by": "mahesh",
                        "collection_date": "2023-01-01T00:00:00",
                        "valid_from": "2024-02-28T17:09:39.767191",
                        "valid_to": null,
                        "collection_method": "manual",
                        "data_source": "3rdParty",
                        "dataset_area": {
                            "type": "FeatureCollection",
                            "features": [
                                {
                                    "type": "Feature",
                                    "properties": {},
                                    "geometry": {
                                        "coordinates": [
                                            [
                                                [
                                                    77.5880749566162,
                                                    12.974950278991258
                                                ],
                                                [
                                                    77.58823422871711,
                                                    12.970666567100878
                                                ],
                                                [
                                                    77.59399987874258,
                                                    12.97240489386435
                                                ],
                                                [
                                                    77.59374504338194,
                                                    12.97526069002987
                                                ],
                                                [
                                                    77.5880749566162,
                                                    12.974950278991258
                                                ]
                                            ]
                                        ],
                                        "type": "Polygon"
                                    }
                                }
                            ]
                        },
                        "schema_version": "v0.2"
                    }
                }`),
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
            const validateMetadataSpy = jest.spyOn(tdeiCoreService, 'validateMetadata').mockResolvedValue(true);
            const uploadSpy = jest.spyOn(storageService, 'uploadFile').mockResolvedValue("file-path");
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValueOnce('mocked-uuid');
            Utility.calculateTotalSize  = jest.fn().mockReturnValue(1000);

            // Mock the behavior of checkMetaNameAndVersionUnique
            // jest.spyOn(tdeiCoreService, 'checkMetaNameAndVersionUnique').mockResolvedValue(false);

            // Call the function
            const result = await oswService.processUploadRequest(uploadRequestObject);

            // Assertions
            expect(dbClient.query).toHaveBeenCalled();
            expect(validateMetadataSpy).toHaveBeenCalled(); // You may want to improve this assertion
            expect(uploadSpy).toHaveBeenCalledTimes(2); // Two files: dataset and metadata
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                WorkflowName.osw_upload,
                expect.any(Object),
                uploadRequestObject.user_id
            );
            expect(result).toEqual(mockJobId.toString()); // Adjust the expected value based on your implementation
        });

        it('should throw ServiceNotFoundException if service id not found', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(undefined);
            jest.spyOn(dbClient, "query").mockResolvedValue({ rowCount: 0 } as any);
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

            jest.spyOn(dbClient, "query").mockResolvedValue({
                rowCount: 1, rows: [{
                    owner_project_group: "project-group-id"
                }]
            } as any);
            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(tdeiCoreService, 'validateMetadata').mockRejectedValueOnce(new InputException("Duplicate name"));

            // Mock the behavior of checkMetaNameAndVersionUnique
            // jest.spyOn(tdeiCoreService, 'checkMetaNameAndVersionUnique').mockResolvedValue(true);

            // Call the function
            expect(oswService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(InputException)); // Adjust the expected value based on your implementation
        });

    });

    // describe("Process Dataset Flattening Request", () => {
    //     test("When override is false and there is an existing record, expect to throw InputException", async () => {
    //         // Arrange
    //         const tdei_dataset_id = "test_id";
    //         const override = false;
    //         const queryResult = <QueryResult<any>>{
    //             rowCount: 1
    //         };
    //         jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(new DatasetEntity({ data_type: "osw" }));
    //         jest.spyOn(dbClient, "query").mockResolvedValueOnce(queryResult);

    //         // Act & Assert
    //         await expect(oswService.processDatasetFlatteningRequest("user_id", tdei_dataset_id, override)).rejects.toThrow(InputException);
    //         expect(dbClient.query).toHaveBeenCalledTimes(1);
    //     });

    //     test("When override is true, expect to create a new job and trigger the workflow", async () => {
    //         // Arrange
    //         const tdei_dataset_id = "test_id";
    //         const override = true;
    //         const job_id = "job_id";
    //         jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(new DatasetEntity({ data_type: "osw" }));
    //         jest.spyOn(dbClient, "query").mockResolvedValue({ rows: [{ job_id }] } as any);
    //         // Mock the behavior of triggerWorkflow
    //         mockAppContext();
    //         // Act
    //         const result = await oswService.processDatasetFlatteningRequest("user_id", tdei_dataset_id, override);

    //         // Assert
    //         expect(dbClient.query).toHaveBeenCalledTimes(2);
    //         expect(appContext.orchestratorServiceInstance!.triggerWorkflow).toHaveBeenCalledWith(
    //             "ON_DEMAND_DATASET_FLATTENING_REQUEST_WORKFLOW",
    //             expect.any(QueueMessage)
    //         );
    //         expect(result).toBe(job_id);
    //     });
    // });

    describe("processBboxRequest", () => {
        test("Should create a backend job and trigger the workflow", async () => {
            // Arrange
            const backendRequest: BboxServiceRequest = {
                user_id: "user_id",
                service: "service",
                parameters: {
                    tdei_dataset_id: "string",
                    bbox: "string"
                }
            };
            jest.spyOn(tdeiCoreService, 'getDatasetDetailsById').mockResolvedValueOnce(new DatasetEntity({ data_type: "osw", tdei_project_group_id: 'project-group-id' }));

            const mockJobId = "job_id";
            const mockWorkflowIdentifier = "osm_dataset_bbox";

            const queryResult = <QueryResult<any>>{
                rowCount: 1,
                rows: [{ job_id: mockJobId }],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(queryResult);

            mockAppContext();
            // Act
            const result = await oswService.processBboxRequest(backendRequest, "osm");

            // Assert
            expect(dbClient.query).toHaveBeenCalledTimes(1);
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                mockWorkflowIdentifier,
                expect.any(Object),
                backendRequest.user_id
            );
            expect(result).toBe(mockJobId);
        });

        test("Should throw an error if an exception occurs", async () => {
            // Arrange
            const backendRequest: BboxServiceRequest = {
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
            await expect(oswService.processBboxRequest(backendRequest, "osm")).rejects.toThrow(mockError);
        });
    });

    describe("processDatasetTagRoadRequest", () => {
        test("When dataset is not in Pre-Release state, Expect to throw InputException", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-source-dataset-id",
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Publish"],
                data_type: TDEIDataType.osw,
            } as any;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);

            // Act & Assert
            await expect(oswService.processDatasetTagRoadRequest(backendRequest)).rejects.toThrow(
                new InputException(
                    `Dataset ${backendRequest.parameters.source_dataset_id} is not in Pre-Release state. Dataset road tagging request allowed in Pre-Release state only.`
                )
            );
        });

        test("When requested with pathways dataset , Expect to throw InputException", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-source-dataset-id",
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Pre-Release"],
                data_type: TDEIDataType.pathways,
            } as any;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);

            // Act & Assert
            await expect(oswService.processDatasetTagRoadRequest(backendRequest)).rejects.toThrow(
                new InputException(
                    `Dataset ${backendRequest.parameters.source_dataset_id} is not an osw dataset.`
                )
            );
        });

        test("When dataset is in Pre-Release state, Expect to create job and trigger workflow", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-source-dataset-id",
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Pre-Release"],
                data_type: TDEIDataType.osw,
            } as any;
            const job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Road-Tag"],
                status: JobStatus["IN-PROGRESS"],
                message: "Job started",
                request_input: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters,
                },
                tdei_project_group_id: "",
                user_id: backendRequest.user_id,
            });
            const job_id = 111;
            const queueMessage = QueueMessage.from({
                messageId: job_id.toString(),
                messageType: "osw_dataset_road_tag",
                data: {
                    service: backendRequest.service,
                    user_id: backendRequest.user_id,
                    parameters: backendRequest.parameters,
                },
                publishedDate: "2024-04-02T10:04:58.734Z"
            });
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);
            jest.spyOn(oswService.jobServiceInstance, "createJob").mockResolvedValueOnce(job_id);
            mockAppContext();

            // Act
            const result = await oswService.processDatasetTagRoadRequest(backendRequest);

            // Assert
            expect(result).toBe(job_id.toString());
            expect(oswService.jobServiceInstance.createJob).toHaveBeenCalledWith(job);
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                job_id.toString(),
                "osw_dataset_road_tag",
                expect.any(Object),
                backendRequest.user_id
            );
        });
    });

    describe("processUnionRequest", () => {
        test("When tdei_dataset_id_one dataset is not a osw dataset, Expect to throw InputException", async () => {
            mockAppContext();
            // Arrange
            const user_id = "mock-user-id";
            const requestService = UnionRequest.from({
                tdei_dataset_id_one: "mock-source-dataset-id",
                tdei_dataset_id_two: "mock-target-dataset-id"
            });
            let job_id = 303;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue({
                data_type: TDEIDataType.flex
            } as any);
            jest.spyOn(jobService, "createJob").mockResolvedValue(job_id);

            // Act & Assert
            await expect(oswService.processUnionRequest(user_id, requestService)).rejects.toThrow(InputException);
        });

        test("When tdei_dataset_id_two dataset is not a osw dataset, Expect to throw InputException", async () => {
            // Arrange
            mockAppContext();
            const user_id = "mock-user-id";
            const requestService = UnionRequest.from({
                tdei_dataset_id_one: "mock-source-dataset-id",
                tdei_dataset_id_two: "mock-target-dataset-id"
            });

            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValueOnce({
                data_type: TDEIDataType.osw
            } as any).mockResolvedValueOnce({
                data_type: TDEIDataType.pathways
            } as any);

            // Act & Assert
            await expect(oswService.processUnionRequest(user_id, requestService)).rejects.toThrow(InputException);
        });

        test("When all conditions are met, Expect to create job, start workflow, and return job_id", async () => {
            // Arrange
            mockAppContext();
            const user_id = "mock-user-id";
            const requestService = UnionRequest.from({
                tdei_dataset_id_one: "mock-source-dataset-id",
                tdei_dataset_id_two: "mock-target-dataset-id"
            });

            const sourceDataset = {
                data_type: TDEIDataType.osw
            };
            const targetDataset = {
                data_type: TDEIDataType.osw
            };

            const job_id = 303;
            const createJobDTO = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Union"],
                status: JobStatus["IN-PROGRESS"],
                message: 'Job started',
                request_input: requestService,
                tdei_project_group_id: '',
                user_id: user_id,
            });

            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById")
                .mockResolvedValueOnce(sourceDataset as any)
                .mockResolvedValueOnce(targetDataset as any);
            jest.spyOn(jobService, "createJob").mockResolvedValueOnce(job_id);
            jest.spyOn(appContext.orchestratorService_v2_Instance!, "startWorkflow").mockResolvedValueOnce();

            // Act
            const result = await oswService.processUnionRequest(user_id, requestService);

            // Assert
            expect(result).toBe(job_id.toString());
            expect(oswService.jobServiceInstance.createJob).toHaveBeenCalledWith(createJobDTO);
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                job_id.toString(),
                WorkflowName.osw_union_dataset,
                {
                    job_id: job_id.toString(),
                    service: "union_dataset",
                    parameters: requestService,
                    user_id: user_id,
                    tdei_dataset_id_one: requestService.tdei_dataset_id_one,
                    tdei_dataset_id_two: requestService.tdei_dataset_id_two
                },
                user_id
            );
        });
    });

    describe("OSW Service - calculateInclination", () => {
        test("When dataset is not in Pre-Release state, Expect to throw InputException", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    dataset_id: "mock-dataset-id"
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Publish"],
            } as any;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);

            // Act & Assert
            await expect(oswService.calculateInclination(backendRequest)).rejects.toThrow(
                new InputException(
                    `Dataset ${backendRequest.parameters.dataset_id} is not in Pre-Release state. Dataset incline tagging request allowed in Pre-Release state only.`
                )
            );
        });

        test("When dataset is non-OSW, Expect to throw InputException", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    dataset_id: "mock-dataset-id"
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Pre-Release"],
                data_type: TDEIDataType['pathways']
            } as any;
            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);

            // Act & Assert
            await expect(oswService.calculateInclination(backendRequest)).rejects.toThrow(
                new InputException(
                    `Dataset ${backendRequest.parameters.dataset_id} is not an osw dataset.`
                )
            );
        });

        test("When dataset is in Pre-Release state, Expect to create job and trigger workflow", async () => {
            // Arrange
            const backendRequest = {
                parameters: {
                    dataset_id: "mock-dataset-id"
                },
                service: "mock-service",
                user_id: "mock-user-id",
            };
            const dataset = {
                status: RecordStatus["Pre-Release"],
            } as any;

            // Correctly construct the job object
            const job = CreateJobDTO.from({
                data_type: TDEIDataType.osw,
                job_type: JobType["Dataset-Incline-Tag"],
                status: JobStatus["IN-PROGRESS"],
                message: "Job started",
                request_input: {
                    dataset_id: backendRequest.parameters.dataset_id, // Flattened structure as expected
                    user_id: backendRequest.user_id,
                },
                tdei_project_group_id: "",
                user_id: backendRequest.user_id, // Ensure user_id is included at the top level
            });

            const job_id = 111;

            jest.spyOn(oswService.tdeiCoreServiceInstance, "getDatasetDetailsById").mockResolvedValue(dataset);
            jest.spyOn(oswService.jobServiceInstance, "createJob").mockResolvedValueOnce(job_id);
            mockAppContext();

            // Act
            const result = await oswService.calculateInclination(backendRequest);

            // Assert
            expect(result).toBe(job_id.toString());
            expect(oswService.jobServiceInstance.createJob).toHaveBeenCalledWith(job); // Check correct job object
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                job_id.toString(),
                "osw_dataset_incline_tag",
                expect.any(Object), // Ensure the correct object is passed to the workflow
                backendRequest.user_id
            );
        });
    });

    describe("downloadFeedbacks", () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });
        test("should return csv stream of feedbacks without limit", async () => {
            const rows = [{
                id: 1,
                tdei_project_group_id: 'pg1',
                project_group_name: 'PG',
                tdei_dataset_id: 'ds1',
                dataset_name: 'Dataset',
                dataset_element_id: 'way/1',
                feedback_text: 'test',
                customer_email: 'user@example.com',
                location_latitude: 1,
                location_longitude: 2,
                created_at: new Date('2025-01-01T00:00:00Z'),
                updated_at: new Date('2025-01-01T00:00:00Z'),
                status: 'open',
                due_date: new Date('2025-01-02T00:00:00Z')
            }];
            jest.spyOn(dbClient, 'query').mockResolvedValueOnce(<any>{ rows });
            const params = new FeedbackDownloadRequestParams({ tdei_project_group_id: 'pg1' });

            const stream = await oswService.downloadFeedbacks(params, true, 'csv');
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk));
            }
            const csv = Buffer.concat(chunks).toString();
            const expected = 'id,project_group_id,project_group_name,dataset_id,dataset_name,dataset_element_id,feedback_text,reporter_email,location_latitude,location_longitude,created_at,updated_at,status,due_date\n' +
                '1,pg1,PG,ds1,Dataset,way/1,test,user@example.com,1,2,2025-01-01T00:00:00.000Z,2025-01-01T00:00:00.000Z,open,2025-01-02T00:00:00.000Z\n';

            expect(csv).toBe(expected);
            const query = (dbClient.query as jest.Mock).mock.calls[0][0];
            expect(query.text).not.toContain('LIMIT');
        });

        test("should include limit when pagination provided", async () => {
            const rows: any[] = [];
            jest.spyOn(dbClient, 'query').mockResolvedValueOnce(<any>{ rows });
            const params = new FeedbackDownloadRequestParams({ tdei_project_group_id: 'pg1', page_size: 5, page_no: 2 });

            await oswService.downloadFeedbacks(params, false, 'csv');
            const query = (dbClient.query as jest.Mock).mock.calls[0][0];
            expect(query.text).toContain('LIMIT 5');
            expect(query.text).toContain('OFFSET 5');
        });

        test("should throw error when db query fails", async () => {
            const error = new Error('db error');
            jest.spyOn(dbClient, 'query').mockRejectedValueOnce(error);
            const params = new FeedbackDownloadRequestParams({ tdei_project_group_id: 'pg1' });

            await expect(oswService.downloadFeedbacks(params, true, 'csv')).rejects.toThrow(error);
        });

        test("should throw error for unsupported format", async () => {
            const params = new FeedbackDownloadRequestParams({ tdei_project_group_id: 'pg1' });
            await expect(oswService.downloadFeedbacks(params, true, 'json')).rejects.toThrow(InputException);
        });
    });
});

