import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import dbClient from "../../src/database/data-source";
import { JobEntity } from "../../src/database/entity/job-entity";
import HttpException from "../../src/exceptions/http/http-base-exception";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { CreateJobDTO, UpdateJobDTO, JobDTO } from "../../src/model/job-dto";
import { JobStatus, JobType, JobsQueryParams } from "../../src/model/jobs-get-query-params";
import jobService from "../../src/service/job-service";
import { mockCore } from "../common/mock-utils";


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
            let dbSpy = jest.spyOn(dbClient, "query").mockResolvedValue(mockResult as any);

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
            let dbSpy = jest.spyOn(dbClient, "query").mockResolvedValueOnce(mockResult as any);

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
            let dbSpy = jest.spyOn(dbClient, "query").mockResolvedValue(mockResult as any);

            // Act
            const result = await jobService.updateJob(updateJobDTO);

            // Assert
            expect(dbClient.query).toHaveBeenCalledTimes(2);
            expect(result).toBeInstanceOf(JobDTO);
        });
    });
});