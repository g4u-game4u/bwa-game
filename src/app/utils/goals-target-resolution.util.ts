/**
 * Resolves the billing target for the valor-concedido KPI.
 *
 * Priority:
 *  1. If the goals backend returned a non-null result with target > 0, use that target.
 *  2. Otherwise fall back to the system param `financeiro_monthly_billing_goal`.
 *
 * @param goalsKpi  Result from GoalsReceitaBackendService (may be null)
 * @param paramTarget  Value of the `financeiro_monthly_billing_goal` system param (≥ 0)
 * @returns The resolved target billing value
 */
export function resolveGoalsTarget(
  goalsKpi: { target: number } | null | undefined,
  paramTarget: number
): number {
  if (goalsKpi != null && goalsKpi.target > 0) {
    return goalsKpi.target;
  }
  return paramTarget;
}

/**
 * Determines the KPI bar color when the target may be zero.
 * When targetBilling is 0 (both sources returned 0), the color is always 'red'.
 */
export function resolveGoalsColor(
  current: number,
  targetBilling: number,
  superTargetBilling: number | undefined,
  getKPIColorByGoals: (c: number, t: number, s: number) => 'red' | 'yellow' | 'green'
): 'red' | 'yellow' | 'green' {
  if (targetBilling > 0 && superTargetBilling != null) {
    return getKPIColorByGoals(current, targetBilling, superTargetBilling);
  }
  return 'red';
}
