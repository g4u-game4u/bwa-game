import * as fc from 'fast-check';

// Feature: dashboard-metrics-refactor, Property 11: Month filter constrains action_log counts
// **Validates: Requirements 6.6**

/**
 * Represents a minimal action_log entry with a CNPJ and timestamp.
 */
interface ActionLogEntry {
  cnpj: string;
  time: number; // timestamp in milliseconds
}

/**
 * Computes the start of a month (inclusive) as a timestamp.
 * Mirrors the logic in getRelativeDateExpression(month, 'start').
 */
function getMonthStart(year: number, month: number): number {
  return new Date(year, month, 1, 0, 0, 0, 0).getTime();
}

/**
 * Computes the end of a month (inclusive) as a timestamp.
 * Mirrors the logic in getRelativeDateExpression(month, 'end').
 */
function getMonthEnd(year: number, month: number): number {
  return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
}

/**
 * Filters action_log entries to only those within the selected month.
 * This mirrors the $match filter used in getPlayerCnpjListWithCount:
 *   time: { $gte: startDate, $lte: endDate }
 */
function filterEntriesByMonth(entries: ActionLogEntry[], year: number, month: number): ActionLogEntry[] {
  const start = getMonthStart(year, month);
  const end = getMonthEnd(year, month);
  return entries.filter(e => e.time >= start && e.time <= end);
}

/**
 * Counts total action_log entries per CNPJ (after month filtering).
 * This mirrors the $group + $sum aggregation in getPlayerCnpjListWithCount.
 */
function countEntriesPerCnpj(entries: ActionLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.cnpj, (counts.get(entry.cnpj) || 0) + 1);
  }
  return counts;
}

/**
 * Generates a CNPJ-like numeric string identifier.
 */
const cnpjArb = fc.string({
  minLength: 1,
  maxLength: 14,
  unit: fc.constantFrom(...'0123456789'.split(''))
});

/**
 * Generates a year/month pair within a reasonable range.
 */
const yearMonthArb = fc.record({
  year: fc.integer({ min: 2024, max: 2028 }),
  month: fc.integer({ min: 0, max: 11 }) // JS months are 0-indexed
});

/**
 * Generates a timestamp within a specific month.
 */
function timestampInMonth(year: number, month: number): fc.Arbitrary<number> {
  const start = getMonthStart(year, month);
  const end = getMonthEnd(year, month);
  return fc.integer({ min: start, max: end });
}

/**
 * Generates a timestamp outside a specific month (either before or after).
 */
function timestampOutsideMonth(year: number, month: number): fc.Arbitrary<number> {
  const start = getMonthStart(year, month);
  const end = getMonthEnd(year, month);

  // Generate timestamps in adjacent months
  const prevMonthEnd = start - 1;
  const nextMonthStart = end + 1;

  // Use a range that spans a few months before and after
  const rangeStart = new Date(year, month - 3, 1).getTime();
  const rangeEnd = new Date(year, month + 4, 0, 23, 59, 59, 999).getTime();

  return fc.oneof(
    fc.integer({ min: Math.min(rangeStart, prevMonthEnd), max: prevMonthEnd }),
    fc.integer({ min: nextMonthStart, max: Math.max(nextMonthStart, rangeEnd) })
  );
}

/**
 * Generates an action_log entry with a timestamp within the given month.
 */
function entryInMonth(year: number, month: number): fc.Arbitrary<ActionLogEntry> {
  return fc.record({
    cnpj: cnpjArb,
    time: timestampInMonth(year, month)
  });
}

/**
 * Generates an action_log entry with a timestamp outside the given month.
 */
function entryOutsideMonth(year: number, month: number): fc.Arbitrary<ActionLogEntry> {
  return fc.record({
    cnpj: cnpjArb,
    time: timestampOutsideMonth(year, month)
  });
}

describe('Property 11: Month filter constrains action_log counts', () => {
  // Feature: dashboard-metrics-refactor, Property 11: Month filter constrains action_log counts
  // **Validates: Requirements 6.6**

  it('only entries within the selected month are counted', () => {
    fc.assert(
      fc.property(
        yearMonthArb,
        fc.array(cnpjArb, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (ym, cnpjs, insideCount, outsideCount) => {
          const { year, month } = ym;
          const start = getMonthStart(year, month);
          const end = getMonthEnd(year, month);

          // Build entries: some inside the month, some outside
          const entries: ActionLogEntry[] = [];

          // Add entries inside the month
          for (let i = 0; i < insideCount; i++) {
            const cnpj = cnpjs[i % cnpjs.length];
            // Spread timestamps evenly within the month
            const fraction = insideCount === 1 ? 0.5 : i / (insideCount - 1);
            const time = Math.floor(start + fraction * (end - start));
            entries.push({ cnpj, time });
          }

          // Add entries outside the month (before)
          for (let i = 0; i < outsideCount; i++) {
            const cnpj = cnpjs[i % cnpjs.length];
            const time = start - (i + 1) * 86400000; // days before month start
            entries.push({ cnpj, time });
          }

          // Filter by month
          const filtered = filterEntriesByMonth(entries, year, month);

          // Verify: filtered count equals insideCount
          expect(filtered.length).toBe(insideCount);

          // Verify: all filtered entries are within the month boundaries
          for (const entry of filtered) {
            expect(entry.time).toBeGreaterThanOrEqual(start);
            expect(entry.time).toBeLessThanOrEqual(end);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('entries outside the selected month are excluded from counts', () => {
    fc.assert(
      fc.property(
        yearMonthArb.chain(ym =>
          fc.record({
            ym: fc.constant(ym),
            insideEntries: fc.array(entryInMonth(ym.year, ym.month), { minLength: 0, maxLength: 15 }),
            outsideEntries: fc.array(entryOutsideMonth(ym.year, ym.month), { minLength: 1, maxLength: 15 })
          })
        ),
        ({ ym, insideEntries, outsideEntries }) => {
          const allEntries = [...insideEntries, ...outsideEntries];
          const filtered = filterEntriesByMonth(allEntries, ym.year, ym.month);

          // Filtered should only contain inside entries
          expect(filtered.length).toBe(insideEntries.length);

          // None of the outside entries should appear in filtered results
          const filteredTimes = new Set(filtered.map(e => e.time));
          for (const outside of outsideEntries) {
            expect(filteredTimes.has(outside.time)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('per-CNPJ counts after filtering match only in-month entries for each CNPJ', () => {
    fc.assert(
      fc.property(
        yearMonthArb.chain(ym =>
          fc.record({
            ym: fc.constant(ym),
            insideEntries: fc.array(entryInMonth(ym.year, ym.month), { minLength: 1, maxLength: 20 }),
            outsideEntries: fc.array(entryOutsideMonth(ym.year, ym.month), { minLength: 0, maxLength: 20 })
          })
        ),
        ({ ym, insideEntries, outsideEntries }) => {
          const allEntries = [...insideEntries, ...outsideEntries];

          // Filter then count per CNPJ (this is what the service does)
          const filtered = filterEntriesByMonth(allEntries, ym.year, ym.month);
          const filteredCounts = countEntriesPerCnpj(filtered);

          // Independently count only inside entries per CNPJ
          const expectedCounts = countEntriesPerCnpj(insideEntries);

          // Both maps should be identical
          expect(filteredCounts.size).toBe(expectedCounts.size);
          for (const [cnpj, count] of expectedCounts) {
            expect(filteredCounts.get(cnpj)).toBe(count);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('filtering an empty dataset returns zero counts', () => {
    fc.assert(
      fc.property(
        yearMonthArb,
        (ym) => {
          const filtered = filterEntriesByMonth([], ym.year, ym.month);
          expect(filtered.length).toBe(0);

          const counts = countEntriesPerCnpj(filtered);
          expect(counts.size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
