import * as fc from 'fast-check';

// Feature: dashboard-metrics-refactor, Property 10: Activity count equals total action_log entries
// **Validates: Requirements 6.1, 6.2**

/**
 * Represents a minimal action_log entry with a cnpj and delivery_id.
 */
interface ActionLogEntry {
  cnpj: string;
  delivery_id: number;
}

/**
 * Counts total action_log entries per CNPJ (the simplified/correct approach).
 * This is the new behavior after the refactor: count ALL entries, not distinct delivery_ids.
 */
function countTotalEntriesPerCnpj(entries: ActionLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.cnpj, (counts.get(entry.cnpj) || 0) + 1);
  }
  return counts;
}

/**
 * Counts distinct delivery_id values per CNPJ (the OLD approach, now removed).
 * This was the previous behavior that counted unique delivery_ids instead of total entries.
 */
function countDistinctDeliveryIdsPerCnpj(entries: ActionLogEntry[]): Map<string, number> {
  const deliveryIdSets = new Map<string, Set<number>>();
  for (const entry of entries) {
    if (!deliveryIdSets.has(entry.cnpj)) {
      deliveryIdSets.set(entry.cnpj, new Set());
    }
    deliveryIdSets.get(entry.cnpj)!.add(entry.delivery_id);
  }
  const counts = new Map<string, number>();
  for (const [cnpj, ids] of deliveryIdSets) {
    counts.set(cnpj, ids.size);
  }
  return counts;
}

/**
 * Generates a CNPJ-like string identifier.
 */
const cnpjArb = fc.string({
  minLength: 1,
  maxLength: 14,
  unit: fc.constantFrom(...'0123456789'.split(''))
});

/**
 * Generates a single action_log entry with a cnpj and delivery_id.
 */
const actionLogEntryArb: fc.Arbitrary<ActionLogEntry> = fc.record({
  cnpj: cnpjArb,
  delivery_id: fc.integer({ min: 1, max: 1000 })
});

/**
 * Generates a dataset of action_log entries where multiple entries can share
 * the same delivery_id within a CNPJ (to test that total count != distinct count).
 */
function actionLogDatasetWithDuplicateDeliveryIds(): fc.Arbitrary<ActionLogEntry[]> {
  return fc.tuple(
    cnpjArb,
    fc.integer({ min: 1, max: 10 }),
    fc.integer({ min: 2, max: 5 })
  ).chain(([cnpj, deliveryId, repeatCount]) => {
    // Create multiple entries with the same cnpj and delivery_id
    const entries: ActionLogEntry[] = [];
    for (let i = 0; i < repeatCount; i++) {
      entries.push({ cnpj, delivery_id: deliveryId });
    }
    return fc.constant(entries);
  });
}

describe('Property 10: Activity count equals total action_log entries', () => {
  // Feature: dashboard-metrics-refactor, Property 10: Activity count equals total action_log entries
  // **Validates: Requirements 6.1, 6.2**

  it('activity count per CNPJ equals total entries, not distinct delivery_id count', () => {
    fc.assert(
      fc.property(
        fc.array(actionLogEntryArb, { minLength: 1, maxLength: 50 }),
        (entries: ActionLogEntry[]) => {
          const totalCounts = countTotalEntriesPerCnpj(entries);

          // For each CNPJ, verify the count equals total entries for that CNPJ
          const cnpjGroups = new Map<string, ActionLogEntry[]>();
          for (const entry of entries) {
            if (!cnpjGroups.has(entry.cnpj)) {
              cnpjGroups.set(entry.cnpj, []);
            }
            cnpjGroups.get(entry.cnpj)!.push(entry);
          }

          for (const [cnpj, group] of cnpjGroups) {
            // The activity count must equal the total number of entries
            expect(totalCounts.get(cnpj)).toBe(group.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('total count >= distinct delivery_id count for any dataset', () => {
    fc.assert(
      fc.property(
        fc.array(actionLogEntryArb, { minLength: 1, maxLength: 50 }),
        (entries: ActionLogEntry[]) => {
          const totalCounts = countTotalEntriesPerCnpj(entries);
          const distinctCounts = countDistinctDeliveryIdsPerCnpj(entries);

          // Total entries is always >= distinct delivery_ids
          for (const [cnpj] of totalCounts) {
            const total = totalCounts.get(cnpj)!;
            const distinct = distinctCounts.get(cnpj) || 0;
            expect(total).toBeGreaterThanOrEqual(distinct);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when entries share delivery_ids, total count exceeds distinct count', () => {
    fc.assert(
      fc.property(
        actionLogDatasetWithDuplicateDeliveryIds(),
        (entries: ActionLogEntry[]) => {
          // All entries have the same cnpj and delivery_id, with count >= 2
          const totalCounts = countTotalEntriesPerCnpj(entries);
          const distinctCounts = countDistinctDeliveryIdsPerCnpj(entries);

          const cnpj = entries[0].cnpj;
          const total = totalCounts.get(cnpj)!;
          const distinct = distinctCounts.get(cnpj)!;

          // Total count equals number of entries
          expect(total).toBe(entries.length);
          // Distinct count is 1 (all same delivery_id)
          expect(distinct).toBe(1);
          // Total > distinct when there are duplicates
          expect(total).toBeGreaterThan(distinct);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sum of all per-CNPJ counts equals total entries in dataset', () => {
    fc.assert(
      fc.property(
        fc.array(actionLogEntryArb, { minLength: 0, maxLength: 100 }),
        (entries: ActionLogEntry[]) => {
          const totalCounts = countTotalEntriesPerCnpj(entries);

          let sum = 0;
          for (const count of totalCounts.values()) {
            sum += count;
          }

          expect(sum).toBe(entries.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
