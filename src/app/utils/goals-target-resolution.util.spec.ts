import { resolveGoalsTarget, resolveGoalsColor } from './goals-target-resolution.util';

/**
 * Unit tests for goals meta fix — target resolution logic.
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
describe('Goals Target Resolution', () => {

  describe('resolveGoalsTarget', () => {

    it('should use goalsKpi.target when it is positive', () => {
      const goalsKpi = { target: 500_000 };
      const paramTarget = 300_000;
      expect(resolveGoalsTarget(goalsKpi, paramTarget)).toBe(500_000);
    });

    it('should NOT override goalsKpi.target with paramTarget when goalsKpi.target > 0', () => {
      // This is the core bug fix: paramTarget must not override a valid goals target
      const goalsKpi = { target: 750_000 };
      const paramTarget = 1_000_000;
      const result = resolveGoalsTarget(goalsKpi, paramTarget);
      expect(result).toBe(750_000);
      expect(result).not.toBe(paramTarget);
    });

    it('should fall back to paramTarget when goalsKpi is null', () => {
      const paramTarget = 300_000;
      expect(resolveGoalsTarget(null, paramTarget)).toBe(300_000);
    });

    it('should fall back to paramTarget when goalsKpi is undefined', () => {
      const paramTarget = 300_000;
      expect(resolveGoalsTarget(undefined, paramTarget)).toBe(300_000);
    });

    it('should fall back to paramTarget when goalsKpi.target is 0', () => {
      const goalsKpi = { target: 0 };
      const paramTarget = 300_000;
      expect(resolveGoalsTarget(goalsKpi, paramTarget)).toBe(300_000);
    });

    it('should fall back to paramTarget when goalsKpi.target is negative', () => {
      const goalsKpi = { target: -100 };
      const paramTarget = 300_000;
      expect(resolveGoalsTarget(goalsKpi, paramTarget)).toBe(300_000);
    });

    it('should return 0 when both goalsKpi is null and paramTarget is 0', () => {
      expect(resolveGoalsTarget(null, 0)).toBe(0);
    });

    it('should return 0 when goalsKpi.target is 0 and paramTarget is 0', () => {
      const goalsKpi = { target: 0 };
      expect(resolveGoalsTarget(goalsKpi, 0)).toBe(0);
    });
  });

  describe('resolveGoalsColor', () => {

    const mockGetColor = (c: number, t: number, s: number): 'red' | 'yellow' | 'green' => {
      if (c >= s) return 'green';
      if (c >= t) return 'yellow';
      return 'red';
    };

    it('should return red when targetBilling is 0 (both sources returned 0)', () => {
      expect(resolveGoalsColor(100, 0, undefined, mockGetColor)).toBe('red');
    });

    it('should return red when targetBilling is 0 even with positive current', () => {
      expect(resolveGoalsColor(500_000, 0, undefined, mockGetColor)).toBe('red');
    });

    it('should delegate to getKPIColorByGoals when targetBilling > 0 and superTarget defined', () => {
      // current >= superTarget → green
      expect(resolveGoalsColor(800_000, 500_000, 750_000, mockGetColor)).toBe('green');
      // current >= target but < superTarget → yellow
      expect(resolveGoalsColor(600_000, 500_000, 750_000, mockGetColor)).toBe('yellow');
      // current < target → red
      expect(resolveGoalsColor(200_000, 500_000, 750_000, mockGetColor)).toBe('red');
    });

    it('should return red when superTarget is undefined even if targetBilling > 0', () => {
      expect(resolveGoalsColor(600_000, 500_000, undefined, mockGetColor)).toBe('red');
    });
  });
});
