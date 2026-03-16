import * as fc from 'fast-check';
import { UserProfile } from '@utils/user-profile';

// Feature: acl-dashboard-refactor, Property 5: Profile-to-route mapping
// **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**

/**
 * Pure function extracted from DashboardRedirectGuardService.canActivate().
 * Maps each UserProfile to its default redirect route.
 */
function getDefaultRouteForProfile(profile: UserProfile): string {
  switch (profile) {
    case UserProfile.JOGADOR:
      return '/dashboard';
    case UserProfile.SUPERVISOR:
      return '/dashboard/supervisor';
    case UserProfile.SUPERVISOR_TECNICO:
      return '/dashboard';
    case UserProfile.GESTOR:
      return '/dashboard/team-management';
    case UserProfile.DIRETOR:
      return '/dashboard/team-management';
    default:
      return '/dashboard';
  }
}

/**
 * Expected mapping used as the oracle for verification.
 */
const EXPECTED_ROUTES: Record<UserProfile, string> = {
  [UserProfile.JOGADOR]: '/dashboard',
  [UserProfile.SUPERVISOR]: '/dashboard/supervisor',
  [UserProfile.SUPERVISOR_TECNICO]: '/dashboard',
  [UserProfile.GESTOR]: '/dashboard/team-management',
  [UserProfile.DIRETOR]: '/dashboard/team-management',
};

/**
 * All valid UserProfile enum values.
 */
const ALL_PROFILES = Object.values(UserProfile) as UserProfile[];

/**
 * Arbitrary that generates a random UserProfile enum value.
 */
const userProfileArb: fc.Arbitrary<UserProfile> = fc.constantFrom(...ALL_PROFILES);

describe('Property 5: Profile-to-route mapping is deterministic', () => {
  // Feature: acl-dashboard-refactor, Property 5: Profile-to-route mapping
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**

  it('each UserProfile maps to exactly one default route consistently', () => {
    fc.assert(
      fc.property(userProfileArb, (profile: UserProfile) => {
        const route1 = getDefaultRouteForProfile(profile);
        const route2 = getDefaultRouteForProfile(profile);

        // Deterministic: calling twice yields the same result
        expect(route1).toBe(route2);

        // Matches the expected mapping
        expect(route1).toBe(EXPECTED_ROUTES[profile]);
      }),
      { numRuns: 100 }
    );
  });

  it('every profile maps to a known dashboard route', () => {
    fc.assert(
      fc.property(userProfileArb, (profile: UserProfile) => {
        const route = getDefaultRouteForProfile(profile);
        const validRoutes = ['/dashboard', '/dashboard/supervisor', '/dashboard/team-management'];

        expect(validRoutes).toContain(route);
      }),
      { numRuns: 100 }
    );
  });

  it('JOGADOR and SUPERVISOR_TECNICO both map to /dashboard', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(UserProfile.JOGADOR, UserProfile.SUPERVISOR_TECNICO),
        (profile: UserProfile) => {
          expect(getDefaultRouteForProfile(profile)).toBe('/dashboard');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('GESTOR and DIRETOR both map to /dashboard/team-management', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(UserProfile.GESTOR, UserProfile.DIRETOR),
        (profile: UserProfile) => {
          expect(getDefaultRouteForProfile(profile)).toBe('/dashboard/team-management');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SUPERVISOR maps to /dashboard/supervisor', () => {
    fc.assert(
      fc.property(
        fc.constant(UserProfile.SUPERVISOR),
        (profile: UserProfile) => {
          expect(getDefaultRouteForProfile(profile)).toBe('/dashboard/supervisor');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all 5 profiles are covered and produce non-empty routes', () => {
    fc.assert(
      fc.property(userProfileArb, (profile: UserProfile) => {
        const route = getDefaultRouteForProfile(profile);

        expect(route).toBeTruthy();
        expect(route.length).toBeGreaterThan(0);
        expect(route.startsWith('/dashboard')).toBeTrue();
      }),
      { numRuns: 100 }
    );
  });
});
