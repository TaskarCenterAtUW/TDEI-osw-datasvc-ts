import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../../src/database/data-source";
import { JobEntity } from "../../src/database/entity/job-entity";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { CreateJobDTO, UpdateJobDTO, JobDTO } from "../../src/model/job-dto";
import { JobStatus, JobType, JobsQueryParams } from "../../src/model/jobs-get-query-params";
import jobService from "../../src/service/job-service";
import { getMockFileEntity, mockCore } from "../common/mock-utils";


describe('JobService', () => {

    describe('getJobs', () => {
        it('should return an array of JobDTO objects', async () => {
            // Arrange
            const user_id = 'mock-user-id';
            const params = new JobsQueryParams({ job_id: "1" });
            const mockResult = {
                rows: [
                    {
                        job_id: 1,
                        download_url: 'mock-download-url',
                    },
                ],
            };
            const queryObj = <never>{
                text: 'mock-text',
                values: [] as any[]
            };
            jest.spyOn(params, "getQuery").mockResolvedValueOnce(queryObj);
            const dbSpy = jest.spyOn(dbClient, "query").mockResolvedValue(mockResult as any);

            // Act
            const result = await jobService.getJobs(user_id, params);

            // Assert
            expect(dbSpy).toHaveBeenCalled();
            expect(result).toBeInstanceOf(Array<JobDTO>);
        });
    });

    describe('getJobFileEntity', () => {
        it('should return the FileEntity associated with the given job ID', async () => {
            // Arrange
            const job_id = '101';
            const mockResult = <any>{
                rowCount: 1,
                rows: [
                    {
                        download_url: 'mock-download-url.zip',
                    },
                ],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);
            mockCore();

            // Act
            const result = await jobService.getJobFileEntity(job_id);

            // Assert
            expect(dbClient.query).toHaveBeenCalledWith(JobEntity.getJobByIdQuery(job_id));
            expect(Core.getStorageClient).toHaveBeenCalled();
            expect(result).toBeInstanceOf(Object);
        });

        it('should throw an InputException if the job is not found', async () => {
            // Arrange
            const job_id = 'mock-job-id';
            const mockResult = <any>{
                rowCount: 0,
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);
            mockCore();
            // Act & Assert
            await expect(jobService.getJobFileEntity(job_id)).rejects.toThrow(HttpException);
        });

        it('should throw an HttpException if the download URL is not available', async () => {
            // Arrange
            const job_id = 'mock-job-id';
            const mockResult = <any>{
                rowCount: 1,
                rows: [
                    {
                        download_url: '',
                    },
                ],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);
            mockCore();

            // Act & Assert
            await expect(jobService.getJobFileEntity(job_id)).rejects.toThrow(HttpException);
        });

        it('should throw an Error if the storage is not configured', async () => {
            // Arrange
            const job_id = 'mock-job-id';
            const mockResult = <any>{
                rowCount: 1,
                rows: [
                    {
                        download_url: 'mock-download-url',
                    },
                ],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);
            mockCore();
            jest.spyOn(Core, "getStorageClient").mockReturnValueOnce(null);

            // Act & Assert
            await expect(jobService.getJobFileEntity(job_id)).rejects.toThrow(Error);
        });
    });

    describe('getJobFileEntity with a file beside the download', () => {
        const job_id = '101';
        const download = 'https://acct.blob.core.windows.net/pathways-converter/101/pathways-converter-output.zip?sv=2024&sig=abc';

        function withDownload(url: string) {
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(<any>{ rowCount: 1, rows: [{ download_url: url }] });
            const storage = { getFileFromUrl: jest.fn().mockResolvedValue(getMockFileEntity()) };
            jest.spyOn(Core, "getStorageClient").mockReturnValue(<any>storage);
            return storage;
        }

        it('should fetch the file from the job\'s own folder', async () => {
            const storage = withDownload(download);
            const result = await jobService.getJobFileEntity(job_id, 'beacon_hill/reference/platform.geojson');
            expect(storage.getFileFromUrl).toHaveBeenCalledWith(
                'https://acct.blob.core.windows.net/pathways-converter/101/beacon_hill/reference/platform.geojson');
            expect(result.mimeType).toBe('application/geo+json');
        });

        it.each([
            ['../other-job/secret.json'],
            ['beacon_hill/../../other/x.json'],
            ['/etc/passwd.txt'],
            ['beacon_hill//x.json'],
            ['beacon_hill/./x.json'],
            ['..%2Fx.json'],
            ['beacon_hill\\x.json'],
            ['https://evil.example.com/x.json'],
            [''],
        ])('should refuse the path %p', async (file) => {
            const storage = withDownload(download);
            await expect(jobService.getJobFileEntity(job_id, file)).rejects.toThrow(InputException);
            expect(storage.getFileFromUrl).not.toHaveBeenCalled();
        });

        it('should refuse a file parameter that isn\'t a string', async () => {
            for (const file of [['a.json', 'b.json'], { toString: () => 'a.json' }]) {
                const storage = withDownload(download);
                await expect(jobService.getJobFileEntity(job_id, <any>file)).rejects.toThrow(InputException);
                expect(storage.getFileFromUrl).not.toHaveBeenCalled();
            }
        });

        it('should refuse file types a download doesn\'t serve', async () => {
            withDownload(download);
            await expect(jobService.getJobFileEntity(job_id, 'beacon_hill/run.sh')).rejects.toThrow(InputException);
        });

        it('should refuse when the download isn\'t in a folder named for the job', async () => {
            const storage = withDownload('https://acct.blob.core.windows.net/pathways-converter/output.zip');
            await expect(jobService.getJobFileEntity(job_id, 'report.md')).rejects.toThrow(HttpException);
            expect(storage.getFileFromUrl).not.toHaveBeenCalled();
        });

        it('should refuse a folder named for another job', async () => {
            withDownload('https://acct.blob.core.windows.net/pathways-converter/1010/output.zip');
            await expect(jobService.getJobFileEntity(job_id, 'report.md')).rejects.toThrow(HttpException);
        });
    });

    describe('getJobDownloadInfo', () => {
        it('should return job_type and download_url for a valid job', async () => {
            // Arrange
            const job_id = '101';
            const mockResult = <any>{
                rowCount: 1,
                rows: [
                    {
                        job_type: 'Quality-Report',
                        download_url: encodeURIComponent('https://example.com/report.pdf'),
                    },
                ],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);

            // Act
            const result = await jobService.getJobDownloadInfo(job_id);

            // Assert
            expect(dbClient.query).toHaveBeenCalledWith(JobEntity.getJobByIdQuery(job_id));
            expect(result).toEqual({
                job_type: 'Quality-Report',
                download_url: 'https://example.com/report.pdf',
            });
        });

        it('should throw InputException when job_id is not a valid number', async () => {
            // Arrange
            const job_id = 'invalid-id';

            // Act & Assert (single call so we do not hit DB)
            await expect(jobService.getJobDownloadInfo(job_id)).rejects.toThrow(InputException);
        });

        it('should throw HttpException when job is not found', async () => {
            // Arrange
            const job_id = '999';
            const mockResult = <any>{ rowCount: 0, rows: [] };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);

            // Act & Assert (single call so mock is not consumed twice)
            await expect(jobService.getJobDownloadInfo(job_id)).rejects.toThrow(HttpException);
        });

        it('should throw HttpException when download_url is null or empty', async () => {
            // Arrange
            const job_id = '101';
            const mockResult = <any>{
                rowCount: 1,
                rows: [{ job_type: 'Dataset-Publish', download_url: null }],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);

            // Act & Assert
            await expect(jobService.getJobDownloadInfo(job_id)).rejects.toThrow(HttpException);
        });

        it('should throw HttpException when download_url is empty string', async () => {
            // Arrange
            const job_id = '101';
            const mockResult = <any>{
                rowCount: 1,
                rows: [{ job_type: 'Dataset-Publish', download_url: '' }],
            };
            jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult);

            // Act & Assert
            await expect(jobService.getJobDownloadInfo(job_id)).rejects.toThrow(HttpException);
        });
    });

    describe('createJob', () => {
        it('should create a job in the database and return the job ID', async () => {
            // Arrange
            const job = CreateJobDTO.from({
                job_id: 1,
                job_type: JobType["Dataset-Publish"],
                status: JobStatus.COMPLETED,
                message: 'mock-message',
                request_input: {},
                response_props: {},
            });
            const mockResult = {
                rows: [
                    {
                        job_id: 1,
                    },
                ],
            };
            const dbSpy = jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult as any);

            // Act
            const result = await jobService.createJob(job);

            // Assert
            expect(dbClient.query).toHaveBeenCalledWith(JobEntity.getCreateJobQuery(job));
            expect(result).toBe(1);
        });
    });

    describe('updateJob', () => {
        it('should update a job with the given parameters and return the updated job object', async () => {
            // Arrange
            const updateJobDTO = UpdateJobDTO.from({
                job_id: "1",
                status: JobStatus.COMPLETED,
                message: 'mock-message',
                response_props: {},
                download_url: 'mock-download-url',
            });
            const mockResult = {
                rows: [
                    {
                        // mock updated job details
                    },
                ],
            };
            const dbSpy = jest.spyOn(dbClient, "query").mockResolvedValue(mockResult as any);

            // Act
            const result = await jobService.updateJob(updateJobDTO);

            // Assert
            expect(dbClient.query).toHaveBeenCalledTimes(2);
            expect(result).toBeInstanceOf(JobDTO);
        });
    });
});