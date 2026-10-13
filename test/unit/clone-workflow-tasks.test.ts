import dbClient from "../../src/database/data-source";
import { OrchestratorFunctions } from "../../src/orchestrator_v2/task/task-functions";
import storageService from "../../src/service/storage-service";

describe("Clone workflow tasks", () => {
    const newId = "new-dataset-id";
    const sourceUrl = "https://blob.example/osw/2024/1/pg/source-dataset-id/file.zip";
    const destUrl = "https://blob.example/osw/2024/1/pg/new-dataset-id/file.zip";

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("cleanup deletes destination blobs, OSW elements, and the draft row", async () => {
        jest.spyOn(dbClient, "query")
            .mockResolvedValueOnce({
                rowCount: 1,
                rows: [{
                    status: "Draft",
                    data_type: "osw",
                    dataset_url: sourceUrl,
                    latest_dataset_url: sourceUrl,
                    metadata_url: sourceUrl,
                    changeset_url: null,
                    osm_url: null,
                    latest_osm_url: null
                }]
            } as any)
            .mockResolvedValueOnce({ rowCount: 0, rows: [] } as any)
            .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);
        const deleteFile = jest.spyOn(storageService, "deleteFile").mockResolvedValue();

        const result = await OrchestratorFunctions.cleanup_failed_clone({
            new_tdei_dataset_id: newId,
            uploaded_urls: [destUrl, sourceUrl]
        });

        expect(result.success).toBe(true);
        expect(deleteFile).toHaveBeenCalledTimes(1);
        expect(deleteFile).toHaveBeenCalledWith(destUrl);
        expect(dbClient.query).toHaveBeenNthCalledWith(2, expect.objectContaining({
            text: "SELECT content.tdei_delete_osw_dataset_elements($1)",
            values: [newId]
        }));
        expect(dbClient.query).toHaveBeenNthCalledWith(3, expect.objectContaining({
            text: "DELETE FROM content.dataset WHERE tdei_dataset_id = $1 AND status = 'Draft'",
            values: [newId]
        }));
    });

    test("cleanup leaves a Pre-Release dataset in place", async () => {
        jest.spyOn(dbClient, "query").mockResolvedValueOnce({
            rowCount: 1,
            rows: [{ status: "Pre-Release", data_type: "osw", dataset_url: destUrl }]
        } as any);
        const deleteFile = jest.spyOn(storageService, "deleteFile").mockResolvedValue();

        const result = await OrchestratorFunctions.cleanup_failed_clone({
            new_tdei_dataset_id: newId,
            uploaded_urls: [destUrl]
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain("no longer draft");
        expect(deleteFile).not.toHaveBeenCalled();
        expect(dbClient.query).toHaveBeenCalledTimes(1);
    });

    test("blob clone returns uploaded urls when a later copy fails", async () => {
        jest.spyOn(dbClient, "query").mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                data_type: "osw",
                latest_dataset_url: sourceUrl,
                changeset_url: null,
                latest_osm_url: null,
                upload_file_size_bytes: 10
            }]
        } as any);
        jest.spyOn(storageService, "cloneFile").mockResolvedValue({ remoteUrl: encodeURI(destUrl) } as any);
        jest.spyOn(storageService, "uploadFile").mockRejectedValue(new Error("upload failed"));

        const result = await OrchestratorFunctions.clone_dataset_blobs({
            source_tdei_dataset_id: "source-dataset-id",
            new_tdei_dataset_id: newId,
            tdei_project_group_id: "pg",
            metadata_content_base64: Buffer.from("{}").toString("base64")
        });

        expect(result.success).toBe(false);
        expect(result.uploaded_urls).toEqual([destUrl]);
    });
});
