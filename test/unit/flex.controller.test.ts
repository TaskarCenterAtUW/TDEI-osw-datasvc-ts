import { getMockReq, getMockRes } from "@jest-mock/express";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { getMockSASUrl } from "../common/mock-utils";
import flexService from "../../src/service/flex-service";
import flexController from "../../src/controller/flex-controller";
import { Utility } from "../../src/utility/utility";
import { DATASET_UPLOAD_LIMIT_SIZE_BYTES, DATASET_UPLOAD_LIMIT_ERROR_MESSAGE, JOBS_API_PATH } from "../../src/constants/app-constants";

// group test using describe
describe("Flex Controller Test", () => {

    describe("Get Flex file by Id", () => {

        describe("Functional", () => {
            test("When requested for valid tdei_dataset_id, Expect to return downloadable file SAS URL", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                const getFlexByIdSpy = jest
                    .spyOn(flexService, "getFlexDownloadUrl")
                    .mockResolvedValueOnce(getMockSASUrl());
                //Act
                await flexController.getFlexById(req, res, next);
                //Assert
                expect(getFlexByIdSpy).toHaveBeenCalledTimes(1);
            });

            test("When requested for invalid tdei_dataset_id, Expect to return HTTP status 404", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(flexService, "getFlexDownloadUrl")
                    .mockRejectedValueOnce(new HttpException(404, "Record not found"));
                //Act
                await flexController.getFlexById(req, res, next);
                //Assert
                expect(res.status).toBeCalledWith(404);
                expect(next).toHaveBeenCalled();
            });

            test("When unexpected error occured while processing request, Expect to return HTTP status 500", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(flexService, "getFlexDownloadUrl")
                    .mockRejectedValueOnce(new Error("Unexpected error"));
                //Act
                await flexController.getFlexById(req, res, next);
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
                await flexController.getVersions(req, res, next);
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
            jest.spyOn(Utility, "calculateTotalSize").mockReturnValue(101);

            // Mock the processUploadRequest function to return a mock tdei_dataset_id
            jest.spyOn(flexService, "processUploadRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await flexController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `${JOBS_API_PATH}?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing dataset file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing dataset file
            mockRequest.files.dataset = undefined;

            await flexController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle missing metadata file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing metadata file
            mockRequest.files.metadata = undefined;
            jest.spyOn(Utility, "calculateTotalSize").mockReturnValue(101);

            await flexController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('metadata file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            const req = getMockReq();
            const { res, next } = getMockRes();
            // Simulate an internal server error in the flexService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(flexService, "processUploadRequest").mockRejectedValueOnce(mockError);

            await flexController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the upload request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });

        it('should handle file size restriction error', async () => {
            const req = getMockReq();
            const { res, next } = getMockRes();
            jest.spyOn(Utility, "calculateTotalSize").mockReturnValue(DATASET_UPLOAD_LIMIT_SIZE_BYTES + 1);

            await flexController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith(DATASET_UPLOAD_LIMIT_ERROR_MESSAGE);
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
            jest.spyOn(flexService, "processPublishRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await flexController.processPublishRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `${JOBS_API_PATH}?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the flexService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(flexService, "processPublishRequest").mockRejectedValueOnce(mockError);

            await flexController.processPublishRequest(mockRequest, mockResponse, mockNext);

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
            jest.spyOn(Utility, "calculateTotalSize").mockReturnValue(101);

            // Mock the processValidationOnlyRequest function to return a mock job_id
            jest.spyOn(flexService, "processValidationOnlyRequest").mockResolvedValueOnce(mockJobId);

            await flexController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `${JOBS_API_PATH}?job_id=${mockJobId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle validation request with missing dataset file', async () => {
            // Simulate a validation request with missing dataset file
            mockRequest.file = undefined;

            await flexController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the flexService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(flexService, "processValidationOnlyRequest").mockRejectedValueOnce(mockError);

            await flexController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the validation request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });

        it('should handle file size restriction error', async () => {
            const req = getMockReq();
            const { res, next } = getMockRes();
            jest.spyOn(Utility, "calculateTotalSize").mockReturnValue(DATASET_UPLOAD_LIMIT_SIZE_BYTES + 1);

            await flexController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith(DATASET_UPLOAD_LIMIT_ERROR_MESSAGE);
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });
});