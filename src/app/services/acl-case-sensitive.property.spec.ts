import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 3: Case-sensitive Virtual Good ID matching
// **Validates: Requirements 1.5**

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
 * Generates a random alphanumeric ID with mixed case.
 */
const mixedCaseIdArb = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

/**
 * Given an ID, produce a case-varied version that differs in at least one character's case.
 * If the ID has no alphabetic characters, appends a random letter to force a difference.
 */
function varyCaseArb(original: string): fc.Arbitrary<string> {
  return fc.constantFrom('upper', 'lower', 'swap').map(strategy => {
    let varied: string;
    switch (strategy) {
      case 'upper':
        varied = original.toUpperCase();
        break;
      case 'lower':
        varied = original.toLowerCase();
        break;
      case 'swap':
        varied = original
          .split('')
          .map(ch => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()))
          .join('');
        break;
      default:
        varied = original;
    }
    // If the variation is identical to the original (e.g. all digits), force a difference
    if (varied === original) {
      varied = original + 'X';
    }
    return varied;
  });
}

describe('Property 3: Case-sensitive Virtual Good ID matching', () => {
  // Feature: acl-dashboard-refactor, Property 3: Case-sensitive Virtual Good ID matching
  // **Validates: Requirements 1.5**

  it('only exact case match grants access via checkAccess', () => {
    fc.assert(
      fc.property(
        mixedCaseIdArb,
        fc.integer({ min: 1, max: 100 }),
        (originalId, quantity) => {
          // Build catalog with the original ID having positive quantity
          const catalogItems: CatalogItems = {
            [originalId]: { quantity, item: originalId }
          };

          // Exact match must grant access
          expect(checkAccess(catalogItems, originalId)).toBeTrue();

          // Case-varied versions that differ from the original must NOT grant access
          const variations = [
            originalId.toUpperCase(),
            originalId.toLowerCase(),
            originalId.split('').map(ch =>
              ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()
            ).join('')
          ];

          for (const varied of variations) {
            if (varied !== originalId) {
              expect(checkAccess(catalogItems, varied)).toBeFalse();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('only exact case match appears in extractAccessibleIds', () => {
    fc.assert(
      fc.property(
        mixedCaseIdArb,
        fc.integer({ min: 1, max: 100 }),
        (originalId, quantity) => {
          const catalogItems: CatalogItems = {
            [originalId]: { quantity, item: originalId }
          };

          const accessibleIds = extractAccessibleIds(catalogItems);

          // The original ID must be accessible
          expect(accessibleIds).toContain(originalId);

          // Case-varied versions that differ must NOT be in the list
          const variations = [
            originalId.toUpperCase(),
            originalId.toLowerCase(),
            originalId.split('').map(ch =>
              ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()
            ).join('')
          ];

          for (const varied of variations) {
            if (varied !== originalId) {
              expect(accessibleIds).not.toContain(varied);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('case-varied IDs stored separately are independent entries', () => {
    fc.assert(
      fc.property(
        mixedCaseIdArb.filter(id => id !== id.toUpperCase() || id !== id.toLowerCase()),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: -100, max: 0 }),
        (baseId, posQty, nonPosQty) => {
          const upperId = baseId.toUpperCase();
          const lowerId = baseId.toLowerCase();

          // Skip if upper and lower are the same (all digits)
          if (upperId === lowerId) return;

          // Store upper with positive quantity, lower with non-positive
          const catalogItems: CatalogItems = {
            [upperId]: { quantity: posQty, item: upperId },
            [lowerId]: { quantity: nonPosQty, item: lowerId }
          };

          // Upper should have access, lower should not
          expect(checkAccess(catalogItems, upperId)).toBeTrue();
          expect(checkAccess(catalogItems, lowerId)).toBeFalse();

          const accessibleIds = extractAccessibleIds(catalogItems);
          expect(accessibleIds).toContain(upperId);
          expect(accessibleIds).not.toContain(lowerId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generated case variations never match original when they differ', () => {
    fc.assert(
      fc.property(
        mixedCaseIdArb,
        (originalId) => {
          // Build catalog with the original ID
          const catalogItems: CatalogItems = {
            [originalId]: { quantity: 5, item: originalId }
          };

          // Use the varyCaseArb-style logic inline
          const strategies = ['upper', 'lower', 'swap'] as const;
          for (const strategy of strategies) {
            let varied: string;
            switch (strategy) {
              case 'upper':
                varied = originalId.toUpperCase();
                break;
              case 'lower':
                varied = originalId.toLowerCase();
                break;
              case 'swap':
                varied = originalId
                  .split('')
                  .map(ch => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()))
                  .join('');
                break;
            }

            if (varied !== originalId) {
              // Different case → no access
              expect(checkAccess(catalogItems, varied)).toBeFalse();
            } else {
              // Same string → access granted
              expect(checkAccess(catalogItems, varied)).toBeTrue();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
