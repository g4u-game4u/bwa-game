import * as fc from 'fast-check';
import { determineUserProfile, UserProfile, MANAGEMENT_TEAM_IDS } from './user-profile';

// Feature: acl-dashboard-refactor, Property 2: Role priority determination
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

/**
 * Role Team IDs ordered by priority (highest first).
 */
const ROLE_TEAMS_BY_PRIORITY: { id: string; profile: UserProfile }[] = [
  { id: MANAGEMENT_TEAM_IDS.DIRECAO, profile: UserProfile.DIRETOR },           // FkmdhZ9
  { id: MANAGEMENT_TEAM_IDS.GESTAO, profile: UserProfile.GESTOR },             // FkmdnFU
  { id: MANAGEMENT_TEAM_IDS.SUPERVISAO, profile: UserProfile.SUPERVISOR },     // Fkmdmko
  { id: MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA, profile: UserProfile.SUPERVISOR_TECNICO }, // Fn2lrg3
];

const ALL_ROLE_TEAM_IDS = ROLE_TEAMS_BY_PRIORITY.map(r => r.id);

/**
 * Given a set of role team IDs present, returns the expected highest-priority profile.
 */
function expectedProfile(roleTeamIds: string[]): UserProfile {
  for (const entry of ROLE_TEAMS_BY_PRIORITY) {
    if (roleTeamIds.includes(entry.id)) {
      return entry.profile;
    }
  }
  return UserProfile.JOGADOR;
}

/**
 * Generates a random non-role team ID (alphanumeric, guaranteed not to collide with role IDs).
 */
const nonRoleTeamIdArb = fc.string({
  minLength: 1,
  maxLength: 15,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
}).filter(id => !ALL_ROLE_TEAM_IDS.includes(id));

/**
 * Generates a random subset of role team IDs (0 to all 4).
 */
const roleTeamSubsetArb = fc.subarray(ALL_ROLE_TEAM_IDS, { minLength: 0, maxLength: ALL_ROLE_TEAM_IDS.length });

/**
 * Generates a teams array mixing role team IDs with random non-role IDs.
 * Items can be plain strings or objects with `_id`.
 */
const teamsArrayArb = fc.tuple(
  roleTeamSubsetArb,
  fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 5 })
).chain(([roleIds, extraIds]) => {
  const allIds = [...roleIds, ...extraIds];
  // For each ID, randomly choose string or object format
  return fc.tuple(
    ...allIds.map(id =>
      fc.boolean().map(asObject => asObject ? { _id: id } : id)
    )
  ).map(items => fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length }));
}).chain(shuffled => shuffled);

describe('Property 2: Role priority determination', () => {
  // Feature: acl-dashboard-refactor, Property 2: Role priority determination
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  it('returns the highest-priority role present in the teams array', () => {
    fc.assert(
      fc.property(
        roleTeamSubsetArb,
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 5 }),
        fc.boolean(),
        (roleIds, extraIds, useObjectFormat) => {
          // Build teams array with mixed formats
          const teams = [...roleIds, ...extraIds].map(id =>
            useObjectFormat ? { _id: id } : id
          );

          const result = determineUserProfile(teams);
          const expected = expectedProfile(roleIds);

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns JOGADOR for empty, null, or undefined teams', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, []),
        (teams: any) => {
          expect(determineUserProfile(teams)).toBe(UserProfile.JOGADOR);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns JOGADOR when teams contain only non-role IDs', () => {
    fc.assert(
      fc.property(
        fc.array(nonRoleTeamIdArb, { minLength: 1, maxLength: 10 }),
        (nonRoleIds) => {
          expect(determineUserProfile(nonRoleIds)).toBe(UserProfile.JOGADOR);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('DIRETOR always wins regardless of other role teams present', () => {
    fc.assert(
      fc.property(
        fc.subarray(
          [MANAGEMENT_TEAM_IDS.GESTAO, MANAGEMENT_TEAM_IDS.SUPERVISAO, MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA],
          { minLength: 0, maxLength: 3 }
        ),
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 3 }),
        (otherRoleIds, extraIds) => {
          const teams = [MANAGEMENT_TEAM_IDS.DIRECAO, ...otherRoleIds, ...extraIds];
          expect(determineUserProfile(teams)).toBe(UserProfile.DIRETOR);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('GESTOR wins over SUPERVISOR and SUPERVISOR_TECNICO', () => {
    fc.assert(
      fc.property(
        fc.subarray(
          [MANAGEMENT_TEAM_IDS.SUPERVISAO, MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA],
          { minLength: 0, maxLength: 2 }
        ),
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 3 }),
        (lowerRoleIds, extraIds) => {
          const teams = [MANAGEMENT_TEAM_IDS.GESTAO, ...lowerRoleIds, ...extraIds];
          expect(determineUserProfile(teams)).toBe(UserProfile.GESTOR);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SUPERVISOR wins over SUPERVISOR_TECNICO', () => {
    fc.assert(
      fc.property(
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 3 }),
        (extraIds) => {
          const teams = [MANAGEMENT_TEAM_IDS.SUPERVISAO, MANAGEMENT_TEAM_IDS.SUPERVISAO_TECNICA, ...extraIds];
          expect(determineUserProfile(teams)).toBe(UserProfile.SUPERVISOR);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles teams as objects with _id property', () => {
    fc.assert(
      fc.property(
        roleTeamSubsetArb,
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 5 }),
        (roleIds, extraIds) => {
          const teams = [...roleIds, ...extraIds].map(id => ({ _id: id }));
          const result = determineUserProfile(teams);
          const expected = expectedProfile(roleIds);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles mixed string and object team formats', () => {
    fc.assert(
      fc.property(
        roleTeamSubsetArb,
        fc.array(nonRoleTeamIdArb, { minLength: 0, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
        (roleIds, extraIds, formatFlags) => {
          const allIds = [...roleIds, ...extraIds];
          const teams = allIds.map((id, i) => {
            const asObject = formatFlags[i % formatFlags.length] ?? false;
            return asObject ? { _id: id } : id;
          });

          const result = determineUserProfile(teams);
          const expected = expectedProfile(roleIds);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
