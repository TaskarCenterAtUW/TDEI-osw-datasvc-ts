import { getMockReq, getMockRes } from "@jest-mock/express";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { getMockFileEntity } from "../common/mock-utils";
import { DatasetDTO } from "../../src/model/dataset-dto";
import tdeiCoreService from "../../src/service/tdei-core-service";
import pathwaysService from "../../src/service/pathways-service";
import pathwaysController from "../../src/controller/pathways-controller";

// group test using describe
describe("Pathways Controller Test", () => {

    // describe("Get Pathways list", () => {
    //     describe("Functional", () => {
    //         test("When requested with empty search criteria, Expect to return pathways list", async () => {
    //             //Arrange
    //             const req = getMockReq();
    //             const { res, next } = getMockRes();
    //             const list: DatasetDTO[] = [<DatasetDTO>{}]
    //             const getDatasetsSpy = jest
    //                 .spyOn(tdeiCoreService, "getDatasets")
    //                 .mockResolvedValueOnce(list);
    //             //Act
    //             await pathwaysController.getDatasetList(req, res, next);
    //             //Assert
    //             expect(getDatasetsSpy).toHaveBeenCalledTimes(1);
    //             expect(res.status).toHaveBeenCalledWith(200);
    //             expect(res.send).toBeCalledWith(list);
    //         });

    //         test("When requested with bad collection_date input, Expect to return HTTP status 400", async () => {
    //             //Arrange
    //             const req = getMockReq({ body: { collection_date: "2023" } });
    //             const { res, next } = getMockRes();
    //             jest
    //                 .spyOn(tdeiCoreService, "getDatasets")
    //                 .mockRejectedValueOnce(new InputException("Invalid date provided."));
    //             //Act
    //             await pathwaysController.getDatasetList(req, res, next);
    //             //Assert
    //             expect(res.status).toHaveBeenCalledWith(400);
    //             expect(next).toHaveBeenCalled();
    //         });

    //         test("When unknown or database exception occured while processing request, Expect to return HTTP status 500", async () => {
    //             //Arrange
    //             const req = getMockReq({ body: { collection_date: "2023" } });
    //             const { res, next } = getMockRes();
    //             jest
    //                 .spyOn(tdeiCoreService, "getDatasets")
    //                 .mockRejectedValueOnce(new Error("unknown error"));
    //             //Act
    //             await pathwaysController.getDatasetList(req, res, next);
    //             //Assert
    //             expect(res.status).toHaveBeenCalledWith(500);
    //             expect(next).toHaveBeenCalled();
    //         });
    //     });
    // });

    describe("Get Pathways file by Id", () => {

        describe("Functional", () => {
            test("When requested for valid tdei_dataset_id, Expect to return downloadable file stream", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                const getPathwaysByIdSpy = jest
                    .spyOn(pathwaysService, "getPathwaysStreamById")
                    .mockResolvedValueOnce([getMockFileEntity()]);
                //Act
                await pathwaysController.getPathwaysById(req, res, next);
                //Assert
                expect(getPathwaysByIdSpy).toHaveBeenCalledTimes(1);
            });

            test("When requested for invalid tdei_dataset_id, Expect to return HTTP status 404", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(pathwaysService, "getPathwaysStreamById")
                    .mockRejectedValueOnce(new HttpException(404, "Record not found"));
                //Act
                await pathwaysController.getPathwaysById(req, res, next);
                //Assert
                expect(res.status).toBeCalledWith(404);
                expect(next).toHaveBeenCalled();
            });

            test("When unexpected error occured while processing request, Expect to return HTTP status 500", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(pathwaysService, "getPathwaysStreamById")
                    .mockRejectedValueOnce(new Error("Unexpected error"));
                //Act
                await pathwaysController.getPathwaysById(req, res, next);
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
                await pathwaysController.getVersions(req, res, next);
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
            jest.spyOn(pathwaysService, "processUploadRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await pathwaysController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing dataset file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing dataset file
            mockRequest.files.dataset = undefined;

            await pathwaysController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle missing metadata file', async () => {
            const { res, next } = getMockRes();
            // Simulate missing metadata file
            mockRequest.files.metadata = undefined;

            await pathwaysController.processUploadRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('metadata file input upload missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            const req = getMockReq();
            const { res, next } = getMockRes();
            // Simulate an internal server error in the pathwaysService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(pathwaysService, "processUploadRequest").mockRejectedValueOnce(mockError);

            await pathwaysController.processUploadRequest(mockRequest, mockResponse, mockNext);

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
            jest.spyOn(pathwaysService, "processPublishRequest").mockResolvedValueOnce(mockTdeiRecordId);

            await pathwaysController.processPublishRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockTdeiRecordId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockTdeiRecordId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the pathwaysService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(pathwaysService, "processPublishRequest").mockRejectedValueOnce(mockError);

            await pathwaysController.processPublishRequest(mockRequest, mockResponse, mockNext);

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
            jest.spyOn(pathwaysService, "processValidationOnlyRequest").mockResolvedValueOnce(mockJobId);

            await pathwaysController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(202);
            expect(mockResponse.send).toHaveBeenCalledWith(mockJobId);
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Location', `/api/v1/job?job_id=${mockJobId}`);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle validation request with missing dataset file', async () => {
            // Simulate a validation request with missing dataset file
            mockRequest.file = undefined;

            await pathwaysController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.send).toHaveBeenCalledWith('dataset file input missing');
            expect(mockNext).toHaveBeenCalledWith(expect.any(InputException));
        });

        it('should handle internal server error', async () => {
            // Simulate an internal server error in the pathwaysService
            const mockError = new Error('Internal Server Error');
            jest.spyOn(pathwaysService, "processValidationOnlyRequest").mockRejectedValueOnce(mockError);

            await pathwaysController.processValidationOnlyRequest(mockRequest, mockResponse, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.send).toHaveBeenCalledWith('Error while processing the validation request');
            expect(mockNext).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });
});