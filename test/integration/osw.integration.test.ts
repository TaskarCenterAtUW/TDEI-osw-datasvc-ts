import { Core } from "nodets-ms-core";
import fetch from "node-fetch";
import { PermissionRequest } from "nodets-ms-core/lib/core/auth/model/permission_request";
import { environment } from "../../src/environment/environment";


describe("OSW Integration Test", () => {

    afterAll((done) => {
        done();
    });

    /**
    * Environement dependency 
    * AUTH_HOST
    */
    test("Verifying auth service hasPermission api integration", async () => {
        //Pre-requisite environment dependency
        if (!process.env.AUTH_HOST) {
            console.error("AUTH_HOST environment not set");
            expect(process.env.AUTH_HOST != undefined && process.env.AUTH_HOST != null).toBeTruthy();
            return;
        }

        //Arrange
        var permissionRequest = new PermissionRequest({
            userId: "test_userId",
            projectGroupId: "test_project_group_id",
            permssions: ["tdei-admin", "poc", "osw_data_generator"],
            shouldSatisfyAll: false
        });
        const authProvider = Core.getAuthorizer({ provider: "Hosted", apiUrl: environment.authPermissionUrl });
        //ACT
        const response = await authProvider?.hasPermission(permissionRequest);
        //Assert
        expect(response).toBeFalsy();
    }, 15000);


    /**
   * Environement dependency 
   * AUTH_HOST
   */
    test("Verifying auth service generate secret api integration", async () => {
        //Pre-requisite environment dependency
        if (!process.env.AUTH_HOST) {
            console.error("AUTH_HOST environment not set");
            expect(process.env.AUTH_HOST != undefined && process.env.AUTH_HOST != null).toBeTruthy();
            return;
        }

        //Act
        const getSecret = await fetch(environment.secretGenerateUrl as string, {
            method: 'get'
        });
        //Assert
        expect(getSecret.status == 200).toBeTruthy();
    }, 15000);
});