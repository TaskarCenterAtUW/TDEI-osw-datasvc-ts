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

    public static async saveAPIUsageDetails(req: Request): Promise<void> {
        try {
            const matchedRoute = req.route?.path || req.originalUrl;
            const request_params = {
              ...req.body,
              ...req.params,
              ...req.query
            }
            const details = new APIUsageDetailsEntity({
                endpoint: matchedRoute,
                method: req.method,
                client_ip: req.ip,
                user_id: req.body.user_id || null,
                request_params: request_params || null
            })
            await dbClient.query(APIUsageDetailsEntity.getCreateAPIUsageDetailsQuery(details));
        } catch (error) {
            console.error(error);
        }
    }
}