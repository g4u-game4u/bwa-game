/**
 * Pure utility for computing SUPERVISOR average metrics across team players.
 *
 * Extracted from DashboardSupervisorComponent.calculateAverages()
 * so the core invariant can be property-tested without Angular dependencies.
 */

/** Minimal player data needed for average calculation. */
export interface PlayerMetrics {
  points: number;
  cnpjMetric: number;
  entregaMetric: number;
}

/** Result of the average calculation. */
export interface AverageMetrics {
  averagePoints: number;
  averageCnpjMetric: number;
  averageEntregaMetric: number;
}

/**
 * Computes the arithmetic mean of player metrics.
 *
 * - If the input array is empty (no players), all averages are 0.
 * - Only actual players contribute to the average; the caller is
 *   responsible for excluding empty teams before passing data in.
 * - This mirrors the component logic: averages = sum / playerCards.length,
 *   where playerCards already contains only real, deduplicated players.
 */
export function calculatePlayerAverages(players: PlayerMetrics[]): AverageMetrics {
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
