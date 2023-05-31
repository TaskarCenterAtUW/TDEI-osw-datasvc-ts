import oswService from "../src/service/Osw-service";
import { TdeiObjectFaker } from "./common/tdei-object-faker";
import { OswDTO } from "../src/model/osw-dto";
import { getMockTopic, mockCore, mockQueueMessageContent } from "./common/mock-utils";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import eventBusService from "../src/service/event-bus-service";

// group test using describe
describe("Event Service Bus Test", () => {
    describe("Queue message", () => {
        test("When valid message received, expect to process the message successfully", async () => {
            let messagedProcessed: boolean = false;
            //Arrange
            mockQueueMessageContent(true);

            var mockTopic: Topic = getMockTopic();
            mockTopic.publish = (message: QueueMessage): Promise<void> => {
                messagedProcessed = message.data.response.success;
                //Assert
                expect(messagedProcessed).toBeTruthy();
                return Promise.resolve();
            }
            mockCore();
            //Mock the topic
            eventBusService.publishingTopic = mockTopic;

            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);

            //Act
            await eventBusService['processUpload'](TdeiObjectFaker.getOswQueueMessageSuccess());
        });

        test("When message with empty tdei_record_id received, expect to fail the message processing", async () => {
            let messagedProcessed: boolean = false;
            //Arrange
            mockQueueMessageContent(true);

            var mockTopic: Topic = getMockTopic();
            mockTopic.publish = (message: QueueMessage): Promise<void> => {
                messagedProcessed = message.data.response.success;
                //Assert
                expect(messagedProcessed).toBeTruthy();
                return Promise.resolve();
            }
            mockCore();
            //Mock the topic
            eventBusService.publishingTopic = mockTopic;

            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);

            var message = TdeiObjectFaker.getOswQueueMessageSuccess();
            message.data.tdei_record_id = "";
            //Act
            await eventBusService['processUpload'](message);
        });

        test("When validation failed, expect to fail the message processing", async () => {
            //Arrange
            mockQueueMessageContent(true);

            var mockTopic: Topic = getMockTopic();
            mockTopic.publish = (message: QueueMessage): Promise<void> => {
                //Assert
                expect(true).not.toBeCalled();
                return Promise.resolve();
            }
            mockCore();
            //Mock the topic
            eventBusService.publishingTopic = mockTopic;

            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);

            var message = TdeiObjectFaker.getOswQueueMessageSuccess();
            message.data.response.success = false;
            message.data.meta.isValid = false;
            //Act
            await eventBusService['processUpload'](message);
        });

        test("When create osw database failed, expect to fail the message processing", async () => {
            let messagedProcessed: boolean = false;
            //Arrange
            mockQueueMessageContent(true);

            var mockTopic: Topic = getMockTopic();
            mockTopic.publish = (message: QueueMessage): Promise<void> => {
                messagedProcessed = message.data.response.success;
                //Assert
                expect(messagedProcessed).toBeTruthy();
                return Promise.resolve();
            }
            mockCore();
            //Mock the topic
            eventBusService.publishingTopic = mockTopic;

            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockRejectedValueOnce(new Error("Database exception"));

            //Act
            await eventBusService['processUpload'](TdeiObjectFaker.getOswQueueMessageSuccess());
        });

        test("When permission denied, expect to fail the message processing", async () => {
            let messagedProcessed: boolean = false;
            //Arrange
            mockQueueMessageContent(false);

            var mockTopic: Topic = getMockTopic();
            mockTopic.publish = (message: QueueMessage): Promise<void> => {
                messagedProcessed = message.data.response.success;
                //Assert
                expect(messagedProcessed).toBeFalsy();
                return Promise.resolve();
            };

            mockCore();
            //Mock the topic
            eventBusService.publishingTopic = mockTopic;

            var dummyResponse = <OswDTO>{
                tdei_record_id: "test_record_id"
            };
            const createOswSpy = jest
                .spyOn(oswService, "createOsw")
                .mockResolvedValueOnce(dummyResponse);

            //Act
            await eventBusService['processUpload'](TdeiObjectFaker.getOswQueueMessageSuccess());
        });
    });
});

