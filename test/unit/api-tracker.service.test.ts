import dbClient from '../../src/database/data-source';
import { getMockReq } from '@jest-mock/express';
import { APITrackerService } from '../../src/service/api-tracker-service';
import { APIUsageSummaryEntity, APIUsageDetailsEntity } from '../../src/database/entity/api-usage-entity';

describe('API Tracker Service Test', () => {
    describe('saveAPIUsageSummary', () => {
        describe('Function', () => {
            test('should call the upsert query with the matched route', async () => {
                
                const req = getMockReq({
                    route: { path: '/test/endpoint' },
                    originalUrl: '/test/endpoint',
                });

                const mockQuery = jest.fn();
                dbClient.query = mockQuery;

                const mockUpsertQuery = {
                    text: 'MOCK_UPSERT_QUERY',
                    values: []
                };
                jest.spyOn(APIUsageSummaryEntity, 'getUpsertApiUsageSummaryQuery').mockReturnValue(mockUpsertQuery);
                await APITrackerService.saveAPIUsageSummary(req);

                expect(APIUsageSummaryEntity.getUpsertApiUsageSummaryQuery).toHaveBeenCalledWith('/test/endpoint');
                expect(mockQuery).toHaveBeenCalledWith(mockUpsertQuery);
            })

            test('should log an error if the query fails', async () => {
                const req = getMockReq({
                    route: { path: '/test/endpoint' },
                    originalUrl: '/test/endpoint',
                });
    
                jest.spyOn(APIUsageSummaryEntity, 'getUpsertApiUsageSummaryQuery').mockReturnValue({
                    text: 'MOCK_UPSERT_QUERY',
                    values: []
                });
                const mockQuery = jest.fn().mockRejectedValueOnce(new Error('Database error'));
                dbClient.query = mockQuery;
    
                const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
                await APITrackerService.saveAPIUsageSummary(req);
    
                expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Database error'));
    
                consoleErrorSpy.mockRestore();

            })
        })
    })

    describe('saveAPIUsageDetails', () => {
        describe('Functional', () => {
            test('should save API usage details with the correct values', async () => {
                const req = getMockReq({
                    route: { path: '/test/endpoint' },
                    originalUrl: '/test/endpoint',
                    method: 'GET',
                    body: { param1: 'value1' },
                    params: { param2: 'value2' },
                    query: { param3: 'value3' },
                    headers: { 'x-forwarded-for': '192.168.0.1' },
                    ip: '127.0.0.1',
                });
    
                const responseStatus = 200;
                const responseTime = 500;
                const userId = 'testUserId';
    
                const mockDetails = {
                    endpoint: '/test/endpoint',
                    method: 'GET',
                    client_ip: '192.168.0.1',
                    user_id: 'testUserId',
                    request_params: {
                        param1: 'value1',
                        param2: 'value2',
                        param3: 'value3',
                    },
                    response_status: responseStatus,
                    response_time: responseTime,
                };
    
                const mockQuery = jest.fn();
                dbClient.query = mockQuery;
    
                const mockCreateQuery = {
                    text: 'MOCK_CREATE_QUERY',
                    values: []
                };
                jest.spyOn(APIUsageDetailsEntity, 'getCreateAPIUsageDetailsQuery').mockReturnValue(mockCreateQuery);
    
                await APITrackerService.saveAPIUsageDetails(req, { responseStatus, responseTime, userId });
    
                expect(APIUsageDetailsEntity.getCreateAPIUsageDetailsQuery).toHaveBeenCalledWith(expect.objectContaining(mockDetails));
                expect(mockQuery).toHaveBeenCalledWith(mockCreateQuery);
            })

            test('should use the request IP if x-forwarded-for is not present', async () => {
                const req = getMockReq({
                    route: { path: '/test/endpoint' },
                    originalUrl: '/test/endpoint',
                    method: 'POST',
                    body: { param1: 'value1' },
                    params: {},
                    query: {},
                    headers: {},
                    ip: '127.0.0.1',
                });
            
                const responseStatus = 201;
                const responseTime = 300;
            
                const mockQuery = jest.fn();
                dbClient.query = mockQuery;
            
                // Mock `getCreateAPIUsageDetailsQuery` to return a plain string query
                jest.spyOn(APIUsageDetailsEntity, 'getCreateAPIUsageDetailsQuery').mockReturnValue({
                    text: 'MOCK_CREATE_QUERY',
                    values: []
                });
            
                await APITrackerService.saveAPIUsageDetails(req, { responseStatus, responseTime });
            
                expect(APIUsageDetailsEntity.getCreateAPIUsageDetailsQuery).toHaveBeenCalledWith(
                    expect.objectContaining({
                        client_ip: '127.0.0.1',
                    })
                );
                expect(APIUsageDetailsEntity.getCreateAPIUsageDetailsQuery).toHaveBeenCalledWith(
                    expect.objectContaining({
                        client_ip: '127.0.0.1',
                    })
                );
                expect(mockQuery).toHaveBeenCalledWith({
                    text: 'MOCK_CREATE_QUERY',
                    values: []
                });
            })

            test('should log an error if the query fails', async () => {
                const req = getMockReq({
                    route: { path: '/test/endpoint' },
                    originalUrl: '/test/endpoint',
                    method: 'GET',
                });
    
                const responseStatus = 500;
                const responseTime = 100;
    
                jest.spyOn(APIUsageDetailsEntity, 'getCreateAPIUsageDetailsQuery').mockReturnValue({
                    text: 'MOCK_CREATE_QUERY',
                    values: []
                });
                const mockQuery = jest.fn().mockRejectedValueOnce(new Error('Database error'));
                dbClient.query = mockQuery;
    
                const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
                await APITrackerService.saveAPIUsageDetails(req, { responseStatus, responseTime });
    
                expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Database error'));
    
                consoleErrorSpy.mockRestore();
            })
        })
    })
});