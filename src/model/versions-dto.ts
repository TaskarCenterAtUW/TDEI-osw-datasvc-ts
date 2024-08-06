import { Prop } from "nodets-ms-core/lib/models"

export class Versions {
    @Prop()
    versions!: Version[]

    constructor(init?: Version[]) {
        if (init) {
            this.versions = init;
        }
    }
}

export class Version {
    @Prop()
    version!: string
    @Prop()
    documentation!: string
    @Prop()
    specification!: string
}