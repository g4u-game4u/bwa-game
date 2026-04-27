import * as fc from 'fast-check';
import { resolveGoalsTarget, resolveGoalsColor } from './goals-target-resolution.util';

/**
 * Feature: kpi-bars-revision, Property 6: Goals target resolution with correct fallback
 *
 * For any set of goal log rows where the most recent row has current_goal_value > 0,
 * the resolved targetBilling SHALL equal that current_goal_value and SHALL NOT be
 * overridden by the financeiro_monthly_billing_goal system parameter.
 * For any scenario where the goals backend returns null or a target of zero,
 * the targetBilling SHALL equal the financeiro_monthly_billing_goal system parameter value.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */
describe('Property 6: Goals target resolution with correct fallback', () => {

  // Generator for goalsKpi: null, zero target, or positive target
  const goalsKpiArb = fc.oneof(
    // null — goals backend returned nothing
    fc.constant(null),
    // zero target
    fc.constant({ target: 0 }),
    // negative target
    fc.integer({ min: -1_000_000, max: -1 }).map(t => ({ target: t })),
    // positive target
    fc.integer({ min: 1, max: 100_000_000 }).map(t => ({ target: t }))
  );

  // Generator for paramTarget (system param value, always >= 0)
  const paramTargetArb = fc.integer({ min: 0, max: 100_000_000 });

  it('targetBilling equals goalsKpi.target when > 0, else equals paramTarget (100+ iterations)', () => {
    fc.assert(
      fc.property(goalsKpiArb, paramTargetArb, (goalsKpi, paramTarget) => {
        const result = resolveGoalsTarget(goalsKpi, paramTarget);

        if (goalsKpi != null && goalsKpi.target > 0) {
          // Goals backend target takes priority — must NOT be overridden by paramTarget
          expect(result).toBe(goalsKpi.target);
        } else {
          // Fallback to system param
          expect(result).toBe(paramTarget);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('when goalsKpi.target > 0, result is never equal to paramTarget (unless they happen to match)', () => {
    // Specifically test that paramTarget does NOT override a valid goals target
    const positiveGoalsKpiArb = fc.integer({ min: 1, max: 100_000_000 }).map(t => ({ target: t }));
    const differentParamArb = fc.integer({ min: 0, max: 100_000_000 });

    fc.assert(
      fc.property(positiveGoalsKpiArb, differentParamArb, (goalsKpi, paramTarget) => {
        const result = resolveGoalsTarget(goalsKpi, paramTarget);
        // Result must always be the goals target, regardless of paramTarget
        expect(result).toBe(goalsKpi.target);
      }),
      { numRuns: 100 }
    );
  });

  it('when goalsKpi is null, result always equals paramTarget', () => {
    fc.assert(
      fc.property(paramTargetArb, (paramTarget) => {
        const result = resolveGoalsTarget(null, paramTarget);
        expect(result).toBe(paramTarget);
      }),
      { numRuns: 100 }
    );
  });

  it('when both goalsKpi target and paramTarget are 0, color is always red', () => {
    const currentArb = fc.integer({ min: 0, max: 10_000_000 });
    const mockGetColor = (c: number, t: number, s: number): 'red' | 'yellow' | 'green' => {
      if (c >= s) return 'green';
      if (c >= t) return 'yellow';
      return 'red';
    };

    fc.assert(
      fc.property(currentArb, (current) => {
        const targetBilling = resolveGoalsTarget({ target: 0 }, 0);
        const superTarget = targetBilling > 0 ? Math.ceil(targetBilling * 1.5) : undefined;
        const color = resolveGoalsColor(current, targetBilling, superTarget, mockGetColor);
        expect(color).toBe('red');
      }),
      { numRuns: 100 }
    );
  });
});
