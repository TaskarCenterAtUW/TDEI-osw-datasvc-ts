import { OswVersions } from "../../database/entity/osw-version-entity";
import { OswUploadModel } from "../../model/osw-upload-model";
import { Utility } from "../../utility/utility";
import oswService from "../Osw-service";
import { IEventBusServiceInterface } from "./interface/event-bus-service-interface";
import { validate } from 'class-validator';
import { AzureQueueConfig } from "nodets-ms-core/lib/core/queue/providers/azure-queue-config";
import { environment } from "../../environment/environment";
import { Core } from "nodets-ms-core";

class EventBusService implements IEventBusServiceInterface {
    private queueConfig: AzureQueueConfig;

    constructor() {
        this.queueConfig = new AzureQueueConfig();
        this.queueConfig.connectionString = environment.eventBus.connectionString as string;
    }

    // function to handle messages
    private processUpload = async (messageReceived: any) => {
        try {
            if (!messageReceived.data || !messageReceived.data.is_valid) {
                console.log("Not valid information received :", messageReceived);
                return;
            }

            var oswUploadModel = messageReceived.data as OswUploadModel;
            var oswVersions: OswVersions = new OswVersions(oswUploadModel);
            oswVersions.uploaded_by = oswUploadModel.user_id;
            console.log(`Received message: ${JSON.stringify(oswUploadModel)}`);

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