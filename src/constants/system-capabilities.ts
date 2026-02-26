/**
 * System capabilities and configurable limits.
 * Exposed via GET /api/v1/system/capabilities and used by dataset upload validation.
 */

import { DataType } from "./app-constants";

const DEFAULT_UPLOAD_LIMIT_BYTES = 1_073_741_824; // 1 GiB (1024³), displays as "1 GB"

// Env keys: per-dataset then generic fallback
const ENV_KEYS: Record<DataType, string> & { default: string } = {
    [DataType.osw]: "OSW_DATASET_UPLOAD_LIMIT_SIZE_BYTES",
    [DataType.pathways]: "PATHWAYS_DATASET_UPLOAD_LIMIT_SIZE_BYTES",
    [DataType.flex]: "FLEX_DATASET_UPLOAD_LIMIT_SIZE_BYTES",
    default: "DATASET_UPLOAD_LIMIT_SIZE_BYTES",
};

function parseEnvBytes(key: string): number | undefined {
    const raw = process.env[key];
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

function getUploadLimitBytes(type: DataType): number {
    const specific = parseEnvBytes(ENV_KEYS[type]);
    if (specific != null) return specific;
    const generic = parseEnvBytes(ENV_KEYS.default);
    return generic ?? DEFAULT_UPLOAD_LIMIT_BYTES;
}

// Binary units (1024 KB = 1 MB) for validation and display so "1 MB limit" = 1,048,576 bytes
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const KB = 1024;

function formatBytesForDisplay(bytes: number): string {
    if (bytes >= GB) {
        const gb = bytes / GB;
        return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
    }
    if (bytes >= MB) {
        const mb = bytes / MB;
        return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`;
    }
    if (bytes >= KB) {
        const kb = bytes / KB;
        return `${kb % 1 === 0 ? kb : kb.toFixed(1)} KB`;
    }
    return `${bytes} bytes`;
}

const limitsCache: Record<DataType, number> = {
    [DataType.osw]: 0,
    [DataType.pathways]: 0,
    [DataType.flex]: 0,
};

function ensureLimits(): void {
    if (limitsCache[DataType.osw] > 0) return;
    limitsCache[DataType.osw] = getUploadLimitBytes(DataType.osw);
    limitsCache[DataType.pathways] = getUploadLimitBytes(DataType.pathways);
    limitsCache[DataType.flex] = getUploadLimitBytes(DataType.flex);
}

/**
 * Returns the maximum upload size in bytes for the given dataset type.
 */
export function getDatasetUploadLimitBytes(type: DataType): number {
    ensureLimits();
    return limitsCache[type];
}

/**
 * Returns the user-facing error message when upload exceeds the limit for the given type.
 */
export function getDatasetUploadLimitErrorMessage(type: DataType): string {
    const limitBytes = getDatasetUploadLimitBytes(type);
    const display = formatBytesForDisplay(limitBytes);
    return `The total size of dataset zip files exceeds ${display} upload limit.`;
}

export interface DatasetUploadLimitEntry {
    limit_bytes: number;
    limit_display: string;
}

export interface SystemCapabilitiesResponse {
    dataset_upload_limits: {
        osw: DatasetUploadLimitEntry;
        pathways: DatasetUploadLimitEntry;
        flex: DatasetUploadLimitEntry;
    };
}

/**
 * Returns current system capabilities for the GET /api/v1/system/capabilities API.
 * Extensible for future limits (e.g. max concurrency, feature flags).
 */
export function getSystemCapabilities(): SystemCapabilitiesResponse {
    ensureLimits();
    return {
        dataset_upload_limits: {
            [DataType.osw]: {
                limit_bytes: limitsCache[DataType.osw],
                limit_display: formatBytesForDisplay(limitsCache[DataType.osw]),
            },
            [DataType.pathways]: {
                limit_bytes: limitsCache[DataType.pathways],
                limit_display: formatBytesForDisplay(limitsCache[DataType.pathways]),
            },
            [DataType.flex]: {
                limit_bytes: limitsCache[DataType.flex],
                limit_display: formatBytesForDisplay(limitsCache[DataType.flex]),
            },
        },
    };
}
