/**
 * Middleware to handle the API Tracking.
 */

import { Request, Response, NextFunction } from 'express';
import { APIUsageUtility } from '../utility/utility';


/**
 * Middleware to track the API usage.
 * It can be useed after the authenticate middleware to capture the user_id and request params.
 * @param req - Request
 * @param res - Response
 * @param next - NextFunction
 * @returns void
 */
export const apiTracker = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('inside api tracker')
        await APIUsageUtility.saveAPIUsageSummary(req);
        await APIUsageUtility.saveAPIUsageDetails(req);
    } catch (error) {
        console.error(error);
    } finally {
        next();
    }
}

