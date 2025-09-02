export interface HeatmapDatum {
  x: number;
  y: number;
  v: number;
}

// Guard against empty datasets to avoid reduce throwing on an empty array
export function calculateMaxValue(data: HeatmapDatum[]): number {
  return data.length > 0 ? data.reduce((m, d) => Math.max(m, d.v), 0) : 0;
}
