import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';
import { FeatureCollection } from 'geojson';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gjv = require("geojson-validation");

function isGeoJsonFeatureCollection(obj: any): boolean {
    return 'type' in obj && 'features' in obj;
}

@ValidatorConstraint({ async: true })
export class isPolygon implements ValidatorConstraintInterface {
    message = ["Not a valid polygon coordinates."];
    validate(featureCollection: FeatureCollection) {
        if (!isGeoJsonFeatureCollection(featureCollection)) {
            this.message = ["Please specify valid geojson."];
            return false;
        }
        else if (featureCollection.features.length > 1) {
            this.message = ["Please specify only one polygon geometry feature."];
            return false;
        }
        else if (featureCollection.features.length < 1) {
            this.message = ["Please specify polygon geometry feature."];
            return false;
        }
        else if (featureCollection.features[0].geometry.type != "Polygon") {
            this.message = ["Please specify polygon geometry feature."];
            return false;
        }

        const polygon = featureCollection.features[0].geometry;
        const valid = gjv.isPolygon(polygon);
        if (!valid) {
            this.message = gjv.isPolygon(polygon, true);
        }
        return valid;
    }

    defaultMessage() {
        return this.message[0].replace("at 0: ", "");
    }
}

export function IsValidPolygon(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: (object as any).constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: isPolygon,
        });
    };
}