/**
 * Tests the token validation middleware
 */

import { getMockReq, getMockRes } from "@jest-mock/express"
import { tokenValidator } from "../../../src/middleware/token-validation-middleware"
import { UnAuthenticated } from "../../../src/exceptions/http/http-exceptions"
import jwt from 'jsonwebtoken';
import { mockCoreAuth } from "../../common/mock-utils";



describe('Token validation middleware', () => {

    test('When token header is not present, expect Unauthorized error', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes()

        await tokenValidator(req, res, next)
        expect(next).toBeCalledWith(expect.any(UnAuthenticated))

    })

    test('When token header is empty, expect Unauthorized error', async () => {
        const req = getMockReq({ headers: { 'Authorization': "" } })
        const { res, next } = getMockRes()

        await tokenValidator(req, res, next)
        expect(next).toBeCalledWith(expect.any(UnAuthenticated))
    })

    test('When token is present but not a valid jwt, expect Unauthorized error', async ()=>{
        // Get the header

        const req = getMockReq({ headers: { 'authorization': "sample-token" } })
        const { res, next } = getMockRes()
        
        await tokenValidator(req, res, next)
        expect(next).toBeCalledWith(expect.any(UnAuthenticated))

    })

    test('When a valid token is present, expect to return with user_id in body', async ()=>{
        const testUserId = 'test-user-id';
        const token = jwt.sign('{"sub":"test-user-id"}','secret-key')
        const req = getMockReq({ headers: { 'authorization': token },body:{'meta':'{"tdei_org_id":"sample-org"}'} })
        const { res, next } = getMockRes()
        mockCoreAuth(true);
        await tokenValidator(req, res, next)
        expect(req.body.user_id).toBe(testUserId)
        expect(next).toBeCalled()

    })

    test('When unauthorized token is given, expect to return Unauthorized', async ()=>{

        const testUserId = 'test-user-id';
        const token = jwt.sign('{"sub":"test-user-id"}','secret-key')
        const req = getMockReq({ headers: { 'authorization': token },body:{'meta':'{"tdei_org_id":"sample-org"}'} })
        const { res, next } = getMockRes()
        mockCoreAuth(false);
        await tokenValidator(req, res, next)
        expect(next).toBeCalledWith(expect.any(UnAuthenticated))

    })
})