import { Request, Response, NextFunction } from 'express';
import { InputException } from '../exceptions/http/http-exceptions';

export function listRequestValidation(req: Request, res: Response, next: NextFunction) {
    const { page_size } = req.query;

    if (page_size && Number(page_size) > 50) {
        return next(new InputException('page_size should be less than or equal to 50', res));
    }

    next();
}