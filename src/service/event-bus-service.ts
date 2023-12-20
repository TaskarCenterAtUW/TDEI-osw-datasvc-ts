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
import { OSWConfidenceRequest } from "../model/osw-confidence-request";
import { OSWConfidenceResponse } from "../model/osw-confidence-response";
import { OswFormatJob } from "../database/entity/osw-format-job-entity";
import { OswFormatJobRequest } from "../model/osw-format-job-request";
import { OswFormatJobResponse } from "../model/osw-format-job-response";

export class EventBusService implements IEventBusServiceInterface {
    private queueConfig: AzureQueueConfig;
    //publishingTopic: Topic;
    //public uploadTopic: Topic;
    public confidenceReqTopic: Topic;
    public confidenceResTopic: Topic; // May not need
    public validationTopic: Topic;

    constructor(queueConnection: string = environment.eventBus.connectionString as string, publishingTopicName: string = environment.eventBus.dataServiceTopic as string) {
        Core.initialize();
        this.queueConfig = new AzureQueueConfig();
        this.queueConfig.connectionString = queueConnection;
        //this.publishingTopic = Core.getTopic(publishingTopicName);
        //this.uploadTopic = Core.getTopic(environment.eventBus.uploadTopic as string);
        // Confidence metric In and out
        this.confidenceReqTopic = Core.getTopic(environment.eventBus.confidenceRequestTopic as string)
        this.confidenceResTopic = Core.getTopic(environment.eventBus.confidenceResponseTopic as string)
        // For formatter service
        this.validationTopic = Core.getTopic(environment.eventBus.validationTopic as string)

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
    /**
     * Publishes confidence request
     * @param req 
     */
    public publishConfidenceRequest(req: OSWConfidenceRequest) {
        this.confidenceReqTopic.publish(QueueMessage.from({
            messageType: 'osw-confidence-request',
            data: req
        }))
    }

    /**
     * Publishes the ondemand format message to `validationTopic`
     * @param info 
     */
    publishOnDemandFormat(info: OswFormatJob): void {
        const oswFormatRequest = OswFormatJobRequest.from({
            jobId: info.jobId.toString(),
            source: info.source,
            target: info.target,
            sourceUrl: info.source_url
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