import { Core } from "nodets-ms-core";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { TdeiObjectFaker } from "../common/tdei-object-faker";
import { mockQueueMessageContent } from "../common/mock-utils";
import { OswDTO } from "../../src/model/osw-dto";
import oswService from "../../src/service/Osw-service";
import fetch from "node-fetch";
import { setTimeout } from "timers/promises";
import { EventBusService } from "../../src/service/event-bus-service";
import { PermissionRequest } from "nodets-ms-core/lib/core/auth/model/permission_request";
import { environment } from "../../src/environment/environment";
import { Utility } from "../../src/utility/utility";


describe("OSW Integration Test", () => {

    afterAll((done) => {
        done();
    });

    /**
     * Environment dependency
     * QUEUE CONNECTION
     */

    // test("Subscribe to validation result topic to verify servicebus integration", async () => {
    //     //Pre-requsite environment dependency
    //     if (!process.env.QUEUECONNECTION) {
    //         console.error("QUEUECONNECTION environment not set");
    //         expect(process.env.QUEUECONNECTION != undefined && process.env.QUEUECONNECTION != null).toBeTruthy();
    //         return;
    //     }

    //     //Arrange
    //     var messageReceiver!: QueueMessage;

    //     Core.initialize();
    //     var topicToSubscribe = Core.getTopic("temp-validation", {
    //         provider: "Azure"
    //     });
    //     //Live: validation service posts message
    //     await topicToSubscribe.publish(QueueMessage.from(TdeiObjectFaker.getOswQueueMessageSuccess()));

    //     //Mock publishing topic - outbound
    //     var mockPublishingTopic = Core.getTopic("Mock");
    //     jest.spyOn(mockPublishingTopic, "publish").mockImplementation((message: QueueMessage) => {
    //         messageReceiver = message;
    //         return Promise.resolve();
    //     });

    //     mockQueueMessageContent();

    //     var dummyResponse = <OswDTO>{
    //         tdei_record_id: "test_record_id"
    //     };

    //     //Mock DB call
    //     jest
    //         .spyOn(oswService, "createOsw")
    //         .mockResolvedValueOnce(dummyResponse);

    //     //Wait for message to process
    //     async function assertMessage() {
    //         await setTimeout(20000);
    //         return Promise.resolve(messageReceiver?.data?.response?.success);
    //     }

    //     //Act
    //     var eventBusService = new EventBusService();
    //     eventBusService.publishingTopic = mockPublishingTopic;
    //     // eventBusService.subscribeUpload("temp-validation", "temp-validation-result");

    //     //Assert
    //     await expect(assertMessage()).resolves.toBeTruthy();
    // }, 60000);


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