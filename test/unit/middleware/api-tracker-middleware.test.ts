import { getMockReq, getMockRes } from '@jest-mock/express'
import { apiTracker } from '../../../src/middleware/api-tracker';
import { APITrackerService } from '../../../src/service/api-tracker-service';


describe('API Tracker Middleware Test', () => {
    it('should call next() and track API usage', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();

        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();

        req.body.user_id = 'someUserId';
        
        await apiTracker(req, res, next);
        expect(req.body.user_id).toBe('someUserId');
        expect(next).toHaveBeenCalled();
    })

    it('should call next() even database saved failed', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockRejectedValueOnce(new Error('unknown error'))
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockRejectedValueOnce(new Error('unknown error'))

        req.body.user_id = 'someUserId';
        
        await apiTracker(req, res, next);
        expect(req.body.user_id).toBe('someUserId');
        expect(next).toHaveBeenCalled();
    })

    it('should handle errors in the API Tracker Middleware gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const req = getMockReq()
        let { res, next } = getMockRes();
        
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockRejectedValueOnce(new Error('unknown error'))
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockRejectedValueOnce(new Error('unknown error'))

        // Mock the `finish` event
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callback();
            }
            return res;  // Return res to match Response type
        });

        await apiTracker(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

        // Ensure errors are logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error in API Tracker Middleware:', expect.any(Error));
        
        // Restore the original console.error
        consoleErrorSpy.mockRestore();

    })

    it("should execute the callback for res.on('finish') and track API usage details", async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();
    
        req.body.user_id = 'testUserId';
    
        const finishCallback = jest.fn();
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                finishCallback();
                callback(); // Call the provided callback
            }
            return res;  // Return res to match Response type
        });
    
        await apiTracker(req, res, next);
    
        // Simulate response finish event
        expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
        expect(finishCallback).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('should pass correct responseStatus and responseTime to APITrackerService', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();
    
        req.body.user_id = 'testUserId';
    
        const startTime = Date.now();
        jest.spyOn(Date, 'now').mockImplementationOnce(() => startTime).mockImplementationOnce(() => startTime + 500);
    
        res.statusCode = 200;
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callback(); // Call the provided callback
            }
            return res;
        });
    
        await apiTracker(req, res, next);
    
        expect(APITrackerService.saveAPIUsageDetails).toHaveBeenCalledWith(req, {
            responseStatus: 200,
            responseTime: 500,
            userId: 'testUserId',
        });
    
        // Restore the Date.now mock
        jest.restoreAllMocks();
    });

    it('should handle requests with missing user_id gracefully', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();
    
        req.body = {}; // No user_id in the body
    
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callback();
            }
            return res;
        });
    
        await apiTracker(req, res, next);
    
        expect(APITrackerService.saveAPIUsageDetails).toHaveBeenCalledWith(req, {
            responseStatus: expect.any(Number),
            responseTime: expect.any(Number),
            userId: null, // userId is null when not present
        });
        expect(next).toHaveBeenCalled();
    });

    it('should handle requests with missing user_id gracefully', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();
    
        req.body = {}; // No user_id in the body
    
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callback();
            }
            return res;
        });
    
        await apiTracker(req, res, next);
    
        expect(APITrackerService.saveAPIUsageDetails).toHaveBeenCalledWith(req, {
            responseStatus: expect.any(Number),
            responseTime: expect.any(Number),
            userId: null, // userId is null when not present
        });
        expect(next).toHaveBeenCalled();
    });

    it('should not block the request when an unexpected error occurs in APITrackerService', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockRejectedValueOnce(new Error('Unexpected Error in Summary'));
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockRejectedValueOnce(new Error('Unexpected Error in Details'));
    
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
        req.body.user_id = 'testUserId';
    
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callback();
            }
            return res;
        });
    
        await apiTracker(req, res, next);
    
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error in API Tracker Middleware:', expect.any(Error));
        expect(next).toHaveBeenCalled();
    
        consoleErrorSpy.mockRestore();
    });

    it("should not call res.on('finish') callback multiple times", async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();
    
        jest.spyOn(APITrackerService, 'saveAPIUsageSummary').mockResolvedValueOnce();
        jest.spyOn(APITrackerService, 'saveAPIUsageDetails').mockResolvedValueOnce();
    
        req.body.user_id = 'testUserId';
    
        let callbackCallCount = 0;
        res.on = jest.fn((event, callback) => {
            if (event === 'finish') {
                callbackCallCount++;
                callback(); // Call the provided callback
            }
            return res;
        });
    
        await apiTracker(req, res, next);
    
        expect(callbackCallCount).toBe(1);
        expect(next).toHaveBeenCalled();
    });
})

