export interface ColumnProfile {
  name: string;
  inferredType: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  nullCount: number;
  emptyCount: number;
  uniqueCount: number;
  sampleValues: string[];
}

export interface CSVSummary {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  parseErrors: string[];
}
