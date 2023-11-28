import { OswFormatJob } from "../../database/entity/osw-format-job-entity"

export interface IEventBusServiceInterface {
    subscribeUpload(): void
    subscribeConfidenceMetric():void
    publishOnDemandFormat(info:OswFormatJob):void 
}