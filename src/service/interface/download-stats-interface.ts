import { DownloadStatsEntity } from "../../database/entity/download-stats";
import { DownloadStatsDTO } from "../../model/download-stats-dto";

export interface IDownloadStats {
    /**
   * Creates a dataset.
   * 
   * @param downloadStatsObj - The download stats object to be created.
   * @returns A promise that resolves to the created dataset DTO.
   * @throws {DuplicateException} If a duplicate dataset is detected.
   * @throws {Error} If an error occurs while saving the dataset version.
   */
  createDownloadStats(downloadStatsObj: DownloadStatsEntity): Promise<DownloadStatsDTO>;
}