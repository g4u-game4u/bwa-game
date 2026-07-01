/** Meta de entregas no prazo até jun/2026. */
export const ON_TIME_DELIVERY_GOAL_LEGACY = 90;

/** Meta de entregas no prazo a partir de jul/2026. */
export const ON_TIME_DELIVERY_GOAL_CURRENT = 95;

/** Primeiro mês (YYYY-MM) em que a meta de 95% entra em vigor. */
export const ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM = '2026-07';

/** Aumento da meta de 90% → 95% e banner de comunicação nos painéis. */
export const ON_TIME_DELIVERY_GOAL_INCREASE_ENABLED = true;

/** @deprecated Use {@link getOnTimeDeliveryGoalForMonth} — valor legado fixo. */
export const ORG_ON_TIME_PCT_GOAL = ON_TIME_DELIVERY_GOAL_LEGACY;

export function monthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Meta de % entregas no prazo vigente para o mês do filtro do painel. */
export function getOnTimeDeliveryGoalForMonth(month?: Date | null): number {
  if (!ON_TIME_DELIVERY_GOAL_INCREASE_ENABLED) {
    return ON_TIME_DELIVERY_GOAL_LEGACY;
  }

  const ref = month ?? new Date();
  return monthKeyFromDate(ref) >= ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM
    ? ON_TIME_DELIVERY_GOAL_CURRENT
    : ON_TIME_DELIVERY_GOAL_LEGACY;
}

export function formatMonthYearPtBr(month: Date): string {
  const label = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
