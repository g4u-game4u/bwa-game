import * as fc from 'fast-check';
import { getPointsForProfile, getCoinsForProfile } from '@utils/points-field-selector';
import { UserProfile } from '@utils/user-profile';

// Feature: acl-dashboard-refactor, Property 8: SUPERVISOR points come from pontos_supervisor field
// **Validates: Requirements 10.1, 10.4, 16.1**

/**
 * All UserProfile values for generation.
 */
const allProfiles = Object.values(UserProfile) as UserProfile[];

/**
 * Non-SUPERVISOR profiles.
 */
const nonSupervisorProfiles = allProfiles.filter(p => p !== UserProfile.SUPERVISOR);

/**
 * Generates a finite, non-NaN number suitable for point values.
 */
const pointValueArb = fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true });

/**
 * Generates a point categories object with both `pontos_supervisor` and `points` fields
 * set to distinct values, plus a `coins` field.
 */
const pointCategoriesArb = fc.tuple(pointValueArb, pointValueArb, pointValueArb)
  .filter(([pontosSup, points]) => pontosSup !== points) // ensure they differ so we can distinguish
  .map(([pontosSup, points, coins]) => ({
    pontos_supervisor: pontosSup,
    points: points,
    coins: coins,
  }));

describe('Property 8: SUPERVISOR points come from pontos_supervisor field', () => {
  // Feature: acl-dashboard-refactor, Property 8: SUPERVISOR points come from pontos_supervisor field
  // **Validates: Requirements 10.1, 10.4, 16.1**

  it('SUPERVISOR reads pontos_supervisor, not points', () => {
    fc.assert(
      fc.property(pointCategoriesArb, (pc) => {
        const result = getPointsForProfile(UserProfile.SUPERVISOR, pc);
        const expected = Number(pc.pontos_supervisor) || 0;
        expect(result).toBe(expected);
      }),
      { numRuns: 200 }
    );
  });

  it('non-SUPERVISOR profiles read points, not pontos_supervisor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonSupervisorProfiles),
        pointCategoriesArb,
        (profile, pc) => {
          const result = getPointsForProfile(profile, pc);
          const expected = Number(pc.points) || 0;
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('SUPERVISOR result differs from points field when values are distinct', () => {
    fc.assert(
      fc.property(
        fc.tuple(pointValueArb, pointValueArb)
          .filter(([a, b]) => a > 0 && b > 0 && a !== b),
        ([pontosSup, points]) => {
          const pc = { pontos_supervisor: pontosSup, points };
          const result = getPointsForProfile(UserProfile.SUPERVISOR, pc);
          // SUPERVISOR should read pontos_supervisor, which differs from points
          expect(result).toBe(pontosSup);
          expect(result).not.toBe(points);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('coins are always read from coins field regardless of profile', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allProfiles),
        pointCategoriesArb,
        (profile, pc) => {
          const result = getCoinsForProfile(profile, pc);
          const expected = Number(pc.coins) || 0;
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('missing pontos_supervisor returns 0 for SUPERVISOR', () => {
    const pc = { points: 500 };
    const result = getPointsForProfile(UserProfile.SUPERVISOR, pc);
    expect(result).toBe(0);
  });

  it('missing points returns 0 for non-SUPERVISOR profiles', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonSupervisorProfiles),
        (profile) => {
          const pc = { pontos_supervisor: 999 };
          const result = getPointsForProfile(profile, pc);
          expect(result).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
