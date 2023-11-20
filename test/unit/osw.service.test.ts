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
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                const params: OswQueryParams = new OswQueryParams();
                //Act
                const result = await oswService.getAllOsw(params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with all search filters, expect to return OSW list", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                const result = await oswService.getAllOsw(params);
                //Assert
                expect(Array.isArray(result));
                expect(result.every(item => item instanceof OswDTO));
            });

            test("When requested with invalid date search filter, Expect to throw InputException", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "13-13-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2, 3, 4]
                //Act
                //Assert
                expect(oswService.getAllOsw(params)).rejects.toThrow(InputException);
            });

            test("When requested with invalid bbox search filter, Expect to throw InputException", async () => {
                //Arrange
                const oswObj = TdeiObjectFaker.getOswVersionFromDB();
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };
                jest
                    .spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);
                const params: OswQueryParams = new OswQueryParams();
                params.page_no = 1;
                params.page_size = 10;
                params.date_time = "03-03-2023";
                params.tdei_project_group_id = "test_id";
                params.tdei_record_id = "test_id";
                params.tdei_project_group_id = "test_id";
                params.osw_schema_version = "v0.1";
                params.bbox = [1, 2]
                //Act
                //Assert
                expect(oswService.getAllOsw(params)).rejects.toThrow(InputException);
            });
        });
    });

    describe("Get OSW file by Id", () => {
        describe("Functional", () => {
            test("When requested for get OSW file by tdei_record_id, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "test_path",
                            download_xml_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswById("tdei_record_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_record_id and osm format, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "test_path",
                            download_xml_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswById("tdei_record_id", "osw");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file by tdei_record_id and xml format, Expect to return FileEntity object", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "test_path",
                            download_xml_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.getOswById("tdei_record_id", "xml");
                //Assert
                expect(result instanceof FileEntity);
            });

            test("When requested for get OSW file where conversion for osm for tdei_record_id not available, Expect to throw HttpException", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "",
                            download_xml_url: "test_path"
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswById("tdei_record_id", "osm")).rejects.toThrow(HttpException);
            });

            test("When requested for get OSW file where conversion for xml for tdei_record_id not available, Expect to throw HttpException", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        {
                            file_upload_path: "test_path",
                            download_osm_url: "test_path",
                            download_xml_url: ""
                        }
                    ]
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswById("tdei_record_id", "xml")).rejects.toThrow(HttpException);
            });


            test("When requested for get OSW file with invalid tdei_record_id, Expect to throw HttpException", async () => {
                //Arrange
                const dummyResponse = <QueryResult<any>><unknown>{
                    rows: [],
                    rowCount: 0
                };

                mockCore();
                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                //Assert
                expect(oswService.getOswById("tdei_record_id", "")).rejects.toThrow(HttpException);
            });

            test("When Core failed obtaing storage client, Expect to throw error", async () => {
                //Arrange
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
                expect(oswService.getOswById("tdei_record_id", "")).rejects.toThrow();
            });
        });
    });

    describe("Create OSW version", () => {
        describe("Functional", () => {
            test("When requested for creating OSW version with valid input, Expect to return OswDTO object", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                const dummyResponse = <QueryResult<any>>{
                    rows: [
                        oswObj
                    ]
                };

                jest.spyOn(dbClient, "query")
                    .mockResolvedValueOnce(dummyResponse);

                //Act
                const result = await oswService.createOsw(oswObj);
                //Assert
                expect(result instanceof OswDTO);
            });

            test("When database exception with duplicate tdei_project_group_id occured while processing request, Expect to throw DuplicateException", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());
                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new UniqueKeyDbException("Unique contraint error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow(DuplicateException);
            });

            test("When database exception occured while processing request, Expect to throw error", async () => {
                //Arrange
                const oswObj = OswVersions.from(TdeiObjectFaker.getOswVersion());

                jest.spyOn(dbClient, "query")
                    .mockRejectedValueOnce(new Error("Unknown Error"));

                //Act
                //Assert
                expect(oswService.createOsw(oswObj)).rejects.toThrow();
            });
        });
    });
});
