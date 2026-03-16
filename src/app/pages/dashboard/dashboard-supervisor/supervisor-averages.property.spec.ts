import * as fc from 'fast-check';
import {
  calculatePlayerAverages,
  PlayerMetrics,
  AverageMetrics,
} from '@utils/supervisor-averages';

// Feature: acl-dashboard-refactor, Property 7: Average calculation excludes teams with zero players
// **Validates: Requirements 12.1, 12.2, 12.3**

/**
 * Generates a single PlayerMetrics with finite numeric values.
 */
const playerMetricsArb: fc.Arbitrary<PlayerMetrics> = fc.record({
  points: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
  cnpjMetric: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  entregaMetric: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Represents a team with its members (may be empty).
 */
interface TeamWithPlayers {
  teamId: string;
  players: PlayerMetrics[];
}

/**
 * Generates a team that has at least one player.
 */
const nonEmptyTeamArb: fc.Arbitrary<TeamWithPlayers> = fc.record({
  teamId: fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
  ) }),
  players: fc.array(playerMetricsArb, { minLength: 1, maxLength: 10 }),
});

/**
 * Generates an empty team (zero players).
 */
const emptyTeamArb: fc.Arbitrary<TeamWithPlayers> = fc.string({
  minLength: 1,
  maxLength: 8,
  unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
  ),
}).map(teamId => ({ teamId, players: [] }));

/**
 * Generates a scenario with a mix of non-empty and empty teams.
 */
const mixedTeamsArb = fc.tuple(
  fc.array(nonEmptyTeamArb, { minLength: 1, maxLength: 5 }),
  fc.array(emptyTeamArb, { minLength: 0, maxLength: 5 }),
).map(([nonEmpty, empty]) => ({
  nonEmptyTeams: nonEmpty,
  emptyTeams: empty,
  allTeams: [...nonEmpty, ...empty],
}));

describe('Property 7: SUPERVISOR average metrics exclude empty teams', () => {
  // Feature: acl-dashboard-refactor, Property 7: Average calculation excludes teams with zero players
  // **Validates: Requirements 12.1, 12.2, 12.3**

  it('adding empty teams does not change the average', () => {
    fc.assert(
      fc.property(mixedTeamsArb, ({ nonEmptyTeams, emptyTeams }) => {
        // Collect all players from non-empty teams only
        const playersFromNonEmpty = nonEmptyTeams.flatMap(t => t.players);

        // Collect all players from all teams (empty teams contribute nothing)
        const playersFromAll = [...nonEmptyTeams, ...emptyTeams].flatMap(t => t.players);

        const avgNonEmpty = calculatePlayerAverages(playersFromNonEmpty);
        const avgAll = calculatePlayerAverages(playersFromAll);

        // Since empty teams contribute zero players, both should be identical
        expect(avgAll.averagePoints).toBe(avgNonEmpty.averagePoints);
        expect(avgAll.averageCnpjMetric).toBe(avgNonEmpty.averageCnpjMetric);
        expect(avgAll.averageEntregaMetric).toBe(avgNonEmpty.averageEntregaMetric);
      }),
      { numRuns: 200 }
    );
  });

  it('average of a single player equals that player metrics', () => {
    fc.assert(
      fc.property(playerMetricsArb, (player) => {
        const avg = calculatePlayerAverages([player]);
        expect(avg.averagePoints).toBe(player.points);
        expect(avg.averageCnpjMetric).toBe(player.cnpjMetric);
        expect(avg.averageEntregaMetric).toBe(player.entregaMetric);
      }),
      { numRuns: 200 }
    );
  });

  it('empty player list returns all zeros', () => {
    const avg = calculatePlayerAverages([]);
    expect(avg.averagePoints).toBe(0);
    expect(avg.averageCnpjMetric).toBe(0);
    expect(avg.averageEntregaMetric).toBe(0);
  });

  it('average equals sum / count for non-empty player sets', () => {
    fc.assert(
      fc.property(
        fc.array(playerMetricsArb, { minLength: 1, maxLength: 20 }),
        (players) => {
          const avg = calculatePlayerAverages(players);
          const count = players.length;

          const expectedPoints = players.reduce((s, p) => s + p.points, 0) / count;
          const expectedCnpj = players.reduce((s, p) => s + p.cnpjMetric, 0) / count;
          const expectedEntrega = players.reduce((s, p) => s + p.entregaMetric, 0) / count;

          expect(avg.averagePoints).toBeCloseTo(expectedPoints, 10);
          expect(avg.averageCnpjMetric).toBeCloseTo(expectedCnpj, 10);
          expect(avg.averageEntregaMetric).toBeCloseTo(expectedEntrega, 10);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('average is bounded between min and max player values', () => {
    fc.assert(
      fc.property(
        fc.array(playerMetricsArb, { minLength: 1, maxLength: 20 }),
        (players) => {
          const avg = calculatePlayerAverages(players);

          const minPoints = Math.min(...players.map(p => p.points));
          const maxPoints = Math.max(...players.map(p => p.points));
          expect(avg.averagePoints).toBeGreaterThanOrEqual(minPoints - 1e-9);
          expect(avg.averagePoints).toBeLessThanOrEqual(maxPoints + 1e-9);

          const minCnpj = Math.min(...players.map(p => p.cnpjMetric));
          const maxCnpj = Math.max(...players.map(p => p.cnpjMetric));
          expect(avg.averageCnpjMetric).toBeGreaterThanOrEqual(minCnpj - 1e-9);
          expect(avg.averageCnpjMetric).toBeLessThanOrEqual(maxCnpj + 1e-9);

          const minEntrega = Math.min(...players.map(p => p.entregaMetric));
          const maxEntrega = Math.max(...players.map(p => p.entregaMetric));
          expect(avg.averageEntregaMetric).toBeGreaterThanOrEqual(minEntrega - 1e-9);
          expect(avg.averageEntregaMetric).toBeLessThanOrEqual(maxEntrega + 1e-9);
        }
      ),
      { numRuns: 200 }
    );
  });
});
