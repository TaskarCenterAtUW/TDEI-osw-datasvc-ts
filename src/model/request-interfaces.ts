import { FileEntity } from "nodets-ms-core/lib/core/storage";

export interface IDatasetCloneRequest {
    isAdmin: boolean;
    tdei_dataset_id: string;
    tdei_project_group_id: string;
    tdei_service_id: string;
    user_id: string;
    metafile: any;
}

export interface CloneContext {
    db_clone_dataset_updated: boolean;
    blob_clone_uploaded: boolean;
    osw_dataset_elements_cloned: boolean;
    dest_changeset_upload_entity?: FileEntity;
    dest_dataset_upload_entity?: FileEntity;
    dest_metadata_upload_entity?: FileEntity;
    dest_osm_upload_entity?: FileEntity;
    new_tdei_dataset_id: string;
    dest_dataset_download_entity?: FileEntity;
    dest_osm_download_entity?: FileEntity;
}