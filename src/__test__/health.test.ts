import { Request, Response } from "express";
import healthController from "../controller/health-controller";

// group test using describe
describe("POST /health/ping", () => {

    test("returns status 200 if healthy", async () => {

        const mockRequest = {
            url: "http://localhost:" + process.env.APPLICATION_PORT ?? "8080",
            query: {}
        } as Request;
        let responseObj = {};
        const mockResponse: Partial<Response> = {
            send: jest.fn().mockImplementation((result) => {
                responseObj = result;
            })
        };
        await healthController.getping(mockRequest, mockResponse as Response);
        expect(responseObj).toEqual("I'm healthy !!");
    });
});