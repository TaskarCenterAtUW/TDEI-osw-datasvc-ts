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
import pathwaysService from "../../src/service/pathways-service";
import { ServiceEntity } from "../../src/database/entity/service-entity";
import { Utility } from "../../src/utility/utility";

// group test using describe
describe("Pathways Service Test", () => {

    describe("Get Pathways file by Id", () => {
        describe("Functional", () => {
            test("When requested for get pathways file by tdei_dataset_id, Expect to return FileEntity object", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'pathways',
                        dataset_url: 'dataset_url',
                        metadata_url: 'metadata_url',
                        changeset_url: 'changeset_url',
                    }));
                mockCore();

                //Act
                const result = await pathwaysService.getPathwaysStreamById("tdei_dataset_id");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get pathways file with invalid tdei_dataset_id, Expect to throw HttpException", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockRejectedValueOnce(new HttpException(404, "Not Found"));
                mockCore();

                //Act
                //Assert
                expect(pathwaysService.getPathwaysStreamById("tdei_dataset_id")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
                jest.spyOn(tdeiCoreService, "getDatasetDetailsById")
                    .mockResolvedValue(Promise.resolve(<any>{
                        data_type: 'pathways',
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
                expect(pathwaysService.getPathwaysStreamById("tdei_dataset_id")).rejects.toThrow();
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
            const result = await pathwaysService.processValidationOnlyRequest(userId, datasetFile);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(storageService.generateRandomUUID).toHaveBeenCalled();
            expect(storageService.getValidationJobPath).toHaveBeenCalledWith('uuid');
            expect(storageService.uploadFile).toHaveBeenCalledWith('validation-job-path/original-name.zip', 'application/zip', expect.anything(), "gtfspathways");
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                'pathways_validation_only',
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

            // Mock  
            const pathwaysRecordMock = { data_type: 'pathways', status: 'Draft', tdei_project_group_id: 'project-group-id', getOverlapQuery: jest.fn() };
            const getPathwaysRecordByIdSpy = jest.spyOn(tdeiCoreService, 'getDatasetDetailsById').mockResolvedValue(<any>pathwaysRecordMock);
            const validateDatasetDatesSpy = jest.spyOn(tdeiCoreService, 'validateDatasetDates').mockReturnValue(true);

            const mockJobId = 101;
            jest.spyOn(jobService, "createJob")
                .mockResolvedValue(mockJobId);

            // Mock the behavior of triggerWorkflow and obseleteAnyExistingWorkflowHistory
            mockAppContext();
            // jest.spyOn(workflowDatabaseService, 'obseleteAnyExistingWorkflowHistory').mockResolvedValue(true);

            // Call the function
            const result = await pathwaysService.processPublishRequest(userId, tdeiRecordId);

            // Assertions
            expect(result).toBe(mockJobId.toString()); // Adjust based on your expected result
            expect(getPathwaysRecordByIdSpy).toHaveBeenCalledWith(tdeiRecordId);
            // expect(dbClient.query).toHaveBeenCalled();
            expect(validateDatasetDatesSpy).toHaveBeenCalled();
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                'pathways_publish',
                expect.anything(),
                userId
            );
            // expect(workflowDatabaseService.obseleteAnyExistingWorkflowHistory).toHaveBeenCalledWith(tdeiRecordId, undefined);
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
                        "schema_version": "v1.0"
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
            const result = await pathwaysService.processUploadRequest(uploadRequestObject);

            // Assertions
            expect(dbClient.query).toHaveBeenCalled();
            expect(validateMetadataSpy).toHaveBeenCalled(); // You may want to improve this assertion
            expect(uploadSpy).toHaveBeenCalledTimes(2); // Two files: dataset and metadata
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(),
                'pathways_upload',
                expect.any(Object),
                uploadRequestObject.user_id
            );
            expect(result).toEqual(mockJobId.toString()); // Adjust the expected value based on your implementation
        });

        it('should throw ServiceNotFoundException if service id not found', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(undefined);

            // Call the function
            expect(pathwaysService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(ServiceNotFoundException)); // Adjust the expected value based on your implementation
        });

        it('should throw InputException if metadata name and version not unique', async () => {
            // Mock the behavior of getServiceById
            jest.spyOn(tdeiCoreService, "getServiceById")
                .mockResolvedValue(
                    {
                        owner_project_group: "project-group-id"
                    } as ServiceEntity);


            // Mock the behavior of validateMetadata
            const validateMetadataSpy = jest.spyOn(tdeiCoreService, 'validateMetadata').mockRejectedValueOnce(new InputException("Duplicate name"));

            // Mock the behavior of checkMetaNameAndVersionUnique
            // jest.spyOn(tdeiCoreService, 'checkMetaNameAndVersionUnique').mockResolvedValue(true);

            // Call the function
            expect(pathwaysService.processUploadRequest(uploadRequestObject)).rejects.toThrow(expect.any(InputException)); // Adjust the expected value based on your implementation
        });

    });

    describe('process convert request', () => {
        const userId = 'user-id';
        const arcgisUrl = 'https://rtamaps2.soundtransit.org/arcgis/rest/services/Link_IndividualStations_Central/MapServer';
        const datasetFile = {
            originalname: 'drawings.zip',
            buffer: Buffer.from('file-content'),
        };
        const mockJobId = 101;

        function mockJob() {
            jest.spyOn(jobService, "createJob").mockResolvedValue(mockJobId);
            mockAppContext();
        }

        function workflowInput(): any {
            return (appContext.orchestratorService_v2_Instance!.startWorkflow as jest.Mock).mock.calls[0][2];
        }

        it('should start the conversion of an ArcGIS service', async () => {
            mockJob();

            const result = await pathwaysService.processConvertRequest({
                user_id: userId, arcgis_url: arcgisUrl, layers: '7-19', levels: '{"Platform": -1}'
            });

            expect(result).toBe(mockJobId.toString());
            expect(jobService.createJob).toHaveBeenCalledWith(expect.objectContaining({
                job_type: 'Pathways-Convert',
                data_type: 'pathways',
                request_input: { arcgis_url: arcgisUrl, layers: '7-19', levels: { Platform: -1 } }
            }));
            expect(appContext.orchestratorService_v2_Instance!.startWorkflow).toHaveBeenCalledWith(
                mockJobId.toString(), 'pathways_convert', expect.anything(), userId);
            expect(workflowInput()).toEqual(expect.objectContaining({
                job_id: mockJobId.toString(),
                arcgis_url: arcgisUrl,
                dxf_file_upload_path: '',
                layers: '7-19',
                levels: { Platform: -1 },
                control: null,
                tdei_auth_token: ''
            }));
        });

        it('should upload a DXF zip to the converter container and pass its URL on', async () => {
            jest.spyOn(storageService, "generateRandomUUID").mockReturnValue('uuid');
            jest.spyOn(storageService, "getConverterJobPath").mockReturnValue('converter-job-path');
            jest.spyOn(storageService, "uploadFile").mockResolvedValue('dxf-upload-url');
            mockJob();

            await pathwaysService.processConvertRequest({
                user_id: userId, datasetFile: datasetFile, crs: 'EPSG:2926', level_pattern: '_(\\w+)$'
            });

            expect(storageService.getConverterJobPath).toHaveBeenCalledWith('uuid');
            expect(storageService.uploadFile).toHaveBeenCalledWith('converter-job-path/drawings.zip', 'application/zip', expect.anything(), 'pathways-converter');
            expect(workflowInput()).toEqual(expect.objectContaining({
                arcgis_url: '', dxf_file_upload_path: 'dxf-upload-url', crs: 'EPSG:2926', level_pattern: '_(\\w+)$'
            }));
        });

        it('should pass the caller\'s token on only with an agency GTFS dataset, and never store it on the job', async () => {
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValue(<any>{ tdei_dataset_id: 'gtfs-id' });
            mockJob();

            await pathwaysService.processConvertRequest({
                user_id: userId, arcgis_url: arcgisUrl, agency_gtfs_dataset_id: 'gtfs-id', tdei_auth_token: 'token'
            });

            expect(tdeiCoreService.getDatasetDetailsById).toHaveBeenCalledWith('gtfs-id');
            expect(workflowInput()).toEqual(expect.objectContaining({ agency_gtfs_dataset_id: 'gtfs-id', tdei_auth_token: 'token' }));
            const job = (jobService.createJob as jest.Mock).mock.calls[0][0];
            expect(job.request_input).toEqual({ arcgis_url: arcgisUrl, agency_gtfs_dataset_id: 'gtfs-id' });
        });

        it('should not pass the caller\'s token on without an agency GTFS dataset', async () => {
            mockJob();

            await pathwaysService.processConvertRequest({ user_id: userId, arcgis_url: arcgisUrl, tdei_auth_token: 'token' });

            expect(workflowInput()).toEqual(expect.objectContaining({ tdei_auth_token: '', tdei_api_key: '' }));
        });

        it.each([
            ['neither drawings', {}],
            ['both kinds of drawings', { datasetFile: datasetFile, arcgis_url: arcgisUrl }],
            ['an http URL', { arcgis_url: 'http://example.com/arcgis/rest/services/x/MapServer' }],
            ['a URL that is not a map service', { arcgis_url: 'https://example.com/arcgis/rest/services/x' }],
            ['an IP address', { arcgis_url: 'https://10.0.0.1/arcgis/rest/services/x/MapServer' }],
            ['localhost', { arcgis_url: 'https://localhost/arcgis/rest/services/x/MapServer' }],
            ['credentials in the URL', { arcgis_url: 'https://user:pass@example.com/arcgis/rest/services/x/MapServer' }],
            ['levels that are not JSON', { arcgis_url: arcgisUrl, levels: '{Platform: -1}' }],
            ['levels that are not integers', { arcgis_url: arcgisUrl, levels: '{"Platform": "low"}' }],
            ['control that is not a list of text', { arcgis_url: arcgisUrl, control: '[1, 2]' }],
            ['an agency GTFS dataset without the caller\'s access', { arcgis_url: arcgisUrl, agency_gtfs_dataset_id: 'gtfs-id' }],
        ])('should reject a request with %s', async (_name, request: any) => {
            mockJob();

            await expect(pathwaysService.processConvertRequest({ user_id: userId, ...request }))
                .rejects.toBeInstanceOf(InputException);
            expect(jobService.createJob).not.toHaveBeenCalled();
        });
    });
});
