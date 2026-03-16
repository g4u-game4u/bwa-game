import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 10: Dashboard shows only teams where user has Virtual Good quantity > 0
// **Validates: Requirements 4.3, 4.4**

/**
 * Catalog item entry shape (mirrors CatalogItem from acl.service.ts).
 */
interface CatalogItem {
  quantity: number;
  item: string;
}

type CatalogItems = Record<string, CatalogItem>;

/**
 * Represents a team available in the system.
 */
interface Team {
  id: string;
  name: string;
}

/**
 * Pure function: extract accessible team IDs from catalog_items.
 * Mirrors ACLService.extractAccessibleIds() — returns IDs where quantity > 0.
 */
function extractAccessibleIds(catalogItems: CatalogItems): string[] {
  return Object.keys(catalogItems).filter(id => {
    const entry = catalogItems[id];
    return entry && typeof entry.quantity === 'number' && entry.quantity > 0;
  });
}

/**
 * Pure function: filter a list of all available teams to only those
 * the user has Virtual Good access to (quantity > 0).
 * This mirrors the filtering logic in team-management-dashboard's loadAvailableTeams().
 */
function filterVisibleTeams(allTeams: Team[], catalogItems: CatalogItems): Team[] {
  const accessibleIds = extractAccessibleIds(catalogItems);
  return allTeams.filter(team => accessibleIds.includes(team.id));
}

// ── Arbitraries ──────────────────────────────────────────────────

/**
 * Generates a random alphanumeric team/Virtual Good ID.
 */
const teamIdArb = fc.string({
  minLength: 1,
  maxLength: 15,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

/**
 * Generates a random integer quantity (positive, zero, or negative).
 */
const quantityArb = fc.integer({ min: -100, max: 100 });

/**
 * Generates a random catalog_items object with 0–20 entries.
 * IDs are unique (last write wins for duplicates in the tuple array).
 */
const catalogItemsArb: fc.Arbitrary<CatalogItems> = fc
  .array(
    fc.tuple(teamIdArb, quantityArb),
    { minLength: 0, maxLength: 20 }
  )
  .map(pairs => {
    const items: CatalogItems = {};
    for (const [id, qty] of pairs) {
      items[id] = { quantity: qty, item: id };
    }
    return items;
  });

/**
 * Generates a list of all available teams. Some IDs may overlap with
 * catalog_items keys (accessible), some may not (inaccessible).
 */
function allTeamsArb(extraIds: string[]): fc.Arbitrary<Team[]> {
  return fc
    .array(teamIdArb, { minLength: 0, maxLength: 10 })
    .map(randomIds => {
      const combined = [...new Set([...extraIds, ...randomIds])];
      return combined.map(id => ({ id, name: `Team ${id}` }));
    });
}

/**
 * Generates a combined scenario: catalog_items + all available teams.
 * Ensures some teams exist in catalog_items and some don't.
 */
const scenarioArb = catalogItemsArb.chain(catalogItems => {
  const catalogIds = Object.keys(catalogItems);
  return allTeamsArb(catalogIds).map(allTeams => ({
    catalogItems,
    allTeams
  }));
});

describe('Property 10: Dashboard shows only teams where user has Virtual Good quantity > 0', () => {
  // Feature: acl-dashboard-refactor, Property 10: Dashboard shows only teams where user has Virtual Good quantity > 0
  // **Validates: Requirements 4.3, 4.4**

  it('visible teams are exactly those with quantity > 0 in catalog_items', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalogItems, allTeams }) => {
        const visibleTeams = filterVisibleTeams(allTeams, catalogItems);
        const visibleIds = visibleTeams.map(t => t.id);

        // Every visible team must have quantity > 0 in catalog_items
        for (const team of visibleTeams) {
          const entry = catalogItems[team.id];
          expect(entry).toBeDefined();
          expect(entry.quantity).toBeGreaterThan(0);
        }

        // Every team with quantity > 0 that exists in allTeams must be visible
        for (const team of allTeams) {
          const entry = catalogItems[team.id];
          if (entry && entry.quantity > 0) {
            expect(visibleIds).toContain(team.id);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('teams with quantity <= 0 are never visible', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalogItems, allTeams }) => {
        const visibleTeams = filterVisibleTeams(allTeams, catalogItems);
        const visibleIds = new Set(visibleTeams.map(t => t.id));

        for (const team of allTeams) {
          const entry = catalogItems[team.id];
          if (!entry || entry.quantity <= 0) {
            expect(visibleIds.has(team.id)).toBeFalse();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('teams not in catalog_items are never visible', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalogItems, allTeams }) => {
        const visibleTeams = filterVisibleTeams(allTeams, catalogItems);
        const visibleIds = new Set(visibleTeams.map(t => t.id));

        for (const team of allTeams) {
          if (!(team.id in catalogItems)) {
            expect(visibleIds.has(team.id)).toBeFalse();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('visible team count equals count of allTeams entries with quantity > 0', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalogItems, allTeams }) => {
        const visibleTeams = filterVisibleTeams(allTeams, catalogItems);

        const expectedCount = allTeams.filter(team => {
          const entry = catalogItems[team.id];
          return entry && entry.quantity > 0;
        }).length;

        expect(visibleTeams.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('empty catalog_items yields no visible teams', () => {
    fc.assert(
      fc.property(
        fc.array(
          teamIdArb.map(id => ({ id, name: `Team ${id}` })),
          { minLength: 0, maxLength: 10 }
        ),
        (allTeams: Team[]) => {
          const visibleTeams = filterVisibleTeams(allTeams, {});
          expect(visibleTeams.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all-positive quantities make all matching teams visible', () => {
    fc.assert(
      fc.property(
        fc.array(teamIdArb, { minLength: 1, maxLength: 10 }).chain(ids => {
          const uniqueIds = [...new Set(ids)];
          const catalogItems: CatalogItems = {};
          const allTeams: Team[] = uniqueIds.map(id => {
            catalogItems[id] = { quantity: 1, item: id };
            return { id, name: `Team ${id}` };
          });
          return fc.constant({ catalogItems, allTeams });
        }),
        ({ catalogItems, allTeams }) => {
          const visibleTeams = filterVisibleTeams(allTeams, catalogItems);
          expect(visibleTeams.length).toBe(allTeams.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
