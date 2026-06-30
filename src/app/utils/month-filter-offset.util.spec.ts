import {
  dateFromMonthFilterOffset,
  monthFilterOffsetForMonthsAhead,
  MONTH_FILTER_TODA_TEMPORADA
} from './month-filter-offset.util';

describe('month-filter-offset.util', () => {
  const june2026 = new Date(2026, 5, 15);

  it('maps current and past months', () => {
    const current = dateFromMonthFilterOffset(0, june2026);
    expect(current?.getFullYear()).toBe(2026);
    expect(current?.getMonth()).toBe(5);

    const may = dateFromMonthFilterOffset(1, june2026);
    expect(may?.getMonth()).toBe(4);
  });

  it('maps future months without using -1 (toda temporada)', () => {
    expect(monthFilterOffsetForMonthsAhead(1)).toBe(-2);
    const july = dateFromMonthFilterOffset(-2, june2026);
    expect(july?.getFullYear()).toBe(2026);
    expect(july?.getMonth()).toBe(6);
  });

  it('returns undefined for toda temporada', () => {
    expect(dateFromMonthFilterOffset(MONTH_FILTER_TODA_TEMPORADA, june2026)).toBeUndefined();
  });
});
