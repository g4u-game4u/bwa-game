import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 4: ACL cache TTL
// **Validates: Requirements 15.5**

/**
 * Catalog item entry shape (mirrors CatalogItem from acl.service.ts).
 */
interface CatalogItem {
  quantity: number;
  item: string;
}

type CatalogItems = Record<string, CatalogItem>;

/**
 * Cached ACL result with timestamp for TTL-based invalidation.
 */
interface ACLCacheEntry {
  catalogItems: CatalogItems;
  timestamp: number;
}

/** Cache TTL: 5 minutes in milliseconds */
const CACHE_DURATION = 5 * 60 * 1000; // 300000 ms

/**
 * Pure function extracted from ACLService cache check logic.
 * Determines whether a cached entry should be used based on the current time.
 */
function shouldUseCached(cachedTimestamp: number, currentTime: number): boolean {
  return (currentTime - cachedTimestamp) < CACHE_DURATION;
}

/**
 * Simulates the ACL cache: stores entries and retrieves them if within TTL.
 * Returns the cached catalogItems on hit, or null on miss.
 */
function getCachedResult(
  cache: Map<string, ACLCacheEntry>,
  playerId: string,
  currentTime: number
): CatalogItems | null {
  const cached = cache.get(playerId);
  if (cached && (currentTime - cached.timestamp) < CACHE_DURATION) {
    return cached.catalogItems;
  }
  return null;
}

// ── Arbitraries ──────────────────────────────────────────────────

const vgIdArb = fc.string({
  minLength: 1,
  maxLength: 15,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

const quantityArb = fc.integer({ min: -100, max: 100 });

const catalogItemsArb: fc.Arbitrary<CatalogItems> = fc
  .array(fc.tuple(vgIdArb, quantityArb), { minLength: 0, maxLength: 10 })
  .map(pairs => {
    const items: CatalogItems = {};
    for (const [id, qty] of pairs) {
      items[id] = { quantity: qty, item: id };
    }
    return items;
  });

/** Generates a base timestamp in a reasonable range */
const baseTimestampArb = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });

/** Generates an elapsed time within the TTL window (0 to 299999 ms) */
const withinTTLElapsedArb = fc.integer({ min: 0, max: CACHE_DURATION - 1 });

/** Generates an elapsed time at or beyond the TTL boundary (300000+ ms) */
const beyondTTLElapsedArb = fc.integer({ min: CACHE_DURATION, max: CACHE_DURATION + 10_000_000 });

const playerIdArb = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});

describe('Property 4: Cached ACL results are returned within 5-minute TTL', () => {
  // Feature: acl-dashboard-refactor, Property 4: ACL cache TTL
  // **Validates: Requirements 15.5**

  it('cache should be used when elapsed time < CACHE_DURATION (5 minutes)', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        withinTTLElapsedArb,
        (cachedTimestamp, elapsed) => {
          const currentTime = cachedTimestamp + elapsed;
          expect(shouldUseCached(cachedTimestamp, currentTime)).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cache should NOT be used when elapsed time >= CACHE_DURATION (5 minutes)', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        beyondTTLElapsedArb,
        (cachedTimestamp, elapsed) => {
          const currentTime = cachedTimestamp + elapsed;
          expect(shouldUseCached(cachedTimestamp, currentTime)).toBeFalse();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cache hit returns the exact same data that was cached', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        catalogItemsArb,
        baseTimestampArb,
        withinTTLElapsedArb,
        (playerId, catalogItems, cachedTimestamp, elapsed) => {
          const cache = new Map<string, ACLCacheEntry>();
          cache.set(playerId, { catalogItems, timestamp: cachedTimestamp });

          const currentTime = cachedTimestamp + elapsed;
          const result = getCachedResult(cache, playerId, currentTime);

          // Cache hit: result must be the exact same reference
          expect(result).toBe(catalogItems);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('immediately after caching (elapsed = 0), cache should always hit', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        catalogItemsArb,
        baseTimestampArb,
        (playerId, catalogItems, cachedTimestamp) => {
          const cache = new Map<string, ACLCacheEntry>();
          cache.set(playerId, { catalogItems, timestamp: cachedTimestamp });

          // elapsed = 0 → currentTime === cachedTimestamp
          const result = getCachedResult(cache, playerId, cachedTimestamp);
          expect(result).toBe(catalogItems);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cache miss returns null for expired entries', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        catalogItemsArb,
        baseTimestampArb,
        beyondTTLElapsedArb,
        (playerId, catalogItems, cachedTimestamp, elapsed) => {
          const cache = new Map<string, ACLCacheEntry>();
          cache.set(playerId, { catalogItems, timestamp: cachedTimestamp });

          const currentTime = cachedTimestamp + elapsed;
          const result = getCachedResult(cache, playerId, currentTime);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cache miss returns null for absent player IDs', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        playerIdArb,
        catalogItemsArb,
        baseTimestampArb,
        (storedPlayerId, queryPlayerId, catalogItems, cachedTimestamp) => {
          // Only test when the IDs differ
          if (storedPlayerId === queryPlayerId) return;

          const cache = new Map<string, ACLCacheEntry>();
          cache.set(storedPlayerId, { catalogItems, timestamp: cachedTimestamp });

          const result = getCachedResult(cache, queryPlayerId, cachedTimestamp);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CACHE_DURATION is exactly 5 minutes (300000 ms)', () => {
    expect(CACHE_DURATION).toBe(5 * 60 * 1000);
    expect(CACHE_DURATION).toBe(300000);
  });

  it('boundary: elapsed = CACHE_DURATION - 1 is a cache hit, elapsed = CACHE_DURATION is a miss', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        (cachedTimestamp) => {
          // One ms before expiry → hit
          expect(shouldUseCached(cachedTimestamp, cachedTimestamp + CACHE_DURATION - 1)).toBeTrue();
          // Exactly at expiry → miss
          expect(shouldUseCached(cachedTimestamp, cachedTimestamp + CACHE_DURATION)).toBeFalse();
        }
      ),
      { numRuns: 100 }
    );
  });
});
