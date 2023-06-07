import healthController from "../src/controller/health-controller";
import { getMockReq, getMockRes } from "@jest-mock/express";

describe("Health Check", () => {

    test("When requested for health check, Expect to returns http status 200 if healthy", async () => {
        //Arrange
        let req = getMockReq();
        const { res } = getMockRes();
        //Act
        await healthController.getping(req, res);
        //Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith(
            expect.stringContaining("I'm healthy !!")
        );
    });
});