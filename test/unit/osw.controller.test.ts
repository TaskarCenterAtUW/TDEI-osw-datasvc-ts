import oswController from "../../src/controller/osw-controller";
import { OswDTO } from "../../src/model/osw-dto";
import oswService from "../../src/service/osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { getMockFileEntity } from "../common/mock-utils";

// group test using describe
describe("OSW Controller Test", () => {

    describe("Get OSW list", () => {
        describe("Functional", () => {
            test("When requested with empty search criteria, Expect to return OSW list", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();
                const list: OswDTO[] = [<OswDTO>{}]
                const getAllOswSpy = jest
                    .spyOn(oswService, "getAllOsw")
                    .mockResolvedValueOnce(list);
                //Act
                await oswController.getAllOsw(req, res, next);
                //Assert
                expect(getAllOswSpy).toHaveBeenCalledTimes(1);
                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toBeCalledWith(list);
            });

            test("When requested with bad collection_date input, Expect to return HTTP status 400", async () => {
                //Arrange
                const req = getMockReq({ body: { collection_date: "2023" } });
                const { res, next } = getMockRes();
                jest
                    .spyOn(oswService, "getAllOsw")
                    .mockRejectedValueOnce(new InputException("Invalid date provided."));
                //Act
                await oswController.getAllOsw(req, res, next);
                //Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(next).toHaveBeenCalled();
            });

            test("When unknown or database exception occured while processing request, Expect to return HTTP status 500", async () => {
                //Arrange
                const req = getMockReq({ body: { collection_date: "2023" } });
                const { res, next } = getMockRes();
                jest
                    .spyOn(oswService, "getAllOsw")
                    .mockRejectedValueOnce(new Error("unknown error"));
                //Act
                await oswController.getAllOsw(req, res, next);
                //Assert
                expect(res.status).toHaveBeenCalledWith(500);
                expect(next).toHaveBeenCalled();
            });
        });
    });

    describe("Get OSW file by Id", () => {

        describe("Functional", () => {
            test("When requested for valid tdei_record_id, Expect to return downloadable file stream", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                const getOswByIdSpy = jest
                    .spyOn(oswService, "getOswStreamById")
                    .mockResolvedValueOnce([getMockFileEntity()]);
                //Act
                await oswController.getOswById(req, res, next);
                //Assert
                expect(getOswByIdSpy).toHaveBeenCalledTimes(1);
            });

            test("When requested for invalid tdei_record_id, Expect to return HTTP status 404", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(oswService, "getOswStreamById")
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
                    .spyOn(oswService, "getOswStreamById")
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

        it('should process the upload request and return tdei_record_id', async () => {
            const { res, next } = getMockRes();
            const mockTdeiRecordId = 'mock-tdei-record-id';

            // Mock the processUploadRequest function to return a mock tdei_record_id
            jest.spyOn(oswService, "processUploadRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await oswController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/osw/upload/status/${mockTdeiRecordId}`);
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
                    tdei_record_id: 'mock-tdei-record-id',
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

        it('should process the publish request and return tdei_record_id', async () => {
            const mockTdeiRecordId = 'mock-tdei-record-id';

            // Mock the processPublishRequest function to return a mock tdei_record_id
            jest.spyOn(oswService, "processPublishRequest").mockResolvedValueOnce();

            await oswController.processPublishRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/osw/publish/status/${mockTdeiRecordId}`);
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

        // Add more test cases as needed
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
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/osw/validation/status/${mockJobId}`);
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
                body: {
                    user_id: 'mock-user-id',
                    tdei_record_id: 'mock-tdei-record-id',
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
            expect(mockResponse.send).toHaveBeenCalledWith({ job_id: mockJobId, tdei_record_id: mockRequest.body.tdei_record_id });
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/osw/confidence/status/${mockJobId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle calculate confidence request with missing tdei_record_id', async () => {
            // Simulate a calculate confidence request with missing tdei_record_id
            mockRequest.body.tdei_record_id = undefined;

            await oswController.calculateConfidence(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('Please add tdei_record_id in payload');
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

    describe('get confidence job status', () => {
        let mockRequest: any;
        let mockResponse: any;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockRequest = {
                params: {
                    job_id: 'mock-job-id',
                },
            };

            mockResponse = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
            };

            mockNext = jest.fn();
        });

        it('should return confidence job status', async () => {
            const mockJobInfo = {
                job_id: 'mock-job-id',
                confidence_metric: 0.85,
                status: 'completed',
                updated_at: new Date(),
            };

            // Mock the getOSWConfidenceJob function to return mock job info
            jest.spyOn(oswService, "getOSWConfidenceJob").mockResolvedValueOnce(<any>mockJobInfo);

            await oswController.getConfidenceJobStatus(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.send).toHaveBeenCalledWith({
                job_id: mockJobInfo.job_id,
                confidenceValue: mockJobInfo.confidence_metric,
                status: mockJobInfo.status,
                updatedAt: mockJobInfo.updated_at,
                message: 'ok',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle error during confidence job status retrieval', async () => {
            // Simulate an error during confidence job status retrieval
            const mockError = new Error('Error retrieving confidence job status');
            jest.spyOn(oswService, "getOSWConfidenceJob").mockRejectedValueOnce(mockError);

            await oswController.getConfidenceJobStatus(mockRequest, mockResponse, mockNext);

            expect(mockNext).toHaveBeenCalledWith(mockError);
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
                    source: 'mock-source',
                    target: 'mock-target',
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

            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', '/api/v1/osw/convert/status/mock-job-id');
            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith({ job_id: mockJobId });
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

    describe('Invalidate the record', () => {

        test("When requested to invalidate a record, Expect to return http status 200 and true if successful", async () => {
            // Arrange
            const req = getMockReq({ body: { user_id: "user_id" }, params: { tdei_record_id: "record_id" } });
            const { res, next } = getMockRes();
            const invalidateRecordRequestSpy = jest.spyOn(oswService, "invalidateRecordRequest").mockResolvedValueOnce(true);

            // Act
            await oswController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_record_id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(true);
            expect(next).not.toHaveBeenCalled();
        });

        test("When an error occurs while processing the invalidate request, Expect to return http status 500 and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_record_id: "record_id"
                },
                body: {
                    user_id: "user_id"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Error while processing the invalidate request");
            const invalidateRecordRequestSpy = jest.spyOn(oswService, "invalidateRecordRequest").mockRejectedValueOnce(error);

            // Act
            await oswController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_record_id);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the invalidate request");
            expect(next).toHaveBeenCalledWith(error);
        });

        test("When an HttpException occurs while processing the invalidate request, Expect to return corresponding http status and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_record_id: "record_id"
                },
                body: {
                    user_id: "user_id"
                }
            });
            const { res, next } = getMockRes();
            const error = new HttpException(400, "Bad request");
            const invalidateRecordRequestSpy = jest.spyOn(oswService, "invalidateRecordRequest").mockRejectedValueOnce(error);

            // Act
            await oswController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_record_id);
            expect(res.status).toHaveBeenCalledWith(error.status);
            expect(res.send).toHaveBeenCalledWith(error.message);
            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('Download the file after formatting getFormatDownloadFile', () => {

        it('should throw jobId not found if not found', async () => {

        })
        it('should throw job incomplete if the status is not completed', async () => {

        })
        it('should send 400 error if the format is not the right one', async () => {

        })
        it('should throw input exception if job_id is not given', async () => {

        })

    })
});