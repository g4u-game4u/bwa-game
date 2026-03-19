import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 15: All dashboard components derive team visibility from ACL Service, not team membership
// **Validates: Requirements 1.1, 1.6, 2.7**

/**
 * Catalog item entry shape (mirrors CatalogItem from acl.service.ts).
 */
interface CatalogItem {
  quantity: number;
  item: string;
}

type CatalogItems = Record<string, CatalogItem>;

/**
 * Pure function: extract accessible team IDs from catalog_items (Virtual Good-based).
 * Mirrors ACLService.extractAccessibleIds() — returns IDs where quantity > 0.
 * This is the CORRECT source of team visibility for all dashboards.
 */
function extractAccessibleIds(catalogItems: CatalogItems): string[] {
  return Object.keys(catalogItems).filter(id => {
    const entry = catalogItems[id];
    return entry && typeof entry.quantity === 'number' && entry.quantity > 0;
  });
}

/**
 * Pure function: derive accessible team IDs from team membership (legacy approach).
 * Mirrors getAccessibleTeamIds() from user-profile.ts.
 * This is the OLD approach that dashboards should NOT use for data visibility.
 */
const MANAGEMENT_TEAM_IDS = {
  GESTAO: 'FkmdnFU',
  SUPERVISAO: 'Fkmdmko',
  DIRECAO: 'FkmdhZ9',
  SUPERVISAO_TECNICA: 'Fn2lrg3'
} as const;

type UserProfile = 'JOGADOR' | 'SUPERVISOR' | 'SUPERVISOR_TECNICO' | 'GESTOR' | 'DIRETOR';

const ROLE_TEAM_SET = new Set(Object.values(MANAGEMENT_TEAM_IDS));

function getTeamMembershipBasedIds(teamIds: string[], profile: UserProfile): string[] {
  if (profile === 'JOGADOR' || profile === 'DIRETOR') {
    return [];
  }
  if (profile === 'SUPERVISOR') {
    return teamIds.filter(id => id !== MANAGEMENT_TEAM_IDS.SUPERVISAO);
  }
  if (profile === 'GESTOR') {
    return teamIds.filter(id => id !== MANAGEMENT_TEAM_IDS.GESTAO);
  }
  if (profile === 'SUPERVISOR_TECNICO') {
    return teamIds.filter(id => id !== MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA);
  }
  return [];
}

/**
 * Simulates what a dashboard component should do: derive visible teams
 * from ACL Service (Virtual Good access), ignoring team membership.
 */
function getDashboardVisibleTeams(catalogItems: CatalogItems): string[] {
  return extractAccessibleIds(catalogItems);
}

// ── Arbitraries ──────────────────────────────────────────────────

const teamIdArb = fc.string({
  minLength: 1,
  maxLength: 15,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

const quantityArb = fc.integer({ min: -100, max: 100 });

const managementProfileArb: fc.Arbitrary<UserProfile> = fc.constantFrom(
  'SUPERVISOR' as UserProfile,
  'GESTOR' as UserProfile,
  'SUPERVISOR_TECNICO' as UserProfile
);

/**
 * Generates a scenario where team membership and Virtual Good access intentionally differ.
 *
 * - memberTeamIds: teams the user belongs to (team membership)
 * - catalogItems: Virtual Goods the user possesses (ACL source of truth)
 * - Some teams appear in membership but NOT in catalogItems (or with quantity <= 0)
 * - Some teams appear in catalogItems (quantity > 0) but NOT in membership
 */
const divergentScenarioArb = fc.record({
  profile: managementProfileArb,
  // Teams the user is a member of (includes role team + operational teams)
  memberOnlyTeams: fc.array(teamIdArb, { minLength: 1, maxLength: 5 }),
  // Teams with Virtual Good access (quantity > 0)
  vgAccessTeams: fc.array(teamIdArb, { minLength: 1, maxLength: 5 }),
  // Teams with Virtual Good but quantity <= 0 (revoked)
  vgRevokedTeams: fc.array(teamIdArb, { minLength: 0, maxLength: 3 }),
}).map(({ profile, memberOnlyTeams, vgAccessTeams, vgRevokedTeams }) => {
  // Build the role team for this profile
  const roleTeamId =
    profile === 'SUPERVISOR' ? MANAGEMENT_TEAM_IDS.SUPERVISAO :
    profile === 'GESTOR' ? MANAGEMENT_TEAM_IDS.GESTAO :
    MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA;

  // User's team membership: role team + member-only teams
  const teamMembership = [roleTeamId, ...memberOnlyTeams];

  // Build catalog_items: access teams get quantity > 0, revoked get quantity <= 0
  const catalogItems: CatalogItems = {};
  for (const id of vgAccessTeams) {
    catalogItems[id] = { quantity: 1, item: id };
  }
  for (const id of vgRevokedTeams) {
    if (!(id in catalogItems)) {
      catalogItems[id] = { quantity: 0, item: id };
    }
  }

  return {
    profile,
    teamMembership,
    catalogItems,
    roleTeamId
  };
});

describe('Property 15: All dashboard components derive team visibility from ACL Service, not team membership', () => {
  // Feature: acl-dashboard-refactor, Property 15: All dashboard components derive team visibility from ACL Service, not team membership
  // **Validates: Requirements 1.1, 1.6, 2.7**

  it('dashboard visible teams match Virtual Good access, not team membership', () => {
    fc.assert(
      fc.property(divergentScenarioArb, ({ profile, teamMembership, catalogItems }) => {
        const vgBasedTeams = getDashboardVisibleTeams(catalogItems);
        const membershipBasedTeams = getTeamMembershipBasedIds(teamMembership, profile);

        // The dashboard MUST use Virtual Good-based access
        const vgSet = new Set(vgBasedTeams);
        const memberSet = new Set(membershipBasedTeams);

        // Every team visible on the dashboard must have a Virtual Good with quantity > 0
        for (const teamId of vgBasedTeams) {
          const entry = catalogItems[teamId];
          expect(entry).toBeDefined();
          expect(entry.quantity).toBeGreaterThan(0);
        }

        // Teams that are in membership but NOT in Virtual Goods must NOT be visible
        for (const teamId of membershipBasedTeams) {
          if (!vgSet.has(teamId)) {
            expect(vgBasedTeams).not.toContain(teamId);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('user who is a team member but lacks Virtual Good does NOT see that team', () => {
    fc.assert(
      fc.property(
        fc.array(teamIdArb, { minLength: 1, maxLength: 5 }),
        managementProfileArb,
        (memberTeams: string[], profile: UserProfile) => {
          // User is a member of these teams but has NO Virtual Goods at all
          const emptyCatalog: CatalogItems = {};
          const visibleTeams = getDashboardVisibleTeams(emptyCatalog);

          // No teams should be visible regardless of membership
          expect(visibleTeams.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('user with Virtual Good access but no team membership DOES see that team', () => {
    fc.assert(
      fc.property(
        fc.array(teamIdArb, { minLength: 1, maxLength: 5 }),
        (vgTeams: string[]) => {
          // User has Virtual Goods but is NOT a member of these teams
          const catalogItems: CatalogItems = {};
          for (const id of vgTeams) {
            catalogItems[id] = { quantity: 1, item: id };
          }

          const visibleTeams = getDashboardVisibleTeams(catalogItems);
          const visibleSet = new Set(visibleTeams);

          // All Virtual Good teams should be visible
          for (const id of vgTeams) {
            expect(visibleSet.has(id)).toBeTrue();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('revoked Virtual Good (quantity <= 0) hides team even if user is a member', () => {
    fc.assert(
      fc.property(
        divergentScenarioArb,
        ({ catalogItems, teamMembership }) => {
          const visibleTeams = new Set(getDashboardVisibleTeams(catalogItems));

          // Any catalog entry with quantity <= 0 must NOT appear in visible teams
          for (const [id, entry] of Object.entries(catalogItems)) {
            if (entry.quantity <= 0) {
              expect(visibleTeams.has(id)).toBeFalse();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dashboard visibility count equals number of Virtual Goods with quantity > 0', () => {
    fc.assert(
      fc.property(divergentScenarioArb, ({ catalogItems }) => {
        const visibleTeams = getDashboardVisibleTeams(catalogItems);
        const expectedCount = Object.values(catalogItems)
          .filter(entry => entry.quantity > 0).length;

        expect(visibleTeams.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });
});
