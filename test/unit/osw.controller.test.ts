import oswController from "../../src/controller/osw-controller";
import { OswDTO } from "../../src/model/osw-dto";
import oswService from "../../src/service/Osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { DuplicateException, InputException } from "../../src/exceptions/http/http-exceptions";
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
                    .spyOn(oswService, "getOswById")
                    .mockResolvedValueOnce(getMockFileEntity());
                //Act
                await oswController.getOswById(req, res, next);
                //Assert
                expect(getOswByIdSpy).toHaveBeenCalledTimes(1);
                expect(res.status).toHaveBeenCalledWith(200);
            });

            test("When requested for invalid tdei_record_id, Expect to return HTTP status 404", async () => {
                //Arrange
                const req = getMockReq();
                const { res, next } = getMockRes();

                jest
                    .spyOn(oswService, "getOswById")
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
                    .spyOn(oswService, "getOswById")
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
});