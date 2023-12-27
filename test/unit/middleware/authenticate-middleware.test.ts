import { getMockReq, getMockRes } from "@jest-mock/express"
import { UnAuthenticated } from "../../../src/exceptions/http/http-exceptions"
import { authenticate } from "../../../src/middleware/authenticate-middleware";
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('authenticate', () => {

    it('should call next() and set user_id if authorization header is valid', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.headers.authorization = 'Bearer validToken';

        jest
            .spyOn(jwt, "decode")
            .mockReturnValueOnce({ sub: 'someUserId' });

        await authenticate(req, res, next);

        expect(req.body.user_id).toBe('someUserId');
        expect(next).toHaveBeenCalled();
    });

    it('should call next() with UnAuthenticated error if authorization header is missing', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(new UnAuthenticated());
    });

    it('should call next() with UnAuthenticated error if authorization header is empty', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.headers.authorization = '';

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(new UnAuthenticated());
    });

    it('should call next() with UnAuthenticated error if bearer is missing', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.headers.authorization = 'Bearer';

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(new UnAuthenticated());
    });

    it('should call next() with UnAuthenticated error if jwt.decode returns null', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.headers.authorization = 'Bearer validToken';

        jest
            .spyOn(jwt, "decode")
            .mockReturnValueOnce(null);

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(new UnAuthenticated());
    });
});

