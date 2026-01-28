import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as fc from 'fast-check';
import { C4uGoalsProgressTabComponent, GoalMetric } from './c4u-goals-progress-tab.component';

/**
 * Property-Based Tests for Goals Progress Tab Component
 * 
 * These tests verify universal properties that should hold for all possible inputs,
 * using fast-check to generate random test cases.
 */
describe('C4uGoalsProgressTabComponent Property-Based Tests', () => {
  let component: C4uGoalsProgressTabComponent;
  let fixture: ComponentFixture<C4uGoalsProgressTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uGoalsProgressTabComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uGoalsProgressTabComponent);
    component = fixture.componentInstance;
  });

  /**
   * Property 9: Progress Metric Calculation
   * 
   * **Validates: Requirements 5.2, 5.3**
   * 
   * For any goal metric with valid current and target values:
   * 1. If target is 0, percentage should be 0
   * 2. If target > 0, percentage should be (current / target) * 100, rounded
   * 3. Percentage should never be negative
   * 4. Percentage calculation should be consistent and deterministic
   * 5. For current = target, percentage should be 100
   * 6. For current = 0, percentage should be 0
   * 7. For current > target, percentage should be > 100
   */
  describe('Property 9: Progress Metric Calculation', () => {
    it('should return 0 percentage when target is 0', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          (id, label, current) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target: 0
            };

            const percentage = component.calculatePercentage(goal);

            expect(percentage).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct percentage when target > 0', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 1, max: 10000 }), // target (must be > 0)
          (id, label, current, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage = component.calculatePercentage(goal);
            const expectedPercentage = Math.round((current / target) * 100);

            expect(percentage).toBe(expectedPercentage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return negative percentage', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current (non-negative)
          fc.integer({ min: 0, max: 10000 }), // target (non-negative)
          (id, label, current, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage = component.calculatePercentage(goal);

            expect(percentage).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be deterministic - same input produces same output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 0, max: 10000 }), // target
          (id, label, current, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage1 = component.calculatePercentage(goal);
            const percentage2 = component.calculatePercentage(goal);

            expect(percentage1).toBe(percentage2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 100% when current equals target', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 1, max: 10000 }), // value (used for both current and target)
          (id, label, value) => {
            const goal: GoalMetric = {
              id,
              label,
              current: value,
              target: value
            };

            const percentage = component.calculatePercentage(goal);

            expect(percentage).toBe(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0% when current is 0 and target > 0', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 1, max: 10000 }), // target (must be > 0)
          (id, label, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current: 0,
              target
            };

            const percentage = component.calculatePercentage(goal);

            expect(percentage).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return >= 100% when current exceeds target (accounting for rounding)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 1, max: 5000 }), // target
          fc.integer({ min: 1, max: 5000 }), // excess amount
          (id, label, target, excess) => {
            const current = target + excess;
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage = component.calculatePercentage(goal);

            // When current > target, percentage should be >= 100
            // Due to rounding, small excesses might round to exactly 100
            // For example: 201/200 * 100 = 100.5 rounds to 100
            expect(percentage).toBeGreaterThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case of very large numbers', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 1000000, max: 10000000 }), // large current
          fc.integer({ min: 1000000, max: 10000000 }), // large target
          (id, label, current, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage = component.calculatePercentage(goal);
            const expectedPercentage = Math.round((current / target) * 100);

            expect(percentage).toBe(expectedPercentage);
            expect(Number.isFinite(percentage)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain mathematical relationship: percentage = (current/target) * 100', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 1, max: 10000 }), // target (must be > 0)
          (id, label, current, target) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const percentage = component.calculatePercentage(goal);
            const manualCalculation = Math.round((current / target) * 100);

            // The percentage should match the manual calculation
            expect(percentage).toBe(manualCalculation);

            // Verify the mathematical relationship holds
            const ratio = current / target;
            const percentageFromRatio = Math.round(ratio * 100);
            expect(percentage).toBe(percentageFromRatio);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Goal text formatting consistency
   * 
   * Verifies that goal text is always formatted consistently
   */
  describe('Goal Text Formatting Property', () => {
    it('should format goal text consistently', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 0, max: 10000 }), // target
          fc.option(fc.string({ minLength: 1, maxLength: 5 }), { nil: undefined }), // unit
          (id, label, current, target, unit) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target,
              unit
            };

            const text = component.getGoalText(goal);
            const expectedUnit = unit || '';
            const expectedText = `${current}${expectedUnit} / ${target}${expectedUnit}`;

            expect(text).toBe(expectedText);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Track by function consistency
   * 
   * Verifies that trackBy function always returns the goal ID
   */
  describe('Track By Function Property', () => {
    it('should always return goal ID for tracking', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // id
          fc.string({ minLength: 1 }), // label
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 0, max: 10000 }), // target
          fc.integer({ min: 0, max: 100 }), // index
          (id, label, current, target, index) => {
            const goal: GoalMetric = {
              id,
              label,
              current,
              target
            };

            const trackByResult = component.trackByGoalId(index, goal);

            expect(trackByResult).toBe(id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
