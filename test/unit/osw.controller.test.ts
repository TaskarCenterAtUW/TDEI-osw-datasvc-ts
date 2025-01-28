import oswController from "../../src/controller/osw-controller";
import oswService from "../../src/service/osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { ForbiddenAccess, InputException, UnAuthenticated } from "../../src/exceptions/http/http-exceptions";
import tdeiCoreService from "../../src/service/tdei-core-service";
import { Utility } from "../../src/utility/utility";

// group test using describe
describe("OSW Controller Test", () => {
    describe("tagQualityMetric", () => {
        test("When requested with valid parameters, Expect to return HTTP status 200 and the result", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                file: "mock-tag-file",
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const expectedResult = "mock-result";
            jest.spyOn(oswService, "calculateTagQualityMetric").mockResolvedValueOnce(expectedResult);

            // Act
            await oswController.tagQualityMetric(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(expectedResult);
            expect(next).not.toHaveBeenCalled();
        });

        test("When an error occurs while calculating the quality metric, Expect to return HTTP status 500 and an error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                file: "mock-tag-file",
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Error calculating the quality metric");
            jest.spyOn(oswService, "calculateTagQualityMetric").mockRejectedValueOnce(error);

            // Act
            await oswController.tagQualityMetric(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error calculating the quality metric for a given osw entity tags");
            expect(next).toHaveBeenCalledWith(new HttpException(500, "Error calculating the quality metric for a given osw entity tags"));
        });

        test("When an HttpException occurs, Expect to return the corresponding HTTP status and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                file: "mock-tag-file",
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const error = new HttpException(400, "Bad request");
            jest.spyOn(oswService, "calculateTagQualityMetric").mockRejectedValueOnce(error);

            // Act
            await oswController.tagQualityMetric(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(error.status);
            expect(res.send).toHaveBeenCalledWith(error.message);
            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe("processSpatialQueryRequest", () => {
        test("When request body is empty, Expect to call next with InputException", async () => {
            // Arrange
            const req = getMockReq();
            const { res, next } = getMockRes();

            // Act
            await oswController.processSpatialQueryRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(expect.any(InputException));
        });

        test("When request body is valid, Expect to process the request and return 202 status code", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: "mock-user-id",
                    "target_dataset_id": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "target_dimension": "edge",
                    "source_dataset_id": "0d661b69495d47fb838862edf699fe09",
                    "source_dimension": "point",
                    "join_condition": "ST_Contains(geometry_target, geometry_source)",
                    "transform_target": "ST_Buffer(geometry_target, 5)",
                    "transform_source": null,
                    "filter_target": "highway='footway' AND footway='sidewalk'",
                    "filter_source": "highway='street_lamp'",
                    "aggregate": [
                        "array_agg(highway)"
                    ],
                    "attributes": ["highway"]
                }
            });
            let job_id = "mock-job-id";
            const { res, next } = getMockRes();

            jest.spyOn(oswService, "processSpatialQueryRequest").mockResolvedValueOnce(job_id);
            // Act
            await oswController.processSpatialQueryRequest(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
            expect(res.setHeader).toHaveBeenCalledWith("Location", expect.any(String));
        });

        test("When an error occurs, Expect to call next with HttpException and return 500 status code", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: 'mock-user-id',
                    "target_dataset_id": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "target_dimension": "edge",
                    "source_dataset_id": "0d661b69495d47fb838862edf699fe09",
                    "source_dimension": "point",
                    "join_condition": "ST_Contains(geometry_target, geometry_source)",
                    "transform_target": "ST_Buffer(geometry_target, 5)",
                    "transform_source": null,
                    "filter_target": "highway='footway' AND footway='sidewalk'",
                    "filter_source": "highway='street_lamp'",
                    "aggregate": [
                        "array_agg(highway)"
                    ],
                    "attributes": ["highway"]
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Some error message");

            // Mock the oswService.processSpatialQueryRequest method to throw an error
            jest.spyOn(oswService, "processSpatialQueryRequest").mockRejectedValue(error);

            // Act
            await oswController.processSpatialQueryRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(expect.any(HttpException));
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the spatial join request");
        });
    });

    describe("Process Dataset Tag Road Request", () => {
        test("When request body is empty, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({ query: {} });
            const { res, next } = getMockRes();
            const inputException = new InputException("required input is empty", res);
            jest.spyOn(oswService, "processDatasetTagRoadRequest").mockRejectedValueOnce(inputException);

            // Act
            await oswController.processDatasetTagRoadRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(inputException);
        });

        test("When required input is empty, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    source_dataset_id: undefined,
                    target_dataset_id: undefined
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const inputException = new InputException("required input is empty", res);
            jest.spyOn(oswService, "processDatasetTagRoadRequest").mockRejectedValueOnce(inputException);

            // Act
            await oswController.processDatasetTagRoadRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(inputException);
        });

        test("When user is not authorized, Expect to return HTTP status 403", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-target-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(false);
            const unauthenticatedException = new ForbiddenAccess();
            jest.spyOn(oswService, "processDatasetTagRoadRequest").mockRejectedValueOnce(unauthenticatedException);

            // Act
            await oswController.processDatasetTagRoadRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(unauthenticatedException);
        });

        test("When request is valid, Expect to return HTTP status 202 with job_id", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-target-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const job_id = "mock-job-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(true);
            jest.spyOn(oswService, "processDatasetTagRoadRequest").mockResolvedValueOnce(job_id);

            // Act
            await oswController.processDatasetTagRoadRequest(req, res, next);

            // Assert
            expect(res.setHeader).toHaveBeenCalledWith("Location", `/api/v1/job?job_id=${job_id}`);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
        });

        test("When an error occurs while processing the request, Expect to return HTTP status 500", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    source_dataset_id: "mock-source-dataset-id",
                    target_dataset_id: "mock-target-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Internal Server Error");
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(true);
            jest.spyOn(oswService, "processDatasetTagRoadRequest").mockRejectedValueOnce(error);

            // Act
            await oswController.processDatasetTagRoadRequest(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the dataset bbox request");
            expect(next).toHaveBeenCalledWith(new HttpException(500, "Error while processing the dataset bbox request"));
        });
    });

    describe("Process Dataset Bbox Request", () => {
        test("When request body is empty, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({ query: {} });
            const { res, next } = getMockRes();
            const inputException = new InputException("required input is empty", res);
            jest.spyOn(oswService, "processBboxRequest").mockRejectedValueOnce(inputException);

            // Act
            await oswController.processDatasetBboxRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(inputException);
        });

        test("When request is valid, Expect to return HTTP status 202 with job_id", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    tdei_dataset_id: "mock-tdei_dataset_id",
                    bbox: ['0', '0', '0', '0']
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const job_id = "mock-job-id";
            jest.spyOn(oswService, "processBboxRequest").mockResolvedValueOnce(job_id);

            // Act
            await oswController.processDatasetBboxRequest(req, res, next);

            // Assert
            expect(res.setHeader).toHaveBeenCalledWith("Location", `/api/v1/job?job_id=${job_id}`);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
        });

        test("When an error occurs while processing the request, Expect to return HTTP status 500", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    tdei_dataset_id: "mock-tdei_dataset_id",
                    bbox: ['0', '0', '0', '0']
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Internal Server Error");
            jest.spyOn(oswService, "processBboxRequest").mockRejectedValueOnce(error);

            // Act
            await oswController.processDatasetBboxRequest(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the dataset bbox request");
            expect(next).toHaveBeenCalledWith(new HttpException(500, "Error while processing the dataset bbox request"));
        });
    });

    describe("Get OSW file by Id", () => {

        describe("Functional", () => {
            // test("When requested for valid tdei_dataset_id, Expect to return downloadable file stream", async () => {
            //     //Arrange
            //     const req = getMockReq({ query: { format: "osm", version: "latest" }, params: { id: "mock-tdei_dataset_id" } });
            //     const { res, next } = getMockRes();
            //     // jest.mock('fs');
            //     let mockWriteStream = new EventEmitter();
            //     jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockWriteStream as any);

            //     // const zipFileBuffer = Buffer.from("mock-zip-file");
            //     const getOswByIdSpy = jest
            //         .spyOn(oswService, "getOswStreamById")
            //         .mockResolvedValueOnce([getMockFileEntity()]);
            //     AdmZip.prototype.addLocalFile = jest.fn();
            //     AdmZip.prototype.toBuffer = jest.fn();
            //     // jest.spyOn(AdmZip.prototype, "addLocalFile").mockImplementationOnce(() => { });
            //     // jest.spyOn(AdmZip.prototype, "toBuffer").mockReturnValueOnce();
            //     //Act
            //     // mockWriteStream.emit('finish');

            //     await oswController.getOswById(req, res, next);
            //     //Assert
            //     expect(getOswByIdSpy).toHaveBeenCalledTimes(1);
            // }, 20000);

            test("When requested for invalid tdei_dataset_id, Expect to return HTTP status 404", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(oswService, "getDownloadableOSWUrl")
                    .mockRejectedValueOnce(new HttpException(404, "Record not found"));
                //Act
                await oswController.getOswById(req, res, next);
                //Assert
                expect(res.status).toBeCalledWith(404);
                expect(next).toHaveBeenCalled();
            });

            test("When unexpected error occured while processing request, Expect to return HTTP status 500", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(oswService, "getDownloadableOSWUrl")
                    .mockRejectedValueOnce(new Error("Unexpected error"));
                //Act
                await oswController.getOswById(req, res, next);
                //Assert
                expect(res.status).toBeCalledWith(500);
                expect(next).toHaveBeenCalled();
            });
        });
    });

    describe("Get Version list", () => {
        describe("Functional", () => {

            test("When requested version info, Expect to return HTTP status 200", async () => {
                //Arrange
                let req = getMockReq();
                const { res, next } = getMockRes();
                //Act
                await oswController.getVersions(req, res, next);
                //Assert
                expect(res.status).toHaveBeenCalledWith(200);
            });
        });
    });

    describe('process upload request', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = {
                body: {
                    user_id: 'mock-user-id',
                },
                params: {
                    tdei_project_group_id: 'mock-project-group-id',
                    tdei_service_id: 'mock-service-id',
                },
                files: {
                    dataset: {
                        // Mock dataset file
                    },
                    metadata: {
                        // Mock metadata file
                    },
                    // Mock changeset file if needed
                },
            };

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should process the upload request and return tdei_dataset_id', async () => {
            const { res, next } = getMockRes();
            const mockTdeiRecordId = 'mock-tdei_dataset_id';

            // Mock the processUploadRequest function to return a mock tdei_dataset_id
            jest.spyOn(oswService, "processUploadRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await oswController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing dataset file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing dataset file
            mockRequest.files.dataset = undefined;

            await oswController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle missing metadata file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing metadata file
            mockRequest.files.metadata = undefined;

            await oswController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('metadata file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            const req = getMockReq();
            const { res, next } = getMockRes();
            // Simulate an internal server error in the oswService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(oswService, "processUploadRequest").mockRejectedValueOnce(mockError);

            await oswController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the upload request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });

    describe('process publish request', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = {
                params: {
                    tdei_dataset_id: 'mock-tdei_dataset_id',
                },
                body: {
                    user_id: 'mock-user-id',
                },
            };

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should process the publish request and return tdei_dataset_id', async () => {
            const mockTdeiRecordId = 'mock-tdei_dataset_id';

            // Mock the processPublishRequest function to return a mock tdei_dataset_id
            jest.spyOn(oswService, "processPublishRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await oswController.processPublishRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the oswService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(oswService, "processPublishRequest").mockRejectedValueOnce(mockError);

            await oswController.processPublishRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the publish request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });

    describe('process validation only request', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = {
                body: {
                    user_id: 'mock-user-id',
                },
                file: {
                    originalname: 'mock-dataset-file.zip',
                    buffer: Buffer.from('mock-dataset-file-content'),
                },
            };

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should process the validation request and return job_id', async () => {
            const mockJobId = 'mock-job-id';

            // Mock the processValidationOnlyRequest function to return a mock job_id
            jest.spyOn(oswService, "processValidationOnlyRequest").mockResolvedValueOnce(mockJobId);

            await oswController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockJobId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle validation request with missing dataset file', async () => {
            // Simulate a validation request with missing dataset file
            mockRequest.file = undefined;

            await oswController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the oswService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(oswService, "processValidationOnlyRequest").mockRejectedValueOnce(mockError);

            await oswController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the validation request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });

    describe('calculate confidence metric', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = {
                params: {
                    tdei_dataset_id: 'mock-tdei_dataset_id',
                },
                body: {
                    user_id: 'mock-user-id'
                },
            };

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should calculate confidence and return job_id', async () => {
            const mockJobId = 'mock-job-id';

            // Mock the calculateConfidence function to return a mock job_id
            jest.spyOn(oswService, "calculateConfidence").mockResolvedValueOnce(mockJobId);

            await oswController.calculateConfidence(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockJobId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle calculate confidence request with missing tdei_dataset_id', async () => {
            // Simulate a calculate confidence request with missing tdei_dataset_id
            mockRequest.params.tdei_dataset_id = undefined;

            await oswController.calculateConfidence(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('Please add tdei_dataset_id in payload');
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the oswService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(oswService, "calculateConfidence").mockRejectedValueOnce(mockError);

            await oswController.calculateConfidence(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the calculate Confidence request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });

    describe('create format request', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = getMockReq({
                body: {
                    user_id: 'mock-user-id',
                    source_format: 'osw',
                    target_format: 'osm',
                },
                file: {
                    originalname: 'mock-file.txt',
                    buffer: Buffer.from('Mock file content'),
                }
            });

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should create format request and return job_id', async () => {
            const mockJobId = 'mock-job-id';

            // Mock the processFormatRequest function to return mock job_id
            jest.spyOn(oswService, "processFormatRequest").mockResolvedValueOnce(mockJobId);

            await oswController.createFormatRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', '/api/v1/job?job_id=mock-job-id');
            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing upload file input', async () => {
            // Simulate missing upload file input
            mockRequest.file = undefined;

            await oswController.createFormatRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('Missing upload file input');
            expect(mockNext).toHaveBeenCalledWith(expect.any(Error)); // InputException should be thrown
        });

        it('should handle error during format request processing', async () => {
            // Simulate an error during format request processing
            const mockError = new Error('Error while processing the format request');
            jest.spyOn(oswService, "processFormatRequest").mockRejectedValueOnce(mockError);

            await oswController.createFormatRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the format request');
            expect(mockNext).toHaveBeenCalledWith(mockError);
        });
    });

    describe('calculate quality metric', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = getMockReq({
                body: {
                    user_id: 'mock-user-id',

                    algorithm: 'mock-algorithm',
                },
                params: {
                    tdei_dataset_id: 'mock-tdei_dataset_id'
                }
            });

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                setHeader: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should calculate quality metric and return job_id', async () => {
            const mockJobId = 'mock-job-id';

            // Mock the calculateQualityMetric function to return mock job_id
            jest.spyOn(oswService, "calculateQualityMetric").mockResolvedValueOnce(mockJobId);

            await oswController.createIXNQualityOnDemandRequest(mockRequest, mockResponse, mockNext);

            // expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', '/api/v1/job?job_id=mock-job-id');
            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing tdei_dataset_id input', async () => {
            // Simulate missing tdei_dataset_id input
            mockRequest.params.tdei_dataset_id = undefined;

            await oswController.createIXNQualityOnDemandRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('Missing tdei_dataset_id input');
            expect(mockNext).toHaveBeenCalledWith(expect.any(Error)); // InputException should be thrown
        });

        it('should handle error during quality metric calculation', async () => {
            // Simulate an error during quality metric calculation
            const mockError = new Error('Error while processing the quality metric');
            jest.spyOn(oswService, "calculateQualityMetric").mockRejectedValueOnce(mockError);

            await oswController.createIXNQualityOnDemandRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the quality metric');
            expect(mockNext).toHaveBeenCalledWith(mockError);
        });
    });

    describe("processUnionQueryRequest", () => {
        test("When request body is empty, Expect to call next with InputException", async () => {
            // Arrange
            const req = getMockReq();
            const { res, next } = getMockRes();

            // Act
            await oswController.processDatasetUnionRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(expect.any(InputException));
        });

        test("When request body proximity param is string, Expect to call next with InputException", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: "mock-user-id",
                    "tdei_dataset_id_one": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "tdei_dataset_id_two": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "proximity": "string"
                }
            });
            const { res, next } = getMockRes();

            // Act
            await oswController.processDatasetUnionRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(expect.any(InputException));
        });

        test("When request body is valid, Expect to process the request and return 202 status code", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: "mock-user-id",
                    "tdei_dataset_id_one": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "tdei_dataset_id_two": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b"
                }
            });
            let job_id = "mock-job-id";
            const { res, next } = getMockRes();

            jest.spyOn(oswService, "processUnionRequest").mockResolvedValueOnce(job_id);
            // Act
            await oswController.processDatasetUnionRequest(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
            expect(res.setHeader).toHaveBeenCalledWith("Location", expect.any(String));
        });


        test("When request body is valid with proximity, Expect to process the request and return 202 status code", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: "mock-user-id",
                    "tdei_dataset_id_one": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "tdei_dataset_id_two": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "proximity": 10
                }
            });
            let job_id = "mock-job-id";
            const { res, next } = getMockRes();

            jest.spyOn(oswService, "processUnionRequest").mockResolvedValueOnce(job_id);
            // Act
            await oswController.processDatasetUnionRequest(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
            expect(res.setHeader).toHaveBeenCalledWith("Location", expect.any(String));
        });

        test("When an error occurs, Expect to call next with HttpException and return 500 status code", async () => {
            // Arrange
            const req = getMockReq({
                body: {
                    user_id: "mock-user-id",
                    "tdei_dataset_id_one": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b",
                    "tdei_dataset_id_two": "fa8e12ea-6b0c-4d3e-8b38-5b87b268e76b"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Some error message");

            // Mock the oswService.processUnionQueryRequest method to throw an error
            jest.spyOn(oswService, "processUnionRequest").mockRejectedValue(error);

            // Act
            await oswController.processDatasetUnionRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(expect.any(HttpException));
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the union dataset request");
        });
    });


    describe("OSW Controller - createInclineRequest", () => {

        test("When request body is empty, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({ query: {} });
            const { res, next } = getMockRes();
            const inputException = new InputException("Missing tdei_dataset_id input", res);
            jest.spyOn(oswService, "calculateInclination").mockRejectedValueOnce(inputException);

            // Act
            await oswController.createInclineRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(inputException);
        });

        test("When required input is empty, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    tdei_dataset_id: undefined
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const inputException = new InputException("Missing tdei_dataset_id input", res);
            jest.spyOn(oswService, "calculateInclination").mockRejectedValueOnce(inputException);

            // Act
            await oswController.createInclineRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(inputException);
        });

        test("When user is not authorized, Expect to return HTTP status 403", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(false);
            const unauthenticatedException = new ForbiddenAccess();
            jest.spyOn(oswService, "calculateInclination").mockRejectedValueOnce(unauthenticatedException);

            // Act
            await oswController.createInclineRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(unauthenticatedException);
        });

        test("When user is not authorized wrong api key, Expect to return HTTP status 403", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                },
                headers: {
                    'x-api-key': 'Wrong key'
                }
            });
            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(false);
            const unauthenticatedException = new ForbiddenAccess();
            jest.spyOn(oswService, "calculateInclination").mockRejectedValueOnce(unauthenticatedException);

            // Act
            await oswController.createInclineRequest(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(unauthenticatedException);
        });

        test("When request is valid, Expect to return HTTP status 202 with job_id", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-dataset-id"
                },
                body: {
                    user_id: "mock-user-id"
                }
            });
            const { res, next } = getMockRes();
            const job_id = "mock-job-id";
            jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce({ tdei_project_group_id: "mock-project-group-id" } as any);
            jest.spyOn(Utility, "authorizeRoles").mockResolvedValueOnce(true);
            jest.spyOn(oswService, "calculateInclination").mockResolvedValueOnce(job_id);

            // Act
            await oswController.createInclineRequest(req, res, next);

            // Assert
            expect(res.setHeader).toHaveBeenCalledWith("Location", `/api/v1/job?job_id=${job_id}`);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.send).toHaveBeenCalledWith(job_id);
        });
    })
});