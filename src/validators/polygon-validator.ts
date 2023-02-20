import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from 'class-validator';
import { Polygon, PolygonDto } from '../model/polygon-model';
const gjv = require("geojson-validation");

@ValidatorConstraint({ async: true })
export class isPolygon implements ValidatorConstraintInterface {
    message = "Not a valid polygon coordinates.";
    validate(polygonDto: PolygonDto, args: ValidationArguments) {
        let polygon = new Polygon({ coordinates: polygonDto.coordinates });
        let valid = gjv.isPolygon(polygon);
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
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: isPolygon,
        });
    };
}