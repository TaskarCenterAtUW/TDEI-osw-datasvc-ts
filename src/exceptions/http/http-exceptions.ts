import HttpException from "./http-base-exception";
import { Response } from "express";

export class DuplicateException extends HttpException {
    constructor(name: string) {
        super(400, `Input with value '${name}' already exists.`);
    }
}

export class UnAuthenticated extends HttpException {
    constructor() {
        super(401, `User not authenticated/authorized to perform this action.`);
    }
}

export class ForbiddenAccess extends HttpException {
    constructor() {
        super(403, `User not authorized to perform this action.`);
    }
}

export class ForeignKeyException extends HttpException {
    constructor(name: string) {
        super(400, `No reference found for the constraint '${name}' in the system.`);
    }
}

export class FileTypeException extends HttpException {
    constructor() {
        super(400, 'Invalid file type.');
    }
}

export class OverlapException extends HttpException {
    constructor(name: string) {
        super(400, `Validity of the record overlaps with dataset id ${name} in the system.`);
    }
}

export class UserNotFoundException extends HttpException {
    constructor(name: string) {
        super(404, `User not found for the given username '${name}'.`);
    }
}

export class InputException extends HttpException {
    constructor(message: string, response?: Response) {
        response?.status(400).send(message);
        super(400, message);
    }
}

export class JobIdNotFoundException extends HttpException {
    constructor(jobId: string, response?: Response) {
        let message = `JobId with ID ${jobId} not found`;
        response?.status(404).send(message);
        super(404, message);
    }
}

export class ServiceNotFoundException extends HttpException {
    constructor(serviceId: string) {
        super(404, `Service ID ${serviceId} is not found or inactive`);
    }
}


export class JobIncompleteException extends HttpException {
    constructor(jobId: string, response?: Response) {
        let message = `Job with ID ${jobId} is not completed yet`;
        response?.status(400).send(message);
        super(404, message);
    }
}

export class JobFailedException extends HttpException {
    constructor(jobId: string, response?: Response) {
        let message = `Job with ID ${jobId} is failed`;
        response?.status(400).send(message);
        super(404, message);
    }
}

