import { OswVersions } from "../database/entity/osw-version-entity";
import oswService from "./Osw-service";
import { IEventBusServiceInterface } from "./interface/event-bus-service-interface";
import { validate, ValidationError } from 'class-validator';
import { AzureQueueConfig } from "nodets-ms-core/lib/core/queue/providers/azure-queue-config";
import { environment } from "../environment/environment";
import { Core } from "nodets-ms-core";
import { QueueMessageContent } from "../model/queue-message-model";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { randomUUID } from "crypto";

export class EventBusService implements IEventBusServiceInterface {
    private queueConfig: AzureQueueConfig;
    publishingTopic: Topic;

    constructor(queueConnection: string = environment.eventBus.connectionString as string, publishingTopicName: string = environment.eventBus.dataServiceTopic as string) {
        Core.initialize();
        this.queueConfig = new AzureQueueConfig();
        this.queueConfig.connectionString = queueConnection;
        this.publishingTopic = Core.getTopic(publishingTopicName);
    }

    // function to handle messages
    private processUpload = async (messageReceived: any) => {
        var tdeiRecordId = "";
        try {
            var queueMessage = QueueMessageContent.from(messageReceived.data);
            tdeiRecordId = queueMessage.tdeiRecordId!;

            console.log("Received message for : ", queueMessage.tdeiRecordId, "Message received for osw processing !");

            if (!queueMessage.response.success || !queueMessage.meta.isValid) {
                let errorMessage = "Received failed workflow request";
                console.error(queueMessage.tdeiRecordId, errorMessage, messageReceived);
                return Promise.resolve();
            }

            if (!await queueMessage.hasPermission(["tdei-admin", "poc", "osw_data_generator"])) {
                let errorMessage = "Unauthorized request !";
                console.error(queueMessage.tdeiRecordId, errorMessage);
                throw Error(errorMessage);
            }

            var oswVersions: OswVersions = OswVersions.from(queueMessage.request);
            oswVersions.tdei_record_id = queueMessage.tdeiRecordId;
            oswVersions.uploaded_by = queueMessage.userId;
            oswVersions.file_upload_path = queueMessage.meta.file_upload_path;

            validate(oswVersions).then(errors => {
                // errors is an array of validation errors
                if (errors.length > 0) {
                    const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
                    console.error('Upload osw file metadata information failed validation. errors: ', message);
                    this.publish(messageReceived,
                        {
                            success: false,
                            message: 'Validation error :' + message
                        });
                    return Promise.resolve();
                } else {
                    oswService.createOsw(oswVersions).then(res => {
                        this.publish(messageReceived,
                            {
                                success: true,
                                message: 'OSW request processed successfully !'
                            });
                        return Promise.resolve();
                    }).catch((error: any) => {
                        console.error('Error saving the osw version', error);
                        this.publish(messageReceived,
                            {
                                success: false,
                                message: 'Error occured while processing osw request' + error
                            });
                        return Promise.resolve();
                    });
                }
            });
        } catch (error) {
            console.error(tdeiRecordId, 'Error occured while processing osw request', error);
            this.publish(messageReceived,
                {
                    success: false,
                    message: 'Error occured while processing osw request' + error
                });
            return Promise.resolve();
        }
    };

    private publish(queueMessage: QueueMessage, response: {
        success: boolean,
        message: string
    }) {
        var queueMessageContent: QueueMessageContent = QueueMessageContent.from(queueMessage.data);
        //Set validation stage
        queueMessageContent.stage = 'osw-data-service';
        //Set response
        queueMessageContent.response.success = response.success;
        queueMessageContent.response.message = response.message;
        this.publishingTopic.publish(QueueMessage.from(
            {
                messageType: 'osw-data-service',
                data: queueMessageContent,
                publishedDate: new Date(),
                message: "OSW data service output",
                messageId: randomUUID().toString()
            }
        ));
        console.log("Publishing message for : ", queueMessageContent.tdeiRecordId);
    }

    // function to handle any errors
    private processUploadError = async (error: any) => {
        console.log(error);
    };

    subscribeUpload(validationTopic: string = environment.eventBus.validationTopic as string, validationSubscription: string = environment.eventBus.validationSubscription as string): void {
        Core.getTopic(validationTopic,
            this.queueConfig)
            .subscribe(validationSubscription, {
                onReceive: this.processUpload,
                onError: this.processUploadError
            });
    }
}

// const eventBusService = new EventBusService();
// export default eventBusService;