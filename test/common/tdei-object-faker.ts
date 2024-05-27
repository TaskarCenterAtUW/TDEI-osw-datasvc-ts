import { FeatureCollection } from "geojson";
import { Readable } from "stream";
import { DatasetEntity } from "../../src/database/entity/dataset-entity";
import { MetadataEntity } from "../../src/database/entity/metadata-entity";

export class TdeiObjectFaker {
    static getDatasetVersion() {
        return {
            tdei_dataset_id: "tdei_dataset_id",
            confidence_level: 0,
            tdei_service_id: "test_user",
            dataset_url: "test_path",
            uploaded_by: "test",
            metadata_json: this.getMetadataSample(),
        } as DatasetEntity;
    }

    static getMetadataSample() {
        return {
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
                "version": "v1.0",
                "custom_metadata": null,
                "collected_by": "mahesh",
                "collection_date": "2023-01-01T00:00:00",
                "valid_from": "2024-02-28T17:09:39.767191",
                "valid_to": null,
                "collection_method": "manual",
                "data_source": "3rdParty",
                "dataset_area": JSON.stringify(this.getPolygonGeometry())
            },
            "dataset_summary": {
                "collection_name": "tacoma",
                "department_name": "dot",
                "city": "seattle",
                "region": "north",
                "county": "usa",
                "key_limitations_of_the_dataset": "inaccurate",
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
        } as any;
    }

    static getDatasetFromDB() {
        return {
            //DB polygon is stored as binary obj
            polygon: {},
            //Select query converts the binary polygon to json using spatial query
            polygon2: JSON.stringify(this.getPolygonGeometry()),
            tdei_record_id: "tdei_dataset_id",
            confidence_level: 0,
            tdei_project_group_id: "test_user",
            file_upload_path: "test_path",
            uploaded_by: "test",
            collected_by: "test",
            collection_date: new Date(),
            collection_method: "manual",
            publication_date: new Date(),
            data_source: "InHouse",
            schema_version: "v0.2"
        };
    }

    static getInvalidPolygon(): FeatureCollection {
        const randomCoordinates: number[][] = [];
        const firstRandom = [
            this.getRandomNumber(70, 79),
            this.getRandomNumber(12, 15)
        ];
        randomCoordinates.push(firstRandom);

        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [randomCoordinates]
                    }
                }
            ]
        };
    }

    static getPolygon(): FeatureCollection {
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: this.getPolygonGeometry()
                }
            ]
        };
    }

    static getPolygonGeometry(): any {
        return {
            type: "Polygon",
            coordinates: [this.getCoordinates()]
        };
    }

    private static getCoordinates(): number[][] {
        const randomCoordinates: number[][] = [];
        const firstRandom = [
            this.getRandomNumber(70, 79),
            this.getRandomNumber(12, 15)
        ];
        randomCoordinates.push(firstRandom);
        for (let i = 3; i--;) {
            randomCoordinates.push([
                this.getRandomNumber(70, 79),
                this.getRandomNumber(12, 15)
            ]);
        }
        randomCoordinates.push(firstRandom);

        return randomCoordinates;
    }

    private static getRandomNumber(min: number, max: number): number {
        const diff = max - min;
        return parseFloat((min + Math.random() * diff).toFixed(6));
    }

    static getOswPayload2() {
        return {
            "tdei_project_group_id": "e1956869-02d9-4e14-8391-6024406ced41",
            "collected_by": "testuser",
            "collection_date": "2023-03-02T04:22:42.493Z",
            "collection_method": "manual",
            "publication_date": "2023-03-02T04:22:42.493Z",
            "data_source": "TDEITools",
            "polygon": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {
                            "coordinates": [
                                [
                                    [
                                        -122.32615394375401,
                                        47.61267259760652
                                    ],
                                    [
                                        -122.32615394375401,
                                        47.60504395643625
                                    ],
                                    [
                                        -122.3155850364906,
                                        47.60504395643625
                                    ],
                                    [
                                        -122.3155850364906,
                                        47.61267259760652
                                    ],
                                    [
                                        -122.32615394375401,
                                        47.61267259760652
                                    ]
                                ]
                            ],
                            "type": "Polygon"
                        }
                    }
                ]
            },
            "schema_version": "v0.2"
        }
    }


    static getMockUploadFile() {
        return {
            originalname: 'sample.zip',
            mimetype: 'application/zip',
            path: 'sample/path/to.zip',
            buffer: Buffer.from('sample-buffer'),
            fieldname: 'file',
            filename: 'sample.zip',
            size: 100,
            stream: Readable.from(''),
            encoding: '',
            destination: ''
        };
    }

}
