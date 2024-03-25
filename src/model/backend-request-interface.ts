
export interface BboxServiceRequest {
    user_id: string;
    service: string;
    parameters: {
        tdei_dataset_id: string;
        bbox: string;
    };
}

export interface TagRoadServiceRequest {
    user_id: string;
    service: string;
    parameters: {
        tdei_dataset_id: string;
    };
}