import { describe, expect, it } from 'vitest';
import { calculateMaxValue, HeatmapDatum } from './heatmapUtils';

describe('calculateMaxValue', () => {
  it('returns 0 for an empty dataset', () => {
    expect(calculateMaxValue([])).toBe(0);
  });

  it('finds the highest value in the dataset', () => {
    const data: HeatmapDatum[] = [
      { x: 0, y: 0, v: 1 },
      { x: 1, y: 1, v: 3 },
    ];
    expect(calculateMaxValue(data)).toBe(3);
  });
});
