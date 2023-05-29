import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswController from "../src/controller/osw-controller";
import { OswDTO } from "../src/model/osw-dto";
import oswService from "../src/service/Osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import { Readable } from "stream";
import { TdeiObjectFaker } from "./common/tdei-object-faker";
import HttpException from "../src/exceptions/http/http-base-exception";
import { DuplicateException, InputException } from "../src/exceptions/http/http-exceptions";
import { getMockFileEntity } from "./common/mock-utils";

// group test using describe
describe("OSW API Controller Test", () => {

    describe("Get all OSW versions", () => {
        test("When requested with empty search criteria, expect to return list", async () => {
            //Arrange
            let req = getMockReq();
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

        test("When requested with bad input, expect to return error", async () => {
            //Arrange
            let req = getMockReq({ body: { collection_date: "2023" } });
            const { res, next } = getMockRes();
            const getAllOswSpy = jest
                .spyOn(oswService, "getAllOsw")
                .mockRejectedValueOnce(new InputException("Invalid date provided."));
            //Act
            await oswController.getAllOsw(req, res, next);
            //Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(next).toHaveBeenCalled();
        });

        test("When unknown or database exception occured while processing request, expect to return error", async () => {
            //Arrange
            let req = getMockReq({ body: { collection_date: "2023" } });
            const { res, next } = getMockRes();
            const getAllOswSpy = jest
                .spyOn(oswService, "getAllOsw")
                .mockRejectedValueOnce(new Error("unknown error"));
            //Act
            await oswController.getAllOsw(req, res, next);
            //Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(next).toHaveBeenCalled();
        });
    });

    describe("Get OSW file by Id", () => {
        test("When requested for valid tdei_record_id, expect to return downloadable file stream", async () => {
            //Arrange
            let req = getMockReq();
            const { res, next } = getMockRes();

            const getOswByIdSpy = jest
                .spyOn(oswService, "getOswById")
                .mockResolvedValueOnce(getMockFileEntity());
            //Act
            await oswController.getOswById(req, res, next);
            //Assert
            expect(getOswByIdSpy).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test("When requested for invalid tdei_record_id, expect to return error", async () => {
            //Arrange
            let req = getMockReq();
            const { res, next } = getMockRes();

            const getOswByIdSpy = jest
                .spyOn(oswService, "getOswById")
                .mockRejectedValueOnce(new HttpException(500, "DB Error"));
            //Act
            await oswController.getOswById(req, res, next);
            //Assert
            expect(res.status).toBeCalledWith(500);
            expect(next).toHaveBeenCalled();
        });

        test("When unexpected error occured while processing request, expect to return error", async () => {
            //Arrange
            let req = getMockReq();
            const { res, next } = getMockRes();

            const getOswByIdSpy = jest
                .spyOn(oswService, "getOswById")
                .mockRejectedValueOnce(new Error("Unexpected error"));
            //Act
            await oswController.getOswById(req, res, next);
            //Assert
            expect(res.status).toBeCalledWith(500);
            expect(next).toHaveBeenCalled();
        });
    });

    describe("Create OSW version", () => {

        test("When valid input provided, expect to return tdei_record_id for new record", async () => {
            //Arrange
            let req = getMockReq({ body: TdeiObjectFaker.getOswVersion() });
            const { res, next } = getMockRes();
            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);
            //Act
            await oswController.createOsw(req, res, next);
            //Assert
            expect(createOswSpy).toHaveBeenCalledTimes(1);
            expect(res.status).toBeCalledWith(200);
            expect(res.send).toBeCalledWith(dummyResponse);
        });

        test("When provided null body, expect to return error", async () => {
            //Arrange
            let req = getMockReq({ body: null });
            const { res, next } = getMockRes();
            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);
            //Act
            await oswController.createOsw(req, res, next);
            //Assert
            expect(res.status).toBeCalledWith(500);
            expect(next).toHaveBeenCalled();
        });

        test("When provided body with empty tdei_org_id, expect to return error", async () => {
            //Arrange
            let oswObject = TdeiObjectFaker.getOswVersion();
            oswObject.tdei_org_id = "";
            let req = getMockReq({ body: oswObject });
            const { res, next } = getMockRes();
            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockRejectedValueOnce(dummyResponse);
            //Act
            await oswController.createOsw(req, res, next);
            //Assert
            expect(res.status).toBeCalledWith(500);
            expect(next).toHaveBeenCalled();
        });

        test("When database exception occured while processing request, expect to return error", async () => {
            //Arrange
            let oswObject = TdeiObjectFaker.getOswVersion();
            let req = getMockReq({ body: oswObject });
            const { res, next } = getMockRes();

            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockRejectedValueOnce(new Error("Unknown error"));
            //Act
            await oswController.createOsw(req, res, next);
            //Assert
            expect(createOswSpy).toHaveBeenCalledTimes(1);
            expect(res.status).toBeCalledWith(500);
        });

        test("When database exception with duplicate tdei_org_id occured while processing request, expect to return error", async () => {
            //Arrange
            let oswObject = TdeiObjectFaker.getOswVersion();
            let req = getMockReq({ body: oswObject });
            const { res, next } = getMockRes();

            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockRejectedValueOnce(new DuplicateException("test_record_id"));
            //Act
            await oswController.createOsw(req, res, next);
            //Assert
            expect(createOswSpy).toHaveBeenCalledTimes(1);
            expect(res.status).toBeCalledWith(400);
        });
    });
});