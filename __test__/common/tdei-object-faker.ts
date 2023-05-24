import { FeatureCollection } from "geojson";
import { OswVersions } from "../../src/database/entity/osw-version-entity";

export class TdeiObjectFaker {
    static getOswVersion() {
        return <OswVersions>{
            polygon: this.getPolygon(),
            tdei_record_id: "test_record_id",
            confidence_level: 0,
            tdei_org_id: "test_user",
            file_upload_path: "test_path",
            uploaded_by: "test",
            collected_by: "test",
            collection_date: new Date(),
            collection_method: "manual",
            publication_date: new Date(),
            data_source: "InHouse",
            osw_schema_version: "v0.1"
        };
    }

    static getInvalidPolygon(): FeatureCollection {
        var randomCoordinates: number[][] = [];
        var firstRandom = [
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
                    geometry: {
                        type: "Polygon",
                        coordinates: [this.getCoordinates()]
                    }
                }
            ]
        };
    }

    private static getCoordinates(): number[][] {
        var randomCoordinates: number[][] = [];
        var firstRandom = [
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
        var diff = max - min;
        return parseFloat((min + Math.random() * diff).toFixed(6));
    }
}
