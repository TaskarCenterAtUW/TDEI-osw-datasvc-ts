import { getMockReq, getMockRes } from "@jest-mock/express"
import { metajsonValidator } from "../../../src/middleware/metadata-json-validation-middleware"
import { InputException } from "../../../src/exceptions/http/http-exceptions"

/**
 * Test cases for json validator
 */


describe('Metadata JSON Validator', () => {
    let reqData: any = {
        files: {
            metadata: [
                {
                    buffer: Buffer.from(`{
                        "name": "OSW Upload testing Dev- Issue",
                        "version": "v1.8",
                        "description": "Bootstrap",
                        "custom_metadata": {
                            "name": "Lara",
                            "gender": "female"
                        },
                        "collected_by": "See best practices document",
                        "collection_date": "2019-02-10T09:30Z",
                        "collection_method": "manual",
                        "data_source": "3rdParty",
                        "schema_version": "v0.2",
                        "dataset_area" : {
                            "type": "FeatureCollection",
                            "features": [
                              {
                                "type": "Feature",
                                "properties": {},
                                "geometry": {
                                  "coordinates": [
                                    [
                                      [
                                        77.5880749566162,
                                        12.974950278991258
                                      ],
                                      [
                                        77.58823422871711,
                                        12.970666567100878
                                      ],
                                      [
                                        77.59399987874258,
                                        12.97240489386435
                                      ],
                                      [
                                        77.59374504338194,
                                        12.97526069002987
                                      ],
                                      [
                                        77.5880749566162,
                                        12.974950278991258
                                      ]
                                    ]
                                  ],
                                  "type": "Polygon"
                                }
                              }
                            ]
                          }
                    }
                    `), // Example JSON data
                },
            ],
        },
    };

    it('should call next() if metadata file is present and valid JSON', async () => {
        const req = getMockReq({ body: reqData });
        const { res, next } = getMockRes();
        await metajsonValidator(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('should throw InputException if metadata file is missing', async () => {
        // let localObj = { ...reqData };
        const req = getMockReq({ body: {} });
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