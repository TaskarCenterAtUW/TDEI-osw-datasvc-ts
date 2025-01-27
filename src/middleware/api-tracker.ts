/**
 * Middleware to handle the API Tracking.
 */

import { Request, Response, NextFunction } from 'express';
import { APITrackerService } from '../service/api-tracker-service';


/**
 * Middleware to track the API usage.
 * It can be useed after the authenticate middleware to capture the user_id and request params.
 * @param req - Request
 * @param res - Response
 * @param next - NextFunction
 * @returns void
 */
export const apiTracker = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    res.on('finish', async () => {
        const responseTime = Date.now() - startTime; 
        const responseStatus = res.statusCode;

        try {
            const userId = req.body.user_id || null;
            
            // Add response details to the API usage logs
            await APITrackerService.saveAPIUsageSummary(req);
            await APITrackerService.saveAPIUsageDetails(req, { responseStatus, responseTime, userId });
        } catch (error) {
            console.error('Error in API Tracker Middleware:', error);
        }
        
    });
    next();
}

