import type { Severity } from './types';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const MAX_SAMPLE_ROWS = 10;

export const SEVERITY_WEIGHTS = {
  alto: 20,
  medio: 10,
  bajo: 5,
} as const satisfies Record<Severity, number>;

export const ALLOWED_EXTENSIONS = ['.csv'] as const;

export const MAX_COLUMN_NAME_LENGTH = 128;

export const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB
