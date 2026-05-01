/**
 * Hardcoded KPI target values and team-visibility configuration.
 *
 * These targets are temporary defaults used until dynamic configuration
 * is available from the backend (metric_targets__c or System_Params_Service).
 */

// TODO: migrate to metric_targets__c or System_Params_Service
/** Meta de protocolo — target in R$ (R$ 1.000.000). */
export const META_PROTOCOLO_TARGET = 1_000_000;

// TODO: migrate to metric_targets__c or System_Params_Service
/** Aposentadorias concedidas — target count (220 concedidos). */
export const APOSENTADORIAS_TARGET = 220;

/**
 * Team-specific KPI visibility overrides.
 *
 * Maps team IDs to arrays of KPI IDs that team should see.
 * When a team ID is absent from this map, `DEFAULT_VISIBLE_KPIS` is used.
 *
 * Example:
 * ```
 * { '6': ['valor-concedido', 'meta-protocolo'] }
 * ```
 */
export const TEAM_KPI_VISIBILITY: Record<string, string[]> = {
  // Initially empty — all teams see DEFAULT_VISIBLE_KPIS
};

/** Default KPIs visible to all teams when no team-specific config exists. */
export const DEFAULT_VISIBLE_KPIS: string[] = [
  'entregas-prazo',
  'meta-protocolo',
  'aposentadorias-concedidas',
];

/**
 * Determines whether a KPI should be visible for a given team.
 *
 * - If `teamId` is provided and has an entry in `TEAM_KPI_VISIBILITY`,
 *   the KPI must appear in that team's list.
 * - Otherwise falls back to `DEFAULT_VISIBLE_KPIS`, also allowing
 *   `valor-concedido` (finance-specific filtering is handled separately
 *   by the dashboard components).
 */
export function isKpiVisibleForTeam(kpiId: string, teamId?: string | null): boolean {
  if (teamId && TEAM_KPI_VISIBILITY[teamId]) {
    return TEAM_KPI_VISIBILITY[teamId].includes(kpiId);
  }
  return DEFAULT_VISIBLE_KPIS.includes(kpiId) || kpiId === 'valor-concedido';
}
