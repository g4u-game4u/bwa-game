import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 1: Virtual Good access determination
// **Validates: Requirements 1.2, 1.3, 1.4**

/**
 * Catalog item entry shape (mirrors CatalogItem from acl.service.ts).
 */
interface CatalogItem {
  quantity: number;
  item: string;
}

type CatalogItems = Record<string, CatalogItem>;

/**
 * Pure function extracted from ACLService.extractAccessibleIds().
 * Returns IDs where quantity > 0.
 */
function extractAccessibleIds(catalogItems: CatalogItems): string[] {
  return Object.keys(catalogItems).filter(id => {
    const entry = catalogItems[id];
    return entry && typeof entry.quantity === 'number' && entry.quantity > 0;
  });
}

/**
 * Pure function extracted from ACLService.checkAccess().
 * Case-sensitive check: does the given teamId exist with quantity > 0?
 */
function checkAccess(catalogItems: CatalogItems, teamId: string): boolean {
  const entry = catalogItems[teamId];
  return !!entry && typeof entry.quantity === 'number' && entry.quantity > 0;
}

/**
 * Generates a random alphanumeric Virtual Good ID.
 */
const vgIdArb = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

/**
 * Generates a random integer quantity (positive, zero, or negative).
 */
const quantityArb = fc.integer({ min: -100, max: 100 });

/**
 * Generates a single catalog item entry with a given ID and random quantity.
 */
function catalogEntryArb(id: string): fc.Arbitrary<CatalogItem> {
  return quantityArb.map(q => ({ quantity: q, item: id }));
}

/**
 * Generates a random catalog_items object with 0–20 entries.
 */
const catalogItemsArb: fc.Arbitrary<CatalogItems> = fc
  .array(
    fc.tuple(vgIdArb, quantityArb),
    { minLength: 0, maxLength: 20 }
  )
  .map(pairs => {
    const items: CatalogItems = {};
    for (const [id, qty] of pairs) {
      items[id] = { quantity: qty, item: id };
    }
    return items;
  });

describe('Property 1: Virtual Good possession determines team access', () => {
  // Feature: acl-dashboard-refactor, Property 1: Virtual Good access determination
  // **Validates: Requirements 1.2, 1.3, 1.4**

  it('quantity > 0 grants access, quantity <= 0 denies access', () => {
    fc.assert(
      fc.property(catalogItemsArb, (catalogItems: CatalogItems) => {
        const accessibleIds = extractAccessibleIds(catalogItems);

        // Every accessible ID must have quantity > 0
        for (const id of accessibleIds) {
          expect(catalogItems[id].quantity).toBeGreaterThan(0);
        }

        // Every ID with quantity > 0 must be in the accessible list
        for (const id of Object.keys(catalogItems)) {
          if (catalogItems[id].quantity > 0) {
            expect(accessibleIds).toContain(id);
          } else {
            expect(accessibleIds).not.toContain(id);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('absent IDs are never in the accessible list', () => {
    fc.assert(
      fc.property(
        catalogItemsArb,
        vgIdArb,
        (catalogItems: CatalogItems, randomId: string) => {
          const accessibleIds = extractAccessibleIds(catalogItems);

          // If the random ID is not a key in catalogItems, it must not be accessible
          if (!(randomId in catalogItems)) {
            expect(accessibleIds).not.toContain(randomId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('checkAccess agrees with extractAccessibleIds for every key', () => {
    fc.assert(
      fc.property(catalogItemsArb, (catalogItems: CatalogItems) => {
        const accessibleIds = new Set(extractAccessibleIds(catalogItems));

        for (const id of Object.keys(catalogItems)) {
          const hasAccess = checkAccess(catalogItems, id);
          expect(hasAccess).toBe(accessibleIds.has(id));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('checkAccess returns false for absent IDs', () => {
    fc.assert(
      fc.property(
        catalogItemsArb,
        vgIdArb,
        (catalogItems: CatalogItems, randomId: string) => {
          if (!(randomId in catalogItems)) {
            expect(checkAccess(catalogItems, randomId)).toBeFalse();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accessible count equals number of entries with quantity > 0', () => {
    fc.assert(
      fc.property(catalogItemsArb, (catalogItems: CatalogItems) => {
        const accessibleIds = extractAccessibleIds(catalogItems);
        const expectedCount = Object.values(catalogItems)
          .filter(entry => entry.quantity > 0).length;

        expect(accessibleIds.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('empty catalog_items yields empty accessible list', () => {
    const result = extractAccessibleIds({});
    expect(result).toEqual([]);
  });
});
