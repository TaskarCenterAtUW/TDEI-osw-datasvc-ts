import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { IsNotEmpty } from 'class-validator';
import { Polygon } from "../../model/polygon-model";

@Entity()
export class OswVersions {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    @IsNotEmpty()
    tdei_record_id: string = "";

    @Column({ nullable: true, default: 0 })
    confidence_level: number = 0;

    @Column()
    @IsNotEmpty()
    tdei_org_id: string = "";

    @Column()
    @IsNotEmpty()
    tdei_service_id: string = "";

    @Column()
    @IsNotEmpty()
    file_upload_path: string = "";

    @Column()
    @IsNotEmpty()
    uploaded_by: string = "";

    @Column()
    @IsNotEmpty()
    collected_by: string = "";

    @Column("timestamp")
    @IsNotEmpty()
    collection_date: Date = new Date();

    @Column()
    @IsNotEmpty()
    collection_method: string = "";

    @Column("timestamp")
    @IsNotEmpty()
    valid_from: Date = new Date();

    @Column("timestamp")
    @IsNotEmpty()
    valid_to: Date = new Date();

    @Column()
    @IsNotEmpty()
    data_source: string = "";

    @Column()
    @IsNotEmpty()
    osw_schema_version: string = "";

    @Column("json")
    polygon!: Polygon;
}