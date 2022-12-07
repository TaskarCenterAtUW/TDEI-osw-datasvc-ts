import { Request, Response } from "express";
import oswController from "../controller/osw-controller";
import { OswDTO } from "../model/osw-dto";
import oswService from "../service/Osw-service";

// group test using describe
describe("POST /api/v1/osw", () => {

    test("returns list of osw", async () => {

        const mockRequest = {
            url: "http://localhost:8080",
            query: {}
        } as Request;
        let responseObj = {};
        const mockResponse: Partial<Response> = {
            send: jest.fn().mockImplementation((result) => {
                responseObj = result;
            })
        };

        const list: OswDTO[] = [new OswDTO()]
        const spy = jest
            .spyOn(oswService, "getAllOsw")
            .mockResolvedValueOnce(list);

        await oswController.getAllOsw(mockRequest, mockResponse as Response);
        expect(responseObj).toEqual(list);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});