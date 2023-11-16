import { getMockReq, getMockRes } from "@jest-mock/express"
import { metajsonValidator } from "../../../src/middleware/json-validation-middleware"
import { InputException } from "../../../src/exceptions/http/http-exceptions"

/**
 * Test cases for json validator
 */
describe('JSON Validation middleware', ()=>{

    test('When meta parameter is not given, expect Input Exception error', async ()=>{
        const req = getMockReq()
        const {res,next} = getMockRes()
        await metajsonValidator(req,res,next);

        expect(next).toBeCalledWith(expect.any(InputException))

    })
    test('When meta is invalid json, expect Input exception error', async ()=>{
        const req = getMockReq({body:{"meta":"random-text"}})
        const {res,next} = getMockRes()
        await metajsonValidator(req,res,next);

        expect(next).toBeCalledWith(expect.any(InputException))
    })

    test('When meta is valid, expect next function to be called', async ()=>{
        const req = getMockReq({body:{"meta":'{"test":"message"}'}})
        const {res,next} = getMockRes()
        await metajsonValidator(req,res,next);

        expect(next).toHaveBeenCalledTimes(1);
    })
})
