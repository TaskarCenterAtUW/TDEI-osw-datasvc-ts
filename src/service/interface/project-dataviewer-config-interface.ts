export interface IProjectDataviewerConfig {
    dataset_viewer_allowed: boolean;
    feedback_turnaround_time: {
        number: number;
        units: string;
    };
}