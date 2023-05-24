import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswController from "../src/controller/osw-controller";
import { OswDTO } from "../src/model/osw-dto";
import oswService from "../src/service/Osw-service";
import { getMockReq, getMockRes } from "@jest-mock/express";
import { Readable } from "stream";
import { TdeiObjectFaker } from "./common/tdei-object-faker";
import HttpException from "../src/exceptions/http/http-base-exception";

// group test using describe
describe("OSW API Test", () => {

    test("When requested for [GET] OSW files, expect to return list", async () => {
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
        getAllOswSpy.mockClear();
    });

    test("When requested for [GET] OSW file by Id, expect to return downloadable file stream", async () => {
        //Arrange
        let req = getMockReq();
        const { res, next } = getMockRes();

        var fileEntity = <FileEntity>{
            fileName: "Test",
            mimeType: "octet-stream",
            getStream: function (): Promise<NodeJS.ReadableStream> {
                var mockedStream = new Readable();
                mockedStream._read = function (size) { /* do nothing */ };
                return Promise.resolve(mockedStream);
            }
        };

        const getOswByIdSpy = jest
            .spyOn(oswService, "getOswById")
            .mockResolvedValueOnce(fileEntity);
        //Act
        await oswController.getOswById(req, res, next);
        //Assert
        expect(getOswByIdSpy).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        getOswByIdSpy.mockClear();
    });

    test("When create osw version, expect to return tdei_record_id for new record", async () => {
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
        expect(res.send).toBeCalledWith(dummyResponse);
        createOswSpy.mockClear();
    });

    test("When create osw version with null body, expect to return HTTP status code 500", async () => {
        //Arrange
        let req = getMockReq({ body: null });
        const { res, next } = getMockRes();
        var dummyResponse = <OswDTO>{
            tdei_record_id: "test_record_id"
        };
        const createOswSpy = jest
            .spyOn(oswService, "createOsw")
            .mockRejectedValue("error")
            .mockResolvedValueOnce(dummyResponse);
        //Act
        // await oswController.createOsw(req, res, next);
        await oswController.createOsw(req, res, next);
        //Assert
        expect(res.status).toBeCalledWith(500);
        createOswSpy.mockClear();
    });
});