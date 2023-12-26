import oswController from "../../src/controller/osw-controller";
import { OswDTO } from "../../src/model/osw-dto";
import oswService from "../../src/service/Osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { DuplicateException, InputException, OverlapException } from "../../src/exceptions/http/http-exceptions";
import { getMockFileEntity, mockCore } from "../common/mock-utils";
import storageService from "../../src/service/storage-service";

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

        beforeAll(() => {
            mockCore();
        })
        test('When valid input provided, expect to return tdei_record_id for new record', async () => {
            // mockCore();
            let req = getMockReq({ body: { "meta": JSON.stringify(TdeiObjectFaker.getOswPayload2()), "file": Buffer.from('whatever') } });
            req.file = TdeiObjectFaker.getMockUploadFile();
            const { res, next } = getMockRes()
            const dummyResponse = "test_record_id";
            const createOswSpy = jest.spyOn(oswService, "processUploadRequest").mockResolvedValueOnce(dummyResponse);
            const storageCliSpy = jest.spyOn(storageService, "uploadFile").mockResolvedValue('remote_url');
            // const uploadSpy = jest.spyOn(oswController.eventBusService,"publishUpload").mockImplementation()

            await oswController.processUploadRequest(req, res, next)
            expect(createOswSpy).toHaveBeenCalledTimes(1);
            expect(res.status).toBeCalledWith(202);
        })

        test('When invalid meta is provided, expect to return 400 error', async () => {
            const payload = TdeiObjectFaker.getOswPayload2()
            payload.collection_method = ""; // Empty collection method
            let req = getMockReq({ body: { "meta": JSON.stringify(payload), "file": Buffer.from('whatever') } });
            req.file = TdeiObjectFaker.getMockUploadFile();
            const { res, next } = getMockRes()
            await oswController.processUploadRequest(req, res, next);
            expect(res.status).toBeCalledWith(400);
        });

        test('When database exception occurs, expect to return same error', async () => {

            let req = getMockReq({ body: { "meta": JSON.stringify(TdeiObjectFaker.getOswPayload2()), "file": Buffer.from('whatever') } });
            req.file = TdeiObjectFaker.getMockUploadFile();
            mockCore();
            const { res, next } = getMockRes()
            const exception = new DuplicateException("test_record_id")
            const createOswSpy = jest.spyOn(oswService, "processUploadRequest").mockRejectedValueOnce(exception)
            await oswController.processUploadRequest(req, res, next)
            expect(next).toBeCalledWith(exception);

        })
        test('When any HTTPexception occurs during the creation, its sent as response', async () => {

            let req = getMockReq({ body: { "meta": JSON.stringify(TdeiObjectFaker.getOswPayload2()), "file": Buffer.from('whatever') } });
            req.file = TdeiObjectFaker.getMockUploadFile();
            mockCore();
            const { res, next } = getMockRes()
            const exception = new OverlapException("test_record_id")
            const createOswSpy = jest.spyOn(oswService, "processUploadRequest").mockRejectedValueOnce(exception)
            await oswController.processUploadRequest(req, res, next)
            expect(next).toBeCalledWith(exception);
        });
    });
});