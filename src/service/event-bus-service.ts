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
import { OswUploadMeta } from "../model/osw-upload-meta";
import { OSWConfidenceRequest } from "../model/osw-confidence-request";
import { OSWConfidenceResponse } from "../model/osw-confidence-response";
import { OswConfidenceJob } from "../database/entity/osw-confidence-job-entity";
import { OswFormatJob } from "../database/entity/osw-format-job-entity";
import { OswFormatJobRequest } from "../model/osw-format-job-request";
import { OswFormatJobResponse } from "../model/osw-format-job-response";

export class EventBusService implements IEventBusServiceInterface {
    private queueConfig: AzureQueueConfig;
    publishingTopic: Topic;
    public uploadTopic: Topic;
    public confidenceReqTopic: Topic;
    public confidenceResTopic: Topic; // May not need
    public validationTopic: Topic;

    constructor(queueConnection: string = environment.eventBus.connectionString as string, publishingTopicName: string = environment.eventBus.dataServiceTopic as string) {
        Core.initialize();
        this.queueConfig = new AzureQueueConfig();
        this.queueConfig.connectionString = queueConnection;
        this.publishingTopic = Core.getTopic(publishingTopicName);
        this.uploadTopic = Core.getTopic(environment.eventBus.uploadTopic as string);
        // Confidence metric In and out
        this.confidenceReqTopic = Core.getTopic(environment.eventBus.confidenceRequestTopic as string)
        this.confidenceResTopic = Core.getTopic(environment.eventBus.confidenceResponseTopic as string)
        // For formatter service
        this.validationTopic = Core.getTopic(environment.eventBus.validationTopic as string)

    }

    // function to handle messages after formatting is done.
    private processUpload = async (messageReceived: QueueMessage) => {
        let tdeiRecordId = "";
        try {
            console.log(messageReceived);
            if(messageReceived.messageType == 'osw-formatter-response'){
                console.log('Received on demand format response');
                console.log(messageReceived);
                const response = OswFormatJobResponse.from(messageReceived.data);
                console.log('Response')
                console.log(response);
                oswService.updateOSWFormatJob(response);
                console.log('updated job');
                return;
            }
            const queueMessage = QueueMessageContent.from(messageReceived.data);
            tdeiRecordId = queueMessage.tdeiRecordId!;

            console.log("Received message for : ", queueMessage.tdeiRecordId, "Message received for osw processing !");

            if (!queueMessage.response.success || !queueMessage.meta.isValid) {
                const errorMessage = "Received failed workflow request";
                console.error(queueMessage.tdeiRecordId, errorMessage, messageReceived);
                return Promise.resolve();
            }

            if (!await queueMessage.hasPermission(["tdei-admin", "poc", "osw_data_generator"])) {
                const errorMessage = "Unauthorized request !";
                console.error(queueMessage.tdeiRecordId, errorMessage);
                throw Error(errorMessage);
            }

            const oswVersions: OswVersions = OswVersions.from(queueMessage.request);
            oswVersions.tdei_record_id = queueMessage.tdeiRecordId;
            oswVersions.uploaded_by = queueMessage.userId;
            oswVersions.file_upload_path = queueMessage.meta.file_upload_path ?? "";
            oswVersions.download_osm_url = queueMessage.meta.download_xml_url ?? "";

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
                    oswService.updateOsw(oswVersions).then(() => {
                        this.publish(messageReceived,
                            {
                                success: true,
                                message: 'OSW request processed successfully !'
                            });
                        return Promise.resolve();
                    }).catch((error: any) => {
                        console.error('Error updating the osw version', error);
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

    // Internal method for publishing data.
    private publish(queueMessage: QueueMessage, response: {
        success: boolean,
        message: string
    }) {
        const queueMessageContent: QueueMessageContent = QueueMessageContent.from(queueMessage.data);
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

    subscribeUpload(formatterTopic: string = environment.eventBus.formatterTopic as string, formatterSubscription: string = environment.eventBus.formatterSubscription as string): void {
        Core.getTopic(formatterTopic,
            this.queueConfig)
            .subscribe(formatterSubscription, {
                onReceive: this.processUpload,
                onError: this.processUploadError
            });
    }

    // Publishes data for uploading
    public publishUpload(request: OswUploadMeta, recordId: string, file_upload_path: string, userId: string, meta_file_path: string) {
        const messageContent = QueueMessageContent.from({
            stage: 'osw-upload',
            request: request,
            userId: userId,
            projectGroupId: request.tdei_project_group_id,
            tdeiRecordId: recordId,
            meta: {
                'file_upload_path': file_upload_path,
                'meta_file_path': meta_file_path
            },
            response: {
                success: true,
                message: 'File uploaded for the  project group: ' + request.tdei_project_group_id + ' with record id' + recordId
            }
        });
        const message = QueueMessage.from(
            {
                messageType: 'osw-upload',
                data: messageContent,

            }
        )
        this.uploadTopic.publish(message);
    }

    // Methods for handling the confidence response
    subscribeConfidenceMetric(): void {
        const responseSubscription = environment.eventBus.confidenceResponseSubscription as string
        this.confidenceResTopic.subscribe(responseSubscription,
            {
                onReceive: this.processConfidenceReceived,
                onError: this.processConfidenceFailed
            })
    }

    public processConfidenceReceived(msg: QueueMessage) {
        console.log('received confidence calculation message')
        const confidenceResponse = OSWConfidenceResponse.from(msg.data)
        console.log(confidenceResponse);
        // Do the database transaction
        oswService.updateConfidenceMetric(confidenceResponse);
    }

    public processConfidenceFailed(error: Error) {
        console.log('received confidence calculation failed message')
        console.log(error)
    }

    public publishConfidenceRequest(req: OSWConfidenceRequest) {
        this.confidenceReqTopic.publish(QueueMessage.from({
            messageType: 'osw-confidence-request',
            data: req
        }))
    }

     publishOnDemandFormat(info: OswFormatJob): void {
        const oswFormatRequest = OswFormatJobRequest.from({
            jobId:info.jobId.toString(),
            source:info.source,
            target:info.target,
            sourceUrl:info.source_url
        });
        
         const message = QueueMessage.from({
            messageType: "osw-formatter-request",
            data: oswFormatRequest
         });
         console.log(message);
         // Publish the same
         this.validationTopic.publish(message); 
     }

    
}

// const eventBusService = new EventBusService();
// export default eventBusService;