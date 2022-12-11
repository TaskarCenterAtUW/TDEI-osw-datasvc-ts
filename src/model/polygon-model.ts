export class Polygon {
    type: string = "";
    features: Feature[] = [];
}

export class Feature {
    type: string = "";
    properties: OswProperties = new OswProperties();
    geometry: Geometry = new Geometry();
}

export class OswProperties { }

export class Geometry {
    type: string = "";
    coordinates: number[][][] = [];
}