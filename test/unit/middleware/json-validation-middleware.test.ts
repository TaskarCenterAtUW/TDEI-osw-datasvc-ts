import { getMockReq, getMockRes } from "@jest-mock/express"
import { metajsonValidator } from "../../../src/middleware/metadata-json-validation-middleware"
import { InputException } from "../../../src/exceptions/http/http-exceptions"

/**
 * Test cases for json validator
 */


describe('Metadata JSON Validator', () => {
    let reqDataUpload: any = {
        files: {
            metadata: [
                {
                    buffer: Buffer.from(`{
                      "data_provenance": {
                          "full_dataset_name": "tested",
                          "other_published_locations": "Goa",
                          "dataset_update_frequency_months": 2,
                          "schema_validation_run": true,
                          "schema_validation_run_description": "automated",
                          "allow_crowd_contributions": true,
                          "location_inaccuracy_factors": "0.3"
                      },
                      "dataset_detail": {
                          "name": "test-flex",
                          "description": "test2",
                          "version": "2",
                          "custom_metadata": null,
                          "collected_by": "mahesh",
                          "collection_date": "2023-01-01T00:00:00",
                          "valid_from": "2024-02-28T17:09:39.767191",
                          "valid_to": null,
                          "collection_method": "manual",
                          "data_source": "3rdParty",
                          "dataset_area": {
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
                          },
                          "schema_version": "v2.0"
                      },
                      "dataset_summary": {
                          "collection_name": "tacoma",
                          "department_name": "dot",
                          "city": "seattle",
                          "region": "north",
                          "county": "usa",
                          "key_limitations": "inaccurate",
                          "release_notes": "First release",
                          "challenges": null
                      },
                      "maintenance": {
                          "official_maintainer": [
                              "mahesh",
                              "naresh"
                          ],
                          "last_updated": null,
                          "update_frequency": "weekly",
                          "authorization_chain": null,
                          "maintenance_funded": true,
                          "funding_details": "BOA"
                      },
                      "methodology": {
                          "point_data_collection_device": "mobile",
                          "node_locations_and_attributes_editing_software": "global",
                          "data_collected_by_people": false,
                          "data_collectors": null,
                          "data_captured_automatically": true,
                          "automated_collection": "NA",
                          "data_collectors_organization": "transit",
                          "data_collector_compensation": "commision",
                          "preprocessing_location": "washington",
                          "preprocessing_by": "govt",
                          "preprocessing_steps": "automated",
                          "data_collection_preprocessing_documentation": true,
                          "documentation_uri": "http://google.com",
                          "validation_process_exists": true,
                          "validation_process_description": "walking",
                          "validation_conducted_by": "volantary",
                          "excluded_data": null,
                          "excluded_data_reason": "not satisfied"
                      }
                  }
                    `), // Example JSON data
                },
            ],
        },
    };

    let reqDataEdit: any = {
        file:
        {
            buffer: Buffer.from(`{
                      "data_provenance": {
                          "full_dataset_name": "tested",
                          "other_published_locations": "Goa",
                          "dataset_update_frequency_months": 2,
                          "schema_validation_run": true,
                          "schema_validation_run_description": "automated",
                          "allow_crowd_contributions": true,
                          "location_inaccuracy_factors": "0.3"
                      },
                      "dataset_detail": {
                          "name": "test-flex",
                          "description": "test2",
                          "version": "2.0",
                          "custom_metadata": null,
                          "collected_by": "mahesh",
                          "collection_date": "2023-01-01T00:00:00",
                          "valid_from": "2024-02-28T17:09:39.767191",
                          "valid_to": null,
                          "collection_method": "manual",
                          "data_source": "3rdParty",
                          "dataset_area": {
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
                          },
                          "schema_version": "v2.0"
                      },
                      "dataset_summary": {
                          "collection_name": "tacoma",
                          "department_name": "dot",
                          "city": "seattle",
                          "region": "north",
                          "county": "usa",
                          "key_limitations": "inaccurate",
                          "release_notes": "First release",
                          "challenges": null
                      },
                      "maintenance": {
                          "official_maintainer": [
                              "mahesh",
                              "naresh"
                          ],
                          "last_updated": null,
                          "update_frequency": "weekly",
                          "authorization_chain": null,
                          "maintenance_funded": true,
                          "funding_details": "BOA"
                      },
                      "methodology": {
                          "point_data_collection_device": "mobile",
                          "node_locations_and_attributes_editing_software": "global",
                          "data_collected_by_people": false,
                          "data_collectors": null,
                          "data_captured_automatically": true,
                          "automated_collection": "NA",
                          "data_collectors_organization": "transit",
                          "data_collector_compensation": "commision",
                          "preprocessing_location": "washington",
                          "preprocessing_by": "govt",
                          "preprocessing_steps": "automated",
                          "data_collection_preprocessing_documentation": true,
                          "documentation_uri": "http://google.com",
                          "validation_process_exists": true,
                          "validation_process_description": "walking",
                          "validation_conducted_by": "volantary",
                          "excluded_data": null,
                          "excluded_data_reason": "not satisfied"
                      }
                  }
                    `), // Example JSON data
        }
    };

    it('Edit metadata request : should call next() if metadata file is present and valid JSON', async () => {
        const req = getMockReq({ body: reqDataEdit });
        const { res, next } = getMockRes();
        await metajsonValidator("edit_metadata")(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('Upload metadat : should call next() if metadata file is present and valid JSON', async () => {
        const req = getMockReq({ body: reqDataUpload });
        const { res, next } = getMockRes();
        await metajsonValidator("dataset_upload")(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });


    it('should throw InputException if metadata file is missing', async () => {
        // let localObj = { ...reqData };
        const req = getMockReq({ body: {} });
        const { res, next } = getMockRes();

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should throw InputException if metadata file contains invalid JSON', async () => {
        let localObj = { ...reqDataUpload };
        localObj.files.metadata[0].buffer = Buffer.from('invalid-json');
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should handle general errors by throwing InputException with a default message', async () => {
        const req = getMockReq();
        const { res, next } = getMockRes();

        jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
            throw new Error('Some unexpected error');
        });

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should throw InputException if metadata file contains invalid version v2', async () => {
        let localObj = { ...reqDataUpload };
        localObj.files.metadata[0].buffer = Buffer.from(`{
                      "dataset_detail": {
                          "name": "test-flex",
                          "version": "v2",
                          "collected_by": "mahesh",
                          "collection_date": "2023-01-01T00:00:00",
                          "valid_from": "2024-02-28T17:09:39.767191",
                          "valid_to": null,
                          "collection_method": "manual",
                          "data_source": "3rdParty",
                          "schema_version": "v2.0"
                      }
                  }`);
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should throw InputException if metadata file contains invalid version interger 2', async () => {
        let localObj = { ...reqDataUpload };
        localObj.files.metadata[0].buffer = Buffer.from(`{
                      "dataset_detail": {
                          "name": "test-flex",
                          "version": 2,
                          "collected_by": "mahesh",
                          "collection_date": "2023-01-01T00:00:00",
                          "valid_from": "2024-02-28T17:09:39.767191",
                          "valid_to": null,
                          "collection_method": "manual",
                          "data_source": "3rdParty",
                          "schema_version": "v2.0"
                      }
                  }`);
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });

    it('should throw InputException if metadata file contains invalid version  2.0.0', async () => {
        let localObj = { ...reqDataUpload };
        localObj.files.metadata[0].buffer = Buffer.from(`{
                      "dataset_detail": {
                          "name": "test-flex",
                          "version": "2.0.0",
                          "collected_by": "mahesh",
                          "collection_date": "2023-01-01T00:00:00",
                          "valid_from": "2024-02-28T17:09:39.767191",
                          "valid_to": null,
                          "collection_method": "manual",
                          "data_source": "3rdParty",
                          "schema_version": "v2.0"
                      }
                  }`);
        const req = getMockReq({ body: localObj });
        const { res, next } = getMockRes();

        await metajsonValidator("dataset_upload")(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(InputException));
    });
});