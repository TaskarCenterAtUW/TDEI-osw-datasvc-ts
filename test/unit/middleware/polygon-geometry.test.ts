// Desc: Polygon Geometry Validator
import MultiPolygonSchema from "geojson-schema/MultiPolygon.json";
import FeatureSchema from "geojson-schema/Feature.json";
import Ajv, { ErrorObject } from "ajv";

describe('Polygon Geometry Validator', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(MultiPolygonSchema);
    
    it('Should validate a valid multipolygon', async () => {
        const validMultiPolygon = {
            "type": "MultiPolygon",
            "coordinates": [
              [
                [
                  [102.0, 2.0],
                  [103.0, 2.0],
                  [103.0, 3.0],
                  [102.0, 3.0],
                  [102.0, 2.0]
                ]
              ],
              [
                [
                  [100.0, 0.0],
                  [101.0, 0.0],
                  [101.0, 1.0],
                  [100.0, 1.0],
                  [100.0, 0.0]
                ],
                [
                  [100.2, 0.2],
                  [100.8, 0.2],
                  [100.8, 0.8],
                  [100.2, 0.8],
                  [100.2, 0.2]
                ]
              ]
            ]
          };
        const valid = validate(validMultiPolygon);
        expect(valid).toBe(true);
    });


});