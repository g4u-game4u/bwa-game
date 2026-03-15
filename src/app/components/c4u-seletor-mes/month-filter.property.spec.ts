import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 11: Month filter date range emission
// **Validates: Requirements 13.2, 13.3**

/**
 * Pure function that converts a monthsAgo offset to a date range.
 *
 * Mirrors the date-range logic used by dashboard components when consuming
 * the c4u-seletor-mes emission:
 *   - monthsAgo >= 0  → { start: first ms of that month, end: last ms of that month }
 *   - monthsAgo === -1 → null (no date filtering / "Toda temporada")
 *
 * @param monthsAgo  Number of months before referenceDate (0 = same month).
 *                   -1 signals "Toda temporada".
 * @param referenceDate  The "now" anchor used to compute the target month.
 */
function getMonthDateRange(
  monthsAgo: number,
  referenceDate: Date
): { start: Date; end: Date } | null {
  if (monthsAgo === -1) {
    return null;
  }

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() - monthsAgo;

  const start = new Date(year, month, 1, 0, 0, 0, 0);
  // day 0 of the *next* month = last day of target month
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a reference date within a reasonable range (2024–2028). */
const referenceDateArb: fc.Arbitrary<Date> = fc
  .record({
    year: fc.integer({ min: 2024, max: 2028 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }) // safe for all months
  })
  .map(({ year, month, day }) => new Date(year, month, day, 12, 0, 0, 0));

/** Generates a monthsAgo value for a specific month (0–24). */
const monthsAgoArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 24 });

/** Generates the "Toda temporada" sentinel value. */
const todaTemporadaArb: fc.Arbitrary<number> = fc.constant(-1);

/** Generates either a specific month or "Toda temporada". */
const monthSelectionArb: fc.Arbitrary<number> = fc.oneof(monthsAgoArb, todaTemporadaArb);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  // day 0 of the next month = last day of target month
  return new Date(year, month + 1, 0).getDate();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 11: Month Filter emits correct date ranges', () => {
  // Feature: acl-dashboard-refactor, Property 11: Month filter date range emission
  // **Validates: Requirements 13.2, 13.3**

  it('"Toda temporada" (monthsAgo === -1) returns null', () => {
    fc.assert(
      fc.property(referenceDateArb, (ref) => {
        const result = getMonthDateRange(-1, ref);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('specific month emits start at first day 00:00:00.000 and end at last day 23:59:59.999', () => {
    fc.assert(
      fc.property(monthsAgoArb, referenceDateArb, (monthsAgo, ref) => {
        const result = getMonthDateRange(monthsAgo, ref);
        expect(result).not.toBeNull();
        if (!result) return; // type guard

        const targetYear = ref.getFullYear();
        const targetMonth = ref.getMonth() - monthsAgo;

        // Normalise year/month (JS Date constructor handles negative months)
        const expectedStart = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
        const normYear = expectedStart.getFullYear();
        const normMonth = expectedStart.getMonth();
        const lastDay = daysInMonth(normYear, normMonth);

        // Start boundary
        expect(result.start.getFullYear()).toBe(normYear);
        expect(result.start.getMonth()).toBe(normMonth);
        expect(result.start.getDate()).toBe(1);
        expect(result.start.getHours()).toBe(0);
        expect(result.start.getMinutes()).toBe(0);
        expect(result.start.getSeconds()).toBe(0);
        expect(result.start.getMilliseconds()).toBe(0);

        // End boundary
        expect(result.end.getFullYear()).toBe(normYear);
        expect(result.end.getMonth()).toBe(normMonth);
        expect(result.end.getDate()).toBe(lastDay);
        expect(result.end.getHours()).toBe(23);
        expect(result.end.getMinutes()).toBe(59);
        expect(result.end.getSeconds()).toBe(59);
        expect(result.end.getMilliseconds()).toBe(999);
      }),
      { numRuns: 100 }
    );
  });

  it('date range covers exactly the correct number of days for the target month', () => {
    fc.assert(
      fc.property(monthsAgoArb, referenceDateArb, (monthsAgo, ref) => {
        const result = getMonthDateRange(monthsAgo, ref);
        expect(result).not.toBeNull();
        if (!result) return;

        const normStart = new Date(ref.getFullYear(), ref.getMonth() - monthsAgo, 1);
        const expectedDays = daysInMonth(normStart.getFullYear(), normStart.getMonth());

        // The range should span exactly expectedDays days
        // (end - start) in ms should be (expectedDays - 1) full days + 23:59:59.999
        const diffMs = result.end.getTime() - result.start.getTime();
        const expectedMs = (expectedDays - 1) * 86400000 + (23 * 3600000 + 59 * 60000 + 59 * 1000 + 999);
        expect(diffMs).toBe(expectedMs);
      }),
      { numRuns: 100 }
    );
  });

  it('handles months with 28, 29, 30, and 31 days correctly', () => {
    // February non-leap (28 days): e.g. Feb 2025
    const feb2025 = getMonthDateRange(0, new Date(2025, 1, 15));
    expect(feb2025).not.toBeNull();
    expect(feb2025!.end.getDate()).toBe(28);

    // February leap (29 days): e.g. Feb 2024
    const feb2024 = getMonthDateRange(0, new Date(2024, 1, 15));
    expect(feb2024).not.toBeNull();
    expect(feb2024!.end.getDate()).toBe(29);

    // April (30 days): e.g. Apr 2025
    const apr2025 = getMonthDateRange(0, new Date(2025, 3, 15));
    expect(apr2025).not.toBeNull();
    expect(apr2025!.end.getDate()).toBe(30);

    // January (31 days): e.g. Jan 2025
    const jan2025 = getMonthDateRange(0, new Date(2025, 0, 15));
    expect(jan2025).not.toBeNull();
    expect(jan2025!.end.getDate()).toBe(31);
  });

  it('monthsAgo >= 0 always returns a non-null range; -1 always returns null', () => {
    fc.assert(
      fc.property(monthSelectionArb, referenceDateArb, (selection, ref) => {
        const result = getMonthDateRange(selection, ref);
        if (selection === -1) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('start is always strictly before end for specific months', () => {
    fc.assert(
      fc.property(monthsAgoArb, referenceDateArb, (monthsAgo, ref) => {
        const result = getMonthDateRange(monthsAgo, ref);
        expect(result).not.toBeNull();
        if (!result) return;
        expect(result.start.getTime()).toBeLessThan(result.end.getTime());
      }),
      { numRuns: 100 }
    );
  });
});
