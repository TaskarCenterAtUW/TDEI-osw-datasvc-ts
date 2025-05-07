import { validate, ValidationError } from 'class-validator';
import { RequestHandler } from 'express';
import HttpException from '../exceptions/http/http-base-exception';

function validateQueryDto(dtoClass: any): RequestHandler {
    return (req, res, next) => {
        validate(new dtoClass(req.query), {
            whitelist: true,
            forbidNonWhitelisted: true
        }).then((errors: ValidationError[]) => {
            if (errors.length > 0) {

                const message = errors.map((error: ValidationError) => {
                    if (error.constraints?.whitelistValidation) {
                        return `Query param ${error.property} is not supported`;
                    }
                    else {
                        return Object.values(error.constraints || {}).join('\n ');
                    }
                }
                ).join('\n ');
                next(new HttpException(400, message));
            } else {
                next();
            }
        });
    };
}

export default validateQueryDto;