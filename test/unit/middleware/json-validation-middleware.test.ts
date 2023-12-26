import { getMockReq, getMockRes } from "@jest-mock/express"
import { metajsonValidator } from "../../../src/middleware/metadat-json-validation-middleware"
import { InputException } from "../../../src/exceptions/http/http-exceptions"

/**
 * Test cases for json validator
 */


describe('metajsonValidator', () => {
    let reqData: any = {
        files: {
            metadata: [
                {
                    buffer: Buffer.from('{"key": "value"}'), // Example JSON data
                },
            ],
        },
    };

    it('should call next() if metadata file is present and valid JSON', async () => {
        const req = getMockReq({ body: reqData });
        const { res, next } = getMockRes();
        await metajsonValidator(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('should throw InputException if metadata file is missing', async () => {
        let localObj = { ...reqData };
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should throw InputException if metadata file contains invalid JSON', async () => {
        let localObj = { ...reqData };
        localObj.files.metadata[0].buffer = Buffer.from('invalid-json');
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should handle general errors by throwing InputException with a default message', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();

        jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
            throw new Error('Some unexpected error');
        });

        await metajsonValidator(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });
});