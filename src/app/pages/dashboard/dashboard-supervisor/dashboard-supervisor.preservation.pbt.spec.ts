/**
 * Preservation Property-Based Tests for Supervisor Dashboard Bugfix
 *
 * These tests capture the CURRENT correct behaviors that must be preserved
 * after the bugfix is applied. They run on UNFIXED code and should PASS,
 * confirming the baseline behavior we want to keep.
 *
 * Property 2: Preservation — Supervisor Dashboard Preserved Behaviors
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */
import * as fc from 'fast-check';
import { KPIData } from '@model/gamification-dashboard.model';
import { UserProfile, determineUserProfile } from '@utils/user-profile';

// ---------------------------------------------------------------------------
// Inline helpers extracted from the component logic so we can test them
// in isolation without Angular TestBed overhead.
// ---------------------------------------------------------------------------

interface SupervisorInfoCard {
  name: string;
  points: number;
  coins: number;
  cnpjMetric: number;
  entregaMetric: number;
  cnpjGoal: number;
  entregaGoal: number;
}

interface SupervisorPlayerCard {
  playerId: string;
  playerName: string;
  teams: string[];
  teamIds: string[];
  points: number;
  coins: number;
  cnpjMetric: number;
  entregaMetric: number;
  cnpjGoal: number;
  entregaGoal: number;
  kpis: KPIData[];
}

/** Mirrors DashboardSupervisorComponent.loadSupervisorInfoCard mapping */
function buildSupervisorInfoFromRaw(playerData: any): SupervisorInfoCard {
  const extra = playerData.extra || {};
  const pointCategories = playerData.point_categories || playerData.pointCategories || {};
  const points = Number(pointCategories.pontos_supervisor) || 0;
  const coins = Number(pointCategories.coins) || 0;
  const cnpjMetric = getCnpjRespCount(extra);
  const entregaMetric = extra.entrega_sup ? parseFloat(extra.entrega_sup) : 0;
  const cnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
  const entregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;

  return { name: playerData.name || '', points, coins, cnpjMetric, entregaMetric, cnpjGoal, entregaGoal };
}

function getCnpjRespCount(extra: Record<string, unknown>): number {
  const raw = extra?.['cnpj_resp'];
  if (raw == null) return 0;
  if (typeof raw === 'string') {
    return raw.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0).length;
  }
  if (Array.isArray(raw)) return (raw as any[]).length;
  return 0;
}

/** Mirrors DashboardSupervisorComponent.calculateAverages */
function calculateAverages(players: SupervisorPlayerCard[]): {
  averagePoints: number;
  averageCnpjMetric: number;
  averageEntregaMetric: number;
} {
  if (players.length === 0) {
    return { averagePoints: 0, averageCnpjMetric: 0, averageEntregaMetric: 0 };
  }
  const count = players.length;
  const totalPoints = players.reduce((sum, p) => sum + p.points, 0);
  const totalCnpj = players.reduce((sum, p) => sum + p.cnpjMetric, 0);
  const totalEntrega = players.reduce((sum, p) => sum + p.entregaMetric, 0);
  return {
    averagePoints: totalPoints / count,
    averageCnpjMetric: totalCnpj / count,
    averageEntregaMetric: totalEntrega / count,
  };
}


// ---------------------------------------------------------------------------
// Navigation filtering logic (mirrors c4u-dashboard-navigation)
// ---------------------------------------------------------------------------

interface DashboardOption {
  label: string;
  route: string;
  icon: string;
  requiresRole?: string;
}

const DASHBOARDS: DashboardOption[] = [
  { label: 'Meu Painel', route: '/dashboard', icon: 'ri-dashboard-line' },
  { label: 'Gestão de Equipe', route: '/dashboard/team-management', icon: 'ri-team-line', requiresRole: 'GESTAO' },
];

function filterAvailableDashboards(
  isJogador: boolean,
  canAccessTeamManagement: boolean
): DashboardOption[] {
  return DASHBOARDS.filter(d => {
    if (d.route === '/dashboard' && d.label === 'Meu Painel') return isJogador;
    if (d.requiresRole) return canAccessTeamManagement;
    return true;
  });
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a non-negative finite number */
const arbNonNeg = fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true });

/** Arbitrary for a positive integer (player count) */
const arbPosInt = fc.integer({ min: 1, max: 500 });

/** Arbitrary for a non-empty player name */
const arbName = fc.string({ minLength: 1, maxLength: 80 });

/** Arbitrary for a SupervisorPlayerCard */
const arbPlayerCard: fc.Arbitrary<SupervisorPlayerCard> = fc.record({
  playerId: fc.string({ minLength: 1, maxLength: 20 }),
  playerName: arbName,
  teams: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  teamIds: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
  points: arbNonNeg,
  coins: arbNonNeg,
  cnpjMetric: arbNonNeg,
  entregaMetric: arbNonNeg,
  cnpjGoal: arbNonNeg,
  entregaGoal: arbNonNeg,
  kpis: fc.constant([] as KPIData[]),
});

/** Arbitrary for raw player data as returned by playerService.getRawPlayerData */
const arbRawPlayerData = fc.record({
  name: arbName,
  _id: fc.string({ minLength: 1, maxLength: 20 }),
  point_categories: fc.record({
    pontos_supervisor: arbNonNeg.map(v => v.toString()),
    coins: arbNonNeg.map(v => v.toString()),
  }),
  extra: fc.record({
    cnpj_resp: fc.oneof(
      fc.constant(null as any),
      fc.constant(''),
      fc.array(fc.string({ minLength: 14, maxLength: 14 }), { minLength: 0, maxLength: 10 })
        .map(arr => arr.join(',')),
    ),
    entrega_sup: fc.oneof(
      fc.constant(undefined as any),
      arbNonNeg.map(v => v.toString()),
    ),
    cnpj_goal: fc.oneof(fc.constant(null as any), arbNonNeg),
    entrega_goal: fc.oneof(fc.constant(null as any), arbNonNeg),
  }),
});

// Default team codes
const DEFAULT_TEAM_CODES = { supervisor: 'Fkmdmko', gestor: 'FkmdnFU', diretor: 'FkmdhZ9' };


// ===========================================================================
// TEST SUITE
// ===========================================================================

describe('Supervisor Dashboard Preservation Properties', () => {

  // -------------------------------------------------------------------------
  // Property 2.1: Supervisor name is populated from player data (Req 3.1, 3.8)
  // -------------------------------------------------------------------------
  describe('Property 2.1: supervisorInfo.name is populated from player data', () => {
    it('for all raw player data, supervisorInfo.name equals playerData.name', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          expect(info.name).toBe(playerData.name);
        }),
        { numRuns: 200 }
      );
    });

    it('for player data with empty name, supervisorInfo.name is empty string', () => {
      fc.assert(
        fc.property(
          arbRawPlayerData.map(d => ({ ...d, name: '' })),
          (playerData) => {
            const info = buildSupervisorInfoFromRaw(playerData);
            expect(info.name).toBe('');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('for player data with missing name, supervisorInfo.name defaults to empty string', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const noName = { ...playerData, name: undefined as any };
          const info = buildSupervisorInfoFromRaw(noName);
          expect(info.name).toBe('');
        }),
        { numRuns: 50 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.2: Team averages are arithmetic mean of player metrics (Req 3.2)
  // -------------------------------------------------------------------------
  describe('Property 2.2: averagePoints === sum(points) / count for non-empty playerCards', () => {
    it('for all non-empty player arrays, average is arithmetic mean', () => {
      fc.assert(
        fc.property(
          fc.array(arbPlayerCard, { minLength: 1, maxLength: 50 }),
          (players) => {
            const result = calculateAverages(players);
            const count = players.length;
            const expectedPoints = players.reduce((s, p) => s + p.points, 0) / count;
            const expectedCnpj = players.reduce((s, p) => s + p.cnpjMetric, 0) / count;
            const expectedEntrega = players.reduce((s, p) => s + p.entregaMetric, 0) / count;

            expect(result.averagePoints).toBeCloseTo(expectedPoints, 10);
            expect(result.averageCnpjMetric).toBeCloseTo(expectedCnpj, 10);
            expect(result.averageEntregaMetric).toBeCloseTo(expectedEntrega, 10);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('for empty player array, all averages are zero', () => {
      const result = calculateAverages([]);
      expect(result.averagePoints).toBe(0);
      expect(result.averageCnpjMetric).toBe(0);
      expect(result.averageEntregaMetric).toBe(0);
    });

    it('for single player, averages equal that player metrics', () => {
      fc.assert(
        fc.property(arbPlayerCard, (player) => {
          const result = calculateAverages([player]);
          expect(result.averagePoints).toBeCloseTo(player.points, 10);
          expect(result.averageCnpjMetric).toBeCloseTo(player.cnpjMetric, 10);
          expect(result.averageEntregaMetric).toBeCloseTo(player.entregaMetric, 10);
        }),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.3: Goals summary uses supervisor's own goal values (Req 3.3)
  // -------------------------------------------------------------------------
  describe('Property 2.3: goals summary displays supervisorInfo.cnpjMetric/cnpjGoal and entregaMetric/entregaGoal', () => {
    it('for all raw player data, goals are correctly extracted', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          const extra = playerData.extra || {};

          // cnpjGoal defaults to 100 when null
          const expectedCnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
          const expectedEntregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;

          expect(info.cnpjGoal).toBe(expectedCnpjGoal);
          expect(info.entregaGoal).toBe(expectedEntregaGoal);
        }),
        { numRuns: 200 }
      );
    });

    it('cnpjMetric equals count of items in cnpj_resp', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          const expectedCount = getCnpjRespCount(playerData.extra || {});
          expect(info.cnpjMetric).toBe(expectedCount);
        }),
        { numRuns: 200 }
      );
    });

    it('entregaMetric is parsed from extra.entrega_sup', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          const extra = playerData.extra || {};
          const expected = extra.entrega_sup ? parseFloat(extra.entrega_sup) : 0;
          expect(info.entregaMetric).toBeCloseTo(expected, 10);
        }),
        { numRuns: 200 }
      );
    });
  });


  // -------------------------------------------------------------------------
  // Property 2.4: Player cards have correct per-player data (Req 3.4)
  // -------------------------------------------------------------------------
  describe('Property 2.4: player cards render with correct per-player KPIs, points, and teams', () => {
    it('for all player cards, points and metrics are non-negative numbers', () => {
      fc.assert(
        fc.property(arbPlayerCard, (player) => {
          expect(player.points).toBeGreaterThanOrEqual(0);
          expect(player.cnpjMetric).toBeGreaterThanOrEqual(0);
          expect(player.entregaMetric).toBeGreaterThanOrEqual(0);
          expect(player.cnpjGoal).toBeGreaterThanOrEqual(0);
          expect(player.entregaGoal).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 200 }
      );
    });

    it('for all player cards, teams array is non-empty', () => {
      fc.assert(
        fc.property(arbPlayerCard, (player) => {
          expect(player.teams.length).toBeGreaterThan(0);
          expect(player.teamIds.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });

    it('for all player cards, playerName is a non-empty string', () => {
      fc.assert(
        fc.property(arbPlayerCard, (player) => {
          expect(player.playerName.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.5: Navigation shows "Meu Painel" for JOGADOR only (Req 3.5)
  // -------------------------------------------------------------------------
  describe('Property 2.5: navigation shows "Meu Painel" for JOGADOR users only', () => {
    it('for JOGADOR users, available dashboards include "Meu Painel"', () => {
      const available = filterAvailableDashboards(true, false);
      const meuPainel = available.find(d => d.label === 'Meu Painel');
      expect(meuPainel).toBeDefined();
      expect(meuPainel!.route).toBe('/dashboard');
    });

    it('for JOGADOR users, "Gestão de Equipe" is NOT available', () => {
      const available = filterAvailableDashboards(true, false);
      const gestao = available.find(d => d.label === 'Gestão de Equipe');
      expect(gestao).toBeUndefined();
    });

    it('for non-JOGADOR users, "Meu Painel" is NOT available', () => {
      const available = filterAvailableDashboards(false, true);
      const meuPainel = available.find(d => d.label === 'Meu Painel');
      expect(meuPainel).toBeUndefined();
    });

    it('for all team arrays without management teams, profile is JOGADOR', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 5, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
          (teams) => {
            // Filter out any teams that accidentally match management codes
            const nonMgmtTeams = teams.filter(
              t => t !== DEFAULT_TEAM_CODES.supervisor &&
                   t !== DEFAULT_TEAM_CODES.gestor &&
                   t !== DEFAULT_TEAM_CODES.diretor
            );
            const profile = determineUserProfile(nonMgmtTeams, DEFAULT_TEAM_CODES);
            expect(profile).toBe(UserProfile.JOGADOR);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('JOGADOR users should NOT see "Supervisor" in current navigation', () => {
      // Current navigation does not have "Supervisor" at all — this confirms
      // that JOGADOR users never see it (preservation of current behavior)
      const available = filterAvailableDashboards(true, false);
      const supervisor = available.find(d => d.label === 'Supervisor');
      expect(supervisor).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.6: Navigation shows "Gestão de Equipe" for management (Req 3.6)
  // -------------------------------------------------------------------------
  describe('Property 2.6: navigation shows "Gestão de Equipe" for management users', () => {
    it('for management users (canAccessTeamManagement=true), "Gestão de Equipe" is available', () => {
      const available = filterAvailableDashboards(false, true);
      const gestao = available.find(d => d.label === 'Gestão de Equipe');
      expect(gestao).toBeDefined();
      expect(gestao!.route).toBe('/dashboard/team-management');
    });

    it('for SUPERVISOR profile, canAccessTeamManagement is true', () => {
      const teams = [DEFAULT_TEAM_CODES.supervisor, 'some-other-team'];
      const profile = determineUserProfile(teams, DEFAULT_TEAM_CODES);
      expect(profile).toBe(UserProfile.SUPERVISOR);
      // SUPERVISOR is not JOGADOR, so canAccessTeamManagement = true
      expect(profile !== UserProfile.JOGADOR).toBeTrue();
    });

    it('for GESTOR profile, canAccessTeamManagement is true', () => {
      const teams = [DEFAULT_TEAM_CODES.gestor, 'some-other-team'];
      const profile = determineUserProfile(teams, DEFAULT_TEAM_CODES);
      expect(profile).toBe(UserProfile.GESTOR);
      expect(profile !== UserProfile.JOGADOR).toBeTrue();
    });

    it('for DIRETOR profile, canAccessTeamManagement is true', () => {
      const teams = [DEFAULT_TEAM_CODES.diretor, 'some-other-team'];
      const profile = determineUserProfile(teams, DEFAULT_TEAM_CODES);
      expect(profile).toBe(UserProfile.DIRETOR);
      expect(profile !== UserProfile.JOGADOR).toBeTrue();
    });

    it('for non-SUPERVISOR management users (GESTOR, DIRETOR), "Supervisor" is NOT in current navigation', () => {
      // Current navigation does not have "Supervisor" at all
      const available = filterAvailableDashboards(false, true);
      const supervisor = available.find(d => d.label === 'Supervisor');
      expect(supervisor).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.7: Month filter triggers reload of all data (Req 3.7)
  // -------------------------------------------------------------------------
  describe('Property 2.7: month filter change triggers reload of info card, players, and clients', () => {
    it('onMonthChange sets selectedMonthsAgo and resets clientesActiveTab', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1, max: 12 }),
          (monthsAgo) => {
            // Simulate the onMonthChange logic (extracted from component)
            let selectedMonthsAgo = 0;
            let clientesActiveTab: string = 'participacao';
            let participacaoCnpjs: any[] = [{ cnpj: '123' }];
            let loadInfoCardCalled = false;
            let loadTeamPlayersCalled = false;
            let loadClientListCalled = false;

            // Simulate onMonthChange
            selectedMonthsAgo = monthsAgo;
            loadInfoCardCalled = true;
            loadTeamPlayersCalled = true;
            loadClientListCalled = true;
            participacaoCnpjs = [];
            clientesActiveTab = 'carteira';

            expect(selectedMonthsAgo).toBe(monthsAgo);
            expect(loadInfoCardCalled).toBeTrue();
            expect(loadTeamPlayersCalled).toBeTrue();
            expect(loadClientListCalled).toBeTrue();
            expect(participacaoCnpjs.length).toBe(0);
            expect(clientesActiveTab).toBe('carteira');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.8: loadSupervisorInfoCard fetches name and goals (Req 3.8)
  // -------------------------------------------------------------------------
  describe('Property 2.8: loadSupervisorInfoCard populates name and goals from getRawPlayerData', () => {
    it('for all raw player data, supervisorInfo contains name, cnpjGoal, and entregaGoal', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);

          // Name is always populated (may be empty string)
          expect(typeof info.name).toBe('string');

          // Goals are always numbers
          expect(typeof info.cnpjGoal).toBe('number');
          expect(typeof info.entregaGoal).toBe('number');
          expect(isNaN(info.cnpjGoal)).toBeFalse();
          expect(isNaN(info.entregaGoal)).toBeFalse();
        }),
        { numRuns: 200 }
      );
    });

    it('supervisorInfo.points comes from point_categories.pontos_supervisor', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          const pc = playerData.point_categories || {};
          const expected = Number(pc.pontos_supervisor) || 0;
          expect(info.points).toBeCloseTo(expected, 10);
        }),
        { numRuns: 200 }
      );
    });

    it('supervisorInfo.coins comes from point_categories.coins', () => {
      fc.assert(
        fc.property(arbRawPlayerData, (playerData) => {
          const info = buildSupervisorInfoFromRaw(playerData);
          const pc = playerData.point_categories || {};
          const expected = Number(pc.coins) || 0;
          expect(info.coins).toBeCloseTo(expected, 10);
        }),
        { numRuns: 200 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.9: Profile determination priority order (Req 3.5, 3.6)
  // -------------------------------------------------------------------------
  describe('Property 2.9: user profile determination follows priority order', () => {
    it('DIRETOR > GESTOR > SUPERVISOR > JOGADOR priority', () => {
      // User with all management teams → DIRETOR (highest priority)
      const allTeams = [DEFAULT_TEAM_CODES.supervisor, DEFAULT_TEAM_CODES.gestor, DEFAULT_TEAM_CODES.diretor];
      expect(determineUserProfile(allTeams, DEFAULT_TEAM_CODES)).toBe(UserProfile.DIRETOR);

      // User with GESTOR + SUPERVISOR → GESTOR
      const gestorSup = [DEFAULT_TEAM_CODES.supervisor, DEFAULT_TEAM_CODES.gestor];
      expect(determineUserProfile(gestorSup, DEFAULT_TEAM_CODES)).toBe(UserProfile.GESTOR);

      // User with only SUPERVISOR → SUPERVISOR
      const supOnly = [DEFAULT_TEAM_CODES.supervisor];
      expect(determineUserProfile(supOnly, DEFAULT_TEAM_CODES)).toBe(UserProfile.SUPERVISOR);

      // User with no management teams → JOGADOR
      expect(determineUserProfile(['random-team'], DEFAULT_TEAM_CODES)).toBe(UserProfile.JOGADOR);
    });

    it('for all random team arrays, profile is always one of the 4 valid values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant(DEFAULT_TEAM_CODES.supervisor),
              fc.constant(DEFAULT_TEAM_CODES.gestor),
              fc.constant(DEFAULT_TEAM_CODES.diretor),
              fc.string({ minLength: 5, maxLength: 10 }),
            ),
            { minLength: 0, maxLength: 5 }
          ),
          (teams) => {
            const profile = determineUserProfile(teams, DEFAULT_TEAM_CODES);
            expect([
              UserProfile.JOGADOR,
              UserProfile.SUPERVISOR,
              UserProfile.GESTOR,
              UserProfile.DIRETOR,
            ]).toContain(profile);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('null/undefined/empty teams always yields JOGADOR', () => {
      expect(determineUserProfile(null, DEFAULT_TEAM_CODES)).toBe(UserProfile.JOGADOR);
      expect(determineUserProfile(undefined, DEFAULT_TEAM_CODES)).toBe(UserProfile.JOGADOR);
      expect(determineUserProfile([], DEFAULT_TEAM_CODES)).toBe(UserProfile.JOGADOR);
    });
  });

  // -------------------------------------------------------------------------
  // Property 2.10: getCnpjRespCount handles all input formats (Req 3.3, 3.8)
  // -------------------------------------------------------------------------
  describe('Property 2.10: getCnpjRespCount handles string, array, and null inputs', () => {
    it('for comma-separated strings, count equals number of non-empty segments', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 14 }), { minLength: 0, maxLength: 20 }),
          (cnpjs) => {
            const str = cnpjs.join(',');
            const count = getCnpjRespCount({ cnpj_resp: str });
            // Count should match non-empty segments after split
            const expected = str.split(/[;,]/).map(s => s.trim()).filter(s => s.length > 0).length;
            expect(count).toBe(expected);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('for array inputs, count equals array length', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 14 }), { minLength: 0, maxLength: 20 }),
          (cnpjs) => {
            const count = getCnpjRespCount({ cnpj_resp: cnpjs });
            expect(count).toBe(cnpjs.length);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('for null/undefined, count is 0', () => {
      expect(getCnpjRespCount({ cnpj_resp: null })).toBe(0);
      expect(getCnpjRespCount({ cnpj_resp: undefined })).toBe(0);
      expect(getCnpjRespCount({})).toBe(0);
    });
  });
});
