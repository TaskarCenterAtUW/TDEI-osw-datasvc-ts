import { OswVersions } from "../database/entity/osw-version-entity";
import oswService from "./Osw-service";
import { IEventBusServiceInterface } from "./interface/event-bus-service-interface";
import { validate } from 'class-validator';
import { AzureQueueConfig } from "nodets-ms-core/lib/core/queue/providers/azure-queue-config";
import { environment } from "../environment/environment";
import { Core } from "nodets-ms-core";
import { Polygon } from "../model/polygon-model";
import { QueueMessageContent } from "../model/queue-message-model";

class EventBusService implements IEventBusServiceInterface {
    private queueConfig: AzureQueueConfig;

    constructor() {
        this.queueConfig = new AzureQueueConfig();
        this.queueConfig.connectionString = environment.eventBus.connectionString as string;
    }

    // function to handle messages
    private processUpload = async (messageReceived: any) => {
        try {
            var queueMessage = QueueMessageContent.from(messageReceived.data);
            if (!queueMessage.response.success && !queueMessage.meta.isValid) {
                console.error("Failed workflow request received:", messageReceived);
                return;
            }

            if (!await queueMessage.hasPermission(["tdei-admin", "poc", "osw_data_generator"])) {
                return;
            }

            var oswVersions: OswVersions = OswVersions.from(queueMessage.request);
            oswVersions.tdei_record_id = queueMessage.tdeiRecordId;
            oswVersions.uploaded_by = queueMessage.userId;
            oswVersions.file_upload_path = queueMessage.meta.file_upload_path;
            //This line will instantiate the polygon class and set defult class values
            oswVersions.polygon = new Polygon({ coordinates: oswVersions.polygon.coordinates });
            console.info(`Received message: ${messageReceived.data}`);

            validate(oswVersions).then(errors => {
                // errors is an array of validation errors
                if (errors.length > 0) {
                    console.log('Upload osw file metadata information failed validation. errors: ', errors);
                } else {
                    oswService.createOsw(oswVersions).catch((error: any) => {
                        console.log('Error saving the osw version');
                        console.log(error);
                    });;
                }
            });
        } catch (error) {
            console.log("Error processing the upload message : error ", error, "message: ", messageReceived);
        }
    };


    // function to handle any errors
    private processUploadError = async (error: any) => {
        console.log(error);
    };

    subscribeUpload(): void {
        Core.getTopic(environment.eventBus.validationTopic as string,
            this.queueConfig)
            .subscribe(environment.eventBus.validationSubscription as string, {
                onReceive: this.processUpload,
                onError: this.processUploadError
            });
    }
}

const eventBusService = new EventBusService();
export default eventBusService;