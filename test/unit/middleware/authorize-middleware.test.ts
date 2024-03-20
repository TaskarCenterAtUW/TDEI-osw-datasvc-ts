import { getMockReq, getMockRes } from "@jest-mock/express"
import { UnAuthenticated } from "../../../src/exceptions/http/http-exceptions"
import { mockCoreAuth } from "../../common/mock-utils";
import { authorize } from "../../../src/middleware/authorize-middleware";
import tdeiCoreService from "../../../src/service/tdei-core-service";

jest.mock('../../../src/service/osw-service');
describe('Authorize Middleware', () => {

    beforeEach(() => {
    });

    it('should call next() if user_id is missing', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        await authorize(['approvedRole1', 'approvedRole2'])(req, res, next);
        expect(next).toBeCalledWith(expect.any(UnAuthenticated));
    });

    it('should set tdei_project_group_id from tdei_record_id', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.body.user_id = 'someUserId';
        req.params.tdei_project_group_id = 'someProjectGroupId';

        const mockedOSW: any = { tdei_project_group_id: 'someProjectGroupId' };

        jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(mockedOSW);
        mockCoreAuth(true);

        await authorize(['approvedRole1', 'approvedRole2'])(req, res, next);

        expect(req.body.tdei_project_group_id).toEqual(mockedOSW.tdei_project_group_id);
        expect(next).toHaveBeenCalledWith();
    });

    it('should set tdei_project_group_id from params if tdei_record_id is missing', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.body.user_id = 'someUserId';
        req.params.tdei_project_group_id = 'someProjectGroupId';

        const mockedOSW: any = { tdei_project_group_id: 'someProjectGroupId' };
        jest.spyOn(tdeiCoreService, "getDatasetDetailsById").mockResolvedValueOnce(mockedOSW);

        mockCoreAuth(true);

        await authorize(['approvedRole1', 'approvedRole2'])(req, res, next);

        expect(req.body.tdei_project_group_id).toEqual(req.params.tdei_project_group_id);
        expect(next).toHaveBeenCalledWith();
    });

    it('should call next() with UnAuthenticated error if roles are not approved', async () => {
        const req = getMockReq()
        const { res, next } = getMockRes();
        req.body.user_id = 'someUserId';
        req.params.tdei_project_group_id = 'someProjectGroupId';

        mockCoreAuth(false);

        await authorize(['approvedRole1', 'approvedRole2'])(req, res, next);

        expect(next).toHaveBeenCalledWith(new UnAuthenticated());
    });

    // Add more test cases as needed

});