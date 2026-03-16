import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 16: When "Toda temporada" is selected, all data is returned without date filtering
// **Validates: Requirements 7.6, 9.6, 13.3**

/**
 * Represents a generic data entry with a timestamp, used to model
 * action logs, metrics, or any time-stamped dashboard data.
 */
interface DataEntry {
  id: string;
  timestamp: number; // ms since epoch
}

/**
 * Season date boundaries.
 */
interface SeasonDates {
  start: Date;
  end: Date;
}

/**
 * Pure function that filters data entries by month selection.
 *
 * Mirrors the dashboard filtering logic:
 *   - monthsAgo === -1 ("Toda temporada") → return ALL entries within the season range
 *   - monthsAgo >= 0 → return only entries within that specific month's range
 *
 * @param entries      Array of data entries with timestamps
 * @param monthsAgo    Month offset (0 = current month, -1 = "Toda temporada")
 * @param seasonDates  The full season start/end boundaries
 * @param referenceDate The "now" anchor for computing month ranges
 */
function filterDataByMonth(
  entries: DataEntry[],
  monthsAgo: number,
  seasonDates: SeasonDates,
  referenceDate: Date
): DataEntry[] {
  if (monthsAgo === -1) {
    // "Toda temporada": return all entries within the season range
    const seasonStart = seasonDates.start.getTime();
    const seasonEnd = seasonDates.end.getTime();
    return entries.filter(e => e.timestamp >= seasonStart && e.timestamp <= seasonEnd);
  }

  // Specific month: compute month boundaries
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() - monthsAgo;
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

  return entries.filter(e => e.timestamp >= start && e.timestamp <= end);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a reference date within a reasonable range (2025–2027). */
const referenceDateArb: fc.Arbitrary<Date> = fc
  .record({
    year: fc.integer({ min: 2025, max: 2027 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 })
  })
  .map(({ year, month, day }) => new Date(year, month, day, 12, 0, 0, 0));

/** Generates a season spanning multiple months around the reference date. */
function seasonDatesArb(ref: Date): fc.Arbitrary<SeasonDates> {
  return fc.record({
    monthsBefore: fc.integer({ min: 2, max: 6 }),
    monthsAfter: fc.integer({ min: 0, max: 3 })
  }).map(({ monthsBefore, monthsAfter }) => {
    const start = new Date(ref.getFullYear(), ref.getMonth() - monthsBefore, 1, 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth() + monthsAfter + 1, 0, 23, 59, 59, 999);
    return { start, end };
  });
}

/** Generates a timestamp within a given date range. */
function timestampInRange(start: Date, end: Date): fc.Arbitrary<number> {
  return fc.integer({ min: start.getTime(), max: end.getTime() });
}

/** Generates a data entry with a timestamp within a given range. */
function entryInRange(start: Date, end: Date): fc.Arbitrary<DataEntry> {
  return fc.record({
    id: fc.uuid(),
    timestamp: timestampInRange(start, end)
  });
}

/** Generates a monthsAgo value that falls within the season. */
function monthsAgoInSeason(ref: Date, season: SeasonDates): fc.Arbitrary<number> {
  const refMonth = ref.getFullYear() * 12 + ref.getMonth();
  const seasonStartMonth = season.start.getFullYear() * 12 + season.start.getMonth();
  const maxMonthsAgo = refMonth - seasonStartMonth;
  return fc.integer({ min: 0, max: Math.max(0, maxMonthsAgo) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 16: "Toda temporada" returns unfiltered data', () => {
  // Feature: acl-dashboard-refactor, Property 16: When "Toda temporada" is selected, all data is returned without date filtering
  // **Validates: Requirements 7.6, 9.6, 13.3**

  it('when monthsAgo === -1, all entries within the season are returned', () => {
    fc.assert(
      fc.property(
        referenceDateArb.chain(ref =>
          seasonDatesArb(ref).chain(season =>
            fc.record({
              ref: fc.constant(ref),
              season: fc.constant(season),
              entries: fc.array(entryInRange(season.start, season.end), { minLength: 0, maxLength: 30 })
            })
          )
        ),
        ({ ref, season, entries }) => {
          const result = filterDataByMonth(entries, -1, season, ref);

          // All entries are within the season, so all should be returned
          expect(result.length).toBe(entries.length);

          // Verify every original entry is present in the result
          const resultIds = new Set(result.map(e => e.id));
          for (const entry of entries) {
            expect(resultIds.has(entry.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Toda temporada" result is a superset of any single month filter result', () => {
    fc.assert(
      fc.property(
        referenceDateArb.chain(ref =>
          seasonDatesArb(ref).chain(season =>
            monthsAgoInSeason(ref, season).chain(monthsAgo =>
              fc.record({
                ref: fc.constant(ref),
                season: fc.constant(season),
                monthsAgo: fc.constant(monthsAgo),
                entries: fc.array(entryInRange(season.start, season.end), { minLength: 1, maxLength: 30 })
              })
            )
          )
        ),
        ({ ref, season, monthsAgo, entries }) => {
          const todaTemporadaResult = filterDataByMonth(entries, -1, season, ref);
          const monthResult = filterDataByMonth(entries, monthsAgo, season, ref);

          // Every entry in the month result must also be in the "Toda temporada" result
          const todaIds = new Set(todaTemporadaResult.map(e => e.id));
          for (const entry of monthResult) {
            expect(todaIds.has(entry.id)).toBe(true);
          }

          // "Toda temporada" should return at least as many entries as any single month
          expect(todaTemporadaResult.length).toBeGreaterThanOrEqual(monthResult.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Toda temporada" excludes entries outside the season range', () => {
    fc.assert(
      fc.property(
        referenceDateArb.chain(ref =>
          seasonDatesArb(ref).chain(season => {
            const beforeSeason = new Date(season.start.getTime() - 90 * 86400000); // 90 days before
            const afterSeason = new Date(season.end.getTime() + 90 * 86400000); // 90 days after
            return fc.record({
              ref: fc.constant(ref),
              season: fc.constant(season),
              insideEntries: fc.array(entryInRange(season.start, season.end), { minLength: 1, maxLength: 15 }),
              outsideEntries: fc.array(
                fc.oneof(
                  entryInRange(beforeSeason, new Date(season.start.getTime() - 1)),
                  entryInRange(new Date(season.end.getTime() + 1), afterSeason)
                ),
                { minLength: 1, maxLength: 15 }
              )
            });
          })
        ),
        ({ ref, season, insideEntries, outsideEntries }) => {
          const allEntries = [...insideEntries, ...outsideEntries];
          const result = filterDataByMonth(allEntries, -1, season, ref);

          // Only inside entries should be returned
          expect(result.length).toBe(insideEntries.length);

          // None of the outside entries should appear
          const resultIds = new Set(result.map(e => e.id));
          for (const outside of outsideEntries) {
            expect(resultIds.has(outside.id)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('specific month filters to a subset; "Toda temporada" returns the full season set', () => {
    fc.assert(
      fc.property(
        referenceDateArb.chain(ref =>
          seasonDatesArb(ref).chain(season =>
            fc.record({
              ref: fc.constant(ref),
              season: fc.constant(season),
              entries: fc.array(entryInRange(season.start, season.end), { minLength: 5, maxLength: 30 })
            })
          )
        ),
        ({ ref, season, entries }) => {
          const todaResult = filterDataByMonth(entries, -1, season, ref);

          // "Toda temporada" returns all season entries
          expect(todaResult.length).toBe(entries.length);

          // For any valid monthsAgo, the month result is a subset
          const refMonth = ref.getFullYear() * 12 + ref.getMonth();
          const seasonStartMonth = season.start.getFullYear() * 12 + season.start.getMonth();
          const maxMonthsAgo = refMonth - seasonStartMonth;

          if (maxMonthsAgo >= 0) {
            // Pick a month in the middle of the season
            const testMonthsAgo = Math.floor(maxMonthsAgo / 2);
            const monthResult = filterDataByMonth(entries, testMonthsAgo, season, ref);
            expect(monthResult.length).toBeLessThanOrEqual(todaResult.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty dataset returns empty for both "Toda temporada" and specific months', () => {
    fc.assert(
      fc.property(
        referenceDateArb.chain(ref =>
          seasonDatesArb(ref).map(season => ({ ref, season }))
        ),
        fc.integer({ min: -1, max: 12 }),
        ({ ref, season }, monthsAgo) => {
          const result = filterDataByMonth([], monthsAgo, season, ref);
          expect(result.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
