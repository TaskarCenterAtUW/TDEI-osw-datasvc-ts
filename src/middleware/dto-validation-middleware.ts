import { validate, ValidationError } from 'class-validator';
import { RequestHandler } from 'express';
import HttpException from '../exceptions/http/http-base-exception';
import { BaseDto } from '../model/base-dto';

function validationMiddleware<T extends BaseDto>(type: { new(args: T): T; }): RequestHandler {
    return (req, res, next) => {
        if (!req.body) next(new HttpException(400, "Request body not found"));

        validate(new type(req.body))
            .then((errors: ValidationError[]) => {
                if (errors.length > 0) {
                    const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
                    next(new HttpException(400, message));
                } else {
                    next();
                }
            });
    };
}

export default validationMiddleware;