import dbClient from "../database/data-source"
import { APIUsageSummaryEntity, APIUsageDetailsEntity } from '../database/entity/api-usage-entity';
import { Request } from 'express';

export class APITrackerService {
    public static async saveAPIUsageSummary(req: Request): Promise<void> {
        try {
            const matchedRoute = req.route?.path || req.originalUrl;
            await dbClient.query(APIUsageSummaryEntity.getUpsertApiUsageSummaryQuery(matchedRoute));
        } catch (error) {
            console.error(error);
        }
    }

    public static async saveAPIUsageDetails(req: Request, { responseStatus, responseTime, userId }: { responseStatus: number; responseTime: number, userId?: string }): Promise<void> {
        try {
            const matchedRoute = req.route?.path || req.originalUrl;
            const request_params = {
              ...req.body,
              ...req.params,
              ...req.query
            }
            // Extract the real client IP
            const clientIpHeader = req.headers['x-forwarded-for'] as string | undefined;
            const clientIp = clientIpHeader ? clientIpHeader.split(',')[0].trim() : (req.ip || 'unknown');
            const details = new APIUsageDetailsEntity({
                endpoint: matchedRoute,
                method: req.method,
                client_ip: clientIp,
                user_id: userId,
                request_params: request_params || null,
                response_status: responseStatus,
                response_time: responseTime
            })
            await dbClient.query(APIUsageDetailsEntity.getCreateAPIUsageDetailsQuery(details));
        } catch (error) {
            console.error(error);
        }
    }
}