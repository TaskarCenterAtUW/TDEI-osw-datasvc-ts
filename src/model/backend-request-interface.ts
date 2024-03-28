
export interface ServiceRequest {
    user_id: string;
    service: string;
    parameters: {
        tdei_dataset_id: string;
        bbox: string;
        file_type: string;
    };
}