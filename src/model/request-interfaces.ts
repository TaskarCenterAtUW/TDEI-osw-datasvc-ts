export interface IDatasetCloneRequest {
    isAdmin: boolean;
    tdei_dataset_id: string;
    tdei_project_group_id: string;
    tdei_service_id: string;
    user_id: string;
    metafile: any;
}