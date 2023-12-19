export interface IUploadRequest {
    user_id: string;
    tdei_service_id: string;
    tdei_project_group_id: string;
    datasetFile: any;
    metadataFile: any;
    changesetFile: any;
}