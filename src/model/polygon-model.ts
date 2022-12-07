export interface Polygon {
    type: string
    features: Feature[]
}

export interface Feature {
    type: string
    properties: OswProperties
    geometry: Geometry
}

export interface OswProperties { }

export interface Geometry {
    type: string
    coordinates: number[][][]
}