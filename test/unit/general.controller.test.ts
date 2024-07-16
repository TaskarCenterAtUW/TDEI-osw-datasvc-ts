import generalController from "../../src/controller/general-controller";
import { getMockReq, getMockRes } from "@jest-mock/express";
import HttpException from "../../src/exceptions/http/http-base-exception";
import tdeiCoreService from "../../src/service/tdei-core-service";
import jobService from "../../src/service/job-service";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { getMockFileEntity } from "../common/mock-utils";
import { DatasetDTO } from "../../src/model/dataset-dto";

// group test using describe
describe("General Controller Test", () => {

    describe("Get Dataset list", () => {
        describe("Functional", () => {
            test("When requested with empty search criteria, Expect to return Dataset list", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();
                const list: DatasetDTO[] = [<DatasetDTO>{}]
                const getDatasetsSpy = jest
                    .spyOn(tdeiCoreService, "getDatasets")
                    .mockResolvedValueOnce(list);
                //Act
                await generalController.getDatasetList(req, res, next);
                //Assert
                expect(getDatasetsSpy).toHaveBeenCalledTimes(1);
                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toBeCalledWith(list);
            });

            test("When requested with bad collection_date input, Expect to return HTTP status 400", async () => {
                //Arrange
                const req = getMockReq({ body: { collection_date: "2023" } });
                const { res, next } = getMockRes();
                jest
                    .spyOn(tdeiCoreService, "getDatasets")
                    .mockRejectedValueOnce(new InputException("Invalid date provided."));
                //Act
                await generalController.getDatasetList(req, res, next);
                //Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(next).toHaveBeenCalled();
            });

            test("When unknown or database exception occured while processing request, Expect to return HTTP status 500", async () => {
                //Arrange
                const req = getMockReq({ body: { collection_date: "2023" } });
                const { res, next } = getMockRes();
                jest
                    .spyOn(tdeiCoreService, "getDatasets")
                    .mockRejectedValueOnce(new Error("unknown error"));
                //Act
                await generalController.getDatasetList(req, res, next);
                //Assert
                expect(res.status).toHaveBeenCalledWith(500);
                expect(next).toHaveBeenCalled();
            });
        });
    });

    describe('Invalidate the record', () => {

        test("When requested to invalidate a record, Expect to return http status 200 and true if successful", async () => {
            // Arrange
            const req = getMockReq({ body: { user_id: "user_id" }, params: { tdei_dataset_id: "record_id" } });
            const { res, next } = getMockRes();
            const invalidateRecordRequestSpy = jest.spyOn(tdeiCoreService, "invalidateRecordRequest").mockResolvedValueOnce(true);

            // Act
            await generalController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_dataset_id);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(true);
            expect(next).not.toHaveBeenCalled();
        });

        test("When an error occurs while processing the invalidate request, Expect to return http status 500 and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "record_id"
                },
                body: {
                    user_id: "user_id"
                }
            });
            const { res, next } = getMockRes();
            const error = new Error("Error while processing the invalidate request");
            const invalidateRecordRequestSpy = jest.spyOn(tdeiCoreService, "invalidateRecordRequest").mockRejectedValueOnce(error);

            // Act
            await generalController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_dataset_id);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while processing the invalidate request");
            expect(next).toHaveBeenCalledWith(error);
        });

        test("When an HttpException occurs while processing the invalidate request, Expect to return corresponding http status and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "record_id"
                },
                body: {
                    user_id: "user_id"
                }
            });
            const { res, next } = getMockRes();
            const error = new HttpException(400, "Bad request");
            const invalidateRecordRequestSpy = jest.spyOn(tdeiCoreService, "invalidateRecordRequest").mockRejectedValueOnce(error);

            // Act
            await generalController.invalidateRecordRequest(req, res, next);

            // Assert
            expect(invalidateRecordRequestSpy).toHaveBeenCalledWith(req.body.user_id, req.params.tdei_dataset_id);
            expect(res.status).toHaveBeenCalledWith(error.status);
            expect(res.send).toHaveBeenCalledWith(error.message);
            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe("Get Jobs", () => {
        test("When requested with empty params, Expect to return HTTP status 200", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    tdei_project_group_id: "mock-tdei-project-group-id"
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: false
                }
            });
            let callParams = {
                page_size: 10,
                page_no: 1,
                isAdmin: false,
                tdei_project_group_id: "mock-tdei-project-group-id",
                show_all: false

            }
            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "validateObject").mockResolvedValueOnce(undefined);
            let jsSpy = jest.spyOn(jobService, "getJobs").mockResolvedValueOnce([]);

            // Act
            await generalController.getJobs(req, res, next);

            // Assert
            expect(jsSpy).toHaveBeenCalledWith("mock-user-id", callParams);
            expect(res.send).toHaveBeenCalledWith([]);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test("When requested with valid params, Expect to return HTTP status 200", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    job_id: "mock-job-id",
                    page_size: "10",
                    page_no: "1",
                    status: "COMPLETED",
                    job_type: "Dataset-Upload",
                    tdei_project_group_id: "mock-tdei-project-group-id"
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: false
                }
            });
            let callParams = {
                job_id: "mock-job-id",
                page_size: "10",
                page_no: "1",
                status: "COMPLETED",
                job_type: "Dataset-Upload",
                tdei_project_group_id: "mock-tdei-project-group-id",
                isAdmin: false,
                show_all: false
            }
            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "validateObject").mockResolvedValueOnce(undefined);
            let jsSpy = jest.spyOn(jobService, "getJobs").mockResolvedValueOnce([]);

            // Act
            await generalController.getJobs(req, res, next);

            // Assert
            expect(jsSpy).toHaveBeenCalledWith("mock-user-id", callParams);
            expect(res.send).toHaveBeenCalledWith([]);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test("When requested with invalid params, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    job_id: "mock-job-id",
                    page_size: "10",
                    page_no: "1",
                    status: "wrong-job-type",
                    job_type: "wrong-job-type",
                    tdei_project_group_id: "mock-tdei-project-group-id"
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: false
                }
            });

            const { res, next } = getMockRes();
            jest.spyOn(tdeiCoreService, "validateObject").mockResolvedValueOnce("wrong-job-type is not a valid job type");

            // Act
            await generalController.getJobs(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Input validation failed with below reasons : \n' + "wrong-job-type is not a valid job type");
            expect(next).toHaveBeenCalledWith(new InputException('Input validation failed with below reasons : \n' + "wrong-job-type is not a valid job type"));
        });

        test("Non Admin when requested with missing tdei_project_group_id, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({
                query: {
                    job_id: "mock-job-id",
                    page_size: "10",
                    page_no: "1",
                    status: "wrong-job-type",
                    job_type: "wrong-job-type"
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: false
                }
            });

            const { res, next } = getMockRes();

            // Act
            await generalController.getJobs(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test("When an error occurs while processing the request, Expect to return HTTP status 500", async () => {
            // Arrange
            const req = getMockReq({ params: { job_id: "mock-job-id" }, query: { tdei_project_group_id: "mock-tdei-project-group-id" } });
            const { res, next } = getMockRes();
            const error = new Error("Internal Server Error");
            jest.spyOn(jobService, "getJobs").mockRejectedValueOnce(error);

            // Act
            await generalController.getJobs(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith("Error while gettting the jobs");
            expect(next).toHaveBeenCalledWith(new HttpException(500, "Error while gettting the jobs"));
        });
    });

    describe("Get Job Download File", () => {
        test("When valid job_id provided, Expect to return HTTP status 200", async () => {
            // Arrange
            const req = getMockReq();
            const { res, next } = getMockRes();
            let file = getMockFileEntity();
            file.mimeType = "application/zip";
            jest.spyOn(jobService, "getJobFileEntity").mockResolvedValueOnce(file);

            // Act
            await generalController.getJobDownloadFile(req, res, next);

            // Assert
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename=${file.fileName}`);
        });

        test("When invalid job_id is provided, Expect to return HTTP status 400", async () => {
            // Arrange
            const req = getMockReq({ params: { job_id: "mock-job-id" } });
            const { res, next } = getMockRes();
            const error = new InputException("Job not found");
            jest.spyOn(jobService, "getJobFileEntity").mockRejectedValueOnce(error);

            // Act
            await generalController.getJobDownloadFile(req, res, next);

            // Assert

            expect(next).toHaveBeenCalledWith(new InputException("Job not found"));
        });

        test("When valid job_id is provided and download file not available, Expect to return HTTP status 404", async () => {
            // Arrange
            const req = getMockReq({ params: { job_id: "mock-job-id" } });
            const { res, next } = getMockRes();
            const error = new HttpException(404, "File not found");
            jest.spyOn(jobService, "getJobFileEntity").mockRejectedValueOnce(error);

            // Act
            await generalController.getJobDownloadFile(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(new HttpException(404, "File not found"));
        });

        test("When an error occurs while processing the request, Expect to return the error", async () => {
            // Arrange
            const req = getMockReq({ params: { job_id: "mock-job-id" } });
            const { res, next } = getMockRes();
            const error = new Error("Internal Server Error");
            jest.spyOn(jobService, "getJobFileEntity").mockRejectedValueOnce(error);

            // Act
            await generalController.getJobDownloadFile(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe("cloneDataset", () => {
        test("When clone dataset request is successful, Expect to return cloned dataset ID", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-tdei_dataset_id",
                    tdei_project_group_id: "mock-tdei_project_group_id",
                    tdei_service_id: "mock-tdei_service_id",
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: true,
                },
                file: {
                },
            });
            const { res, next } = getMockRes();
            const result = { new_tdei_dataset_id: "cloned-dataset-id", job_id: "job-id" };
            jest.spyOn(tdeiCoreService, "cloneDataset").mockResolvedValueOnce(result);

            // Act
            await generalController.cloneDataset(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(result.new_tdei_dataset_id);
        });

        test("When clone dataset request fails with HttpException, Expect to return HTTP status and error message from the exception", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-tdei_dataset_id",
                    tdei_project_group_id: "mock-tdei_project_group_id",
                    tdei_service_id: "mock-tdei_service_id",
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: true,
                },
                file: {
                },
            });
            const { res, next } = getMockRes();
            const errorMessage = "Invalid request";
            const httpException = new HttpException(400, errorMessage);
            jest.spyOn(tdeiCoreService, "cloneDataset").mockRejectedValueOnce(httpException);

            // Act
            await generalController.cloneDataset(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith(errorMessage);
            expect(next).toHaveBeenCalledWith(httpException);
        });

        test("When clone dataset request fails with unexpected error, Expect to return HTTP status 500 and error message", async () => {
            // Arrange
            const req = getMockReq({
                params: {
                    tdei_dataset_id: "mock-tdei_dataset_id",
                    tdei_project_group_id: "mock-tdei_project_group_id",
                    tdei_service_id: "mock-tdei_service_id",
                },
                body: {
                    user_id: "mock-user-id",
                    isAdmin: true,
                },
                file: {
                },
            });
            const { res, next } = getMockRes();
            const errorMessage = "Error cloning the dataset request";
            const unexpectedError = new Error("Unexpected error");
            jest.spyOn(tdeiCoreService, "cloneDataset").mockRejectedValueOnce(unexpectedError);

            // Act
            await generalController.cloneDataset(req, res, next);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith(errorMessage);
            expect(next).toHaveBeenCalledWith(expect.any(HttpException));
        });
    });

});