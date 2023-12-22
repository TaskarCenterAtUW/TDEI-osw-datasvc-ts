export class ProjectGroupRoleDto {
    tdei_project_group_id!: string;
    project_group_name!: string;
    roles!: string[];

    constructor(init?: Partial<ProjectGroupRoleDto>) {
        Object.assign(this, init);
    }
}