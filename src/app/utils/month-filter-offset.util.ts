/** Valor emitido por `c4u-seletor-mes` para o filtro «Toda temporada». */
export const MONTH_FILTER_TODA_TEMPORADA = -1;

/**
 * Converte o offset do filtro de mês em `Date` (dia 1).
 * - `0` = mês atual
 * - `1+` = meses anteriores
 * - `-2` = 1 mês à frente, `-3` = 2 meses à frente (`-1` é reservado para toda temporada)
 */
export function dateFromMonthFilterOffset(
  monthsAgo: number,
  reference: Date = new Date()
): Date | undefined {
  if (monthsAgo === MONTH_FILTER_TODA_TEMPORADA) {
    return undefined;
  }

  const date = new Date(reference);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);

  if (monthsAgo <= -2) {
    const monthsAhead = -(monthsAgo + 1);
    date.setMonth(date.getMonth() + monthsAhead);
  } else {
    date.setMonth(date.getMonth() - monthsAgo);
  }

  return date;
}

/** Offset do filtro para um mês N posições à frente do mês atual (1 = próximo mês). */
export function monthFilterOffsetForMonthsAhead(monthsAhead: number): number {
  return -(monthsAhead + 1);
}
