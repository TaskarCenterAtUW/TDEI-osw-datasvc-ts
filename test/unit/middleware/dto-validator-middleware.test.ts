import validateQueryDto from '../../../src/middleware/dto-validation-middleware';
import { getMockReq, getMockRes } from '@jest-mock/express';
import HttpException from '../../../src/exceptions/http/http-base-exception';
import { DatasetQueryParams } from '../../../src/model/dataset-get-query-params';

describe('validateQueryDto Middleware', () => {

    beforeEach(() => {
    });

    it('Passing valid pram, should call next without errors if validation passes', async () => {
        const mockRequest = getMockReq({
            query: { name: 'test' },
        });
        const { res: mockResponse, next } = getMockRes();

        await validateQueryDto(DatasetQueryParams)(mockRequest, mockResponse, next);

        expect(next).toHaveBeenCalledWith();
    });

    it('Passing invalid parameter, should call next with an error if validation fails', async () => {

        const mockRequest = getMockReq({
            query: { name: "test", param2: 'test' },
        });
        const { res: mockResponse, next } = getMockRes();

        await validateQueryDto(DatasetQueryParams)(mockRequest, mockResponse, next);
        expect(next).toHaveBeenCalledWith(
            new HttpException(400, 'Query param param2 is not supported')
        );
    });

    it('include_my_groups=true query string should pass boolean validation', async () => {
        const mockRequest = getMockReq({
            query: { include_my_groups: 'true' },
        });
        const { res: mockResponse, next } = getMockRes();

        await validateQueryDto(DatasetQueryParams)(mockRequest, mockResponse, next);

        expect(next).toHaveBeenCalledWith();
    });

    it('include_my_groups=false query string should pass boolean validation', async () => {
        const mockRequest = getMockReq({
            query: { include_my_groups: 'false' },
        });
        const { res: mockResponse, next } = getMockRes();

        await validateQueryDto(DatasetQueryParams)(mockRequest, mockResponse, next);

        expect(next).toHaveBeenCalledWith();
    });

    it('include_my_groups with invalid value should fail boolean validation', async () => {
        const mockRequest = getMockReq({
            query: { include_my_groups: 'maybe' },
        });
        const { res: mockResponse, next } = getMockRes();

        await validateQueryDto(DatasetQueryParams)(mockRequest, mockResponse, next);

        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 400,
                message: expect.stringContaining('include_my_groups must be a boolean value'),
            })
        );
    });
});
