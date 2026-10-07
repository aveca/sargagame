import { calculateUtil } from '../../utils/calculateUtil.js';
import { describe, test, expect } from 'vitest';

describe('calculateUtil', () => {
  test('calculates sum of 2 and 3 equals 5', () => {
    expect(calculateUtil(2, 3)).toBe(5);
  });

  test('calculates sum of -1 and 1 equals 0', () => {
    expect(calculateUtil(-1, 1)).toBe(0);
  });

  test('calculates sum of 0 and 0 equals 0', () => {
    expect(calculateUtil(0, 0)).toBe(0);
  });
});