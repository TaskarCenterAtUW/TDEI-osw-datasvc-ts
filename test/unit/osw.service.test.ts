import { QueryResult } from "pg";
import dbClient from "../../src/database/data-source";
import oswService from "../../src/service/Osw-service";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import { OswQueryParams } from "../../src/model/osw-get-query-params";
import { OswDTO } from "../../src/model/osw-dto";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { mockCore } from "../common/mock-utils";
import { OswVersions } from "../../src/database/entity/osw-version-entity";
import UniqueKeyDbException from "../../src/exceptions/db/database-exceptions";
import { DuplicateException, InputException } from "../../src/exceptions/http/http-exceptions";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { Core } from "nodets-ms-core";

// group test using describe
describe("OSW Service Test", () => {
    describe("Get all OSW", () => {
        describe("Functional", () => {
            test("When requested with empty search filters, Expect to return OSW list", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                const getAllOswSpy = jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                var params: OswQueryParams = new OswQueryParams();
                //Act
                var result = await oswService.getAllOsw(params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with all search filters, expect to return OSW list", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                const getAllOswSpy = jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                var params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "03-03-2023";
                params.tdei_org_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_org_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                var result = await oswService.getAllOsw(params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with invalid date search filter, Expect to throw InputException", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                const getAllOswSpy = jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                var params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "13-13-2023";
                params.tdei_org_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_org_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                //Assert
                expect(oswService.getAllOsw(params)).rejects.toThrow(InputException);
            });

            test("When requested with invalid bbox search filter, Expect to throw InputException", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                const getAllOswSpy = jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                var params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "03-03-2023";
                params.tdei_org_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_org_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                expect(oswService.getAllOsw(params)).rejects.toThrow(InputException);
            });
        });
    });

    describe("Get OSW version by Id", () => {
        describe("Functional", () => {
            test("When requested for get OSW version by tdei_record_id, Expect to return FileEntity object", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                var result = await oswService.getOswById("tdei_record_id");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW version with invalid tdei_record_id, Expect to throw HttpException", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>><unknown>{
                    rows: [],
                    rowCount: 0
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswById("tdei_record_id")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
                var oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>><unknown>{
                    rows: [
                        {
                            file_upload_path: "test_path"
                        }
                    ]
                };

                mockCore();
                //Overrride getStorageClient mock
                jest.spyOn(Core, "getStorageClient").mockImplementation(() => { return null; }
                );
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswById("tdei_record_id")).rejects.toThrow();
            });
        });
    });

    describe("Create OSW version", () => {
        describe("Functional", () => {
            test("When requested for creating OSW version with valid input, Expect to return OswDTO object", async () => {
                //Arrange
                var oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                var result = await oswService.createOsw(oswObj);
                //Assert
                expect(result instanceof OswDTO);
            });

            test("When database exception with duplicate tdei_org_id occured while processing request, Expect to throw DuplicateException", async () => {
                //Arrange
                var oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new UniqueKeyDbException("Unique contraint error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow(DuplicateException);
            });

            test("When database exception occured while processing request, Expect to throw error", async () => {
                //Arrange
                var oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new Error("Unknown Error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow();
            });
        });
    });
});