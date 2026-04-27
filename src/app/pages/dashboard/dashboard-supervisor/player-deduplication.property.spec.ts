import * as fc from 'fast-check';
import {
  deduplicatePlayers,
  TeamMemberGroup,
  TeamMember,
  DeduplicatedPlayer
} from '@utils/player-deduplication';

// Feature: acl-dashboard-refactor, Property 5: Player deduplication across teams
// **Validates: Requirements 7.3**

/**
 * Generates a valid player ID (non-empty alphanumeric, never "null"/"undefined").
 */
const playerIdArb = fc.string({
  minLength: 1,
  maxLength: 12,
  unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
  ),
}).filter(id => id !== 'null' && id !== 'undefined');

/**
 * Generates a team ID.
 */
const teamIdArb = fc.string({
  minLength: 1,
  maxLength: 10,
  unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
  ),
});

/**
 * Generates a player name.
 */
const playerNameArb = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.split('')
  ),
});

/**
 * Generates a TeamMember with a given ID.
 */
function memberArb(id: string): fc.Arbitrary<TeamMember> {
  return playerNameArb.map(name => ({ _id: id, name }));
}

/**
 * Generates a TeamMemberGroup with a pool of player IDs to pick from.
 * This ensures overlapping memberships across teams.
 */
function teamGroupArb(
  playerPool: string[],
  teamId: string,
  teamName: string
): fc.Arbitrary<TeamMemberGroup> {
  return fc
    .subarray(playerPool, { minLength: 0, maxLength: playerPool.length })
    .chain(selectedIds =>
      fc
        .tuple(...selectedIds.map(id => memberArb(id)))
        .map(members => ({ teamId, teamName, members }))
    );
}

/**
 * Builds a full test scenario: a pool of players distributed across multiple teams.
 */
const scenarioArb = fc
  .tuple(
    fc.array(playerIdArb, { minLength: 1, maxLength: 8 }).map(ids => [...new Set(ids)]),
    fc.array(
      fc.tuple(teamIdArb, playerNameArb),
      { minLength: 1, maxLength: 5 }
    ).map(pairs => {
      const seen = new Set<string>();
      return pairs.filter(([id]) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    })
  )
  .chain(([playerPool, teamDefs]) =>
    fc
      .tuple(
        ...teamDefs.map(([tId, tName]) => teamGroupArb(playerPool, tId, tName))
      )
      .map(groups => ({ playerPool, groups }))
  );

describe('Property 5: Player deduplication across teams', () => {
  // Feature: acl-dashboard-refactor, Property 5: Player deduplication across teams
  // **Validates: Requirements 7.3**

  it('each player appears exactly once in the output', () => {
    fc.assert(
      fc.property(scenarioArb, ({ groups }) => {
        const result = deduplicatePlayers(groups);
        const ids = result.map((p: DeduplicatedPlayer) => p.playerId);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
      }),
      { numRuns: 100 }
    );
  });

  it('every valid player from the input appears in the output', () => {
    fc.assert(
      fc.property(scenarioArb, ({ groups }) => {
        // Collect all valid unique player IDs from input
        const inputIds = new Set<string>();
        for (const g of groups) {
          for (const m of g.members) {
            const id = String(m._id);
            if (id && id !== 'null' && id !== 'undefined') {
              inputIds.add(id);
            }
          }
        }

        const result = deduplicatePlayers(groups);
        const outputIds = new Set(result.map((p: DeduplicatedPlayer) => p.playerId));

        expect(outputIds.size).toBe(inputIds.size);
        for (const id of inputIds) {
          expect(outputIds.has(id)).toBeTrue();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('a player teams list contains all teams they appeared in', () => {
    fc.assert(
      fc.property(scenarioArb, ({ groups }) => {
        // Build expected team sets per player
        const expectedTeams = new Map<string, Set<string>>();
        for (const g of groups) {
          for (const m of g.members) {
            const id = String(m._id);
            if (!id || id === 'null' || id === 'undefined') continue;
            if (!expectedTeams.has(id)) expectedTeams.set(id, new Set());
            expectedTeams.get(id)!.add(g.teamId);
          }
        }

        const result = deduplicatePlayers(groups);

        for (const player of result) {
          const expected = expectedTeams.get(player.playerId)!;
          const actual = new Set(player.teamIds);
          expect(actual.size).toBe(expected.size);
          for (const tid of expected) {
            expect(actual.has(tid)).toBeTrue();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('teams and teamIds arrays have the same length per player', () => {
    fc.assert(
      fc.property(scenarioArb, ({ groups }) => {
        const result = deduplicatePlayers(groups);
        for (const player of result) {
          expect(player.teams.length).toBe(player.teamIds.length);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('teamIds contain no duplicates per player', () => {
    fc.assert(
      fc.property(scenarioArb, ({ groups }) => {
        const result = deduplicatePlayers(groups);
        for (const player of result) {
          const unique = new Set(player.teamIds);
          expect(player.teamIds.length).toBe(unique.size);
        }
      }),
      { numRuns: 100 }
    );
  });
});
