import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";


export class Polygon extends AbstractDomainEntity {
    @Prop()
    type: string = "Polygon";
    @Prop()
    coordinates: Array<Array<number[]>> = [];

    constructor(init?: Partial<Polygon>) {
        super();
        Object.assign(this, init);
    }
}``

export class PolygonDto extends AbstractDomainEntity {
    @Prop()
    coordinates: Array<Array<number[]>> = [];

    constructor(init?: Partial<PolygonDto>) {
        super();
        Object.assign(this, init);
    }
}