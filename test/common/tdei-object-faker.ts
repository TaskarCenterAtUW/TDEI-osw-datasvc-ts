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
            uploaded_by: "test"
        } as DatasetEntity;
    }

    static getMetadataSample() {
        return {
            tdei_dataset_id: "tdei_dataset_id",
            name: "test",
            version: "v1",
            collected_by: "test",
            collection_date: new Date(),
            collection_method: "manual",
            valid_from: new Date(),
            valid_to: new Date(),
            data_source: "InHouse",
            schema_version: "v0.1"
        } as MetadataEntity;
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
            osw_schema_version: "v0.2"
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
