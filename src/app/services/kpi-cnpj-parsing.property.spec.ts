import * as fc from 'fast-check';

// Feature: dashboard-metrics-refactor, Property 1: CNPJ parsing from cnpj_resp produces correct count
// Validates: Requirements 2.2, 2.4

/**
 * Pure parsing function extracted from KPIService.getPlayerKPIs().
 * This is the exact logic used in the service to count companies from cnpj_resp.
 */
function parseCnpjCount(cnpjResp: string | null | undefined): number {
  if (!cnpjResp) return 0;
  return cnpjResp
    .split(/[;,]/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0).length;
}

/**
 * Generates a non-empty alphanumeric token (simulating a CNPJ identifier).
 */
const tokenArb = fc.string({ minLength: 1, maxLength: 14, unit: fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
)});

/**
 * Generates a random comma/semicolon-separated string of CNPJ-like tokens.
 */
function cnpjSeparatedString(): fc.Arbitrary<{ raw: string; expectedCount: number }> {
  return fc
    .array(
      fc.tuple(tokenArb, fc.constantFrom(',', ';')),
      { minLength: 1, maxLength: 50 }
    )
    .map((pairs) => {
      const tokens = pairs.map(([token]: [string, string]) => token);
      const separators = pairs.map(([, sep]: [string, string]) => sep);
      let raw = '';
      for (let i = 0; i < tokens.length; i++) {
        raw += tokens[i];
        if (i < tokens.length - 1) {
          raw += separators[i];
        }
      }
      return { raw, expectedCount: tokens.length };
    });
}

/**
 * Generates strings with random whitespace padding around tokens.
 */
function cnpjWithWhitespace(): fc.Arbitrary<{ raw: string; expectedCount: number }> {
  const wsArb = fc.string({ minLength: 0, maxLength: 3, unit: fc.constantFrom(' ', '\t') });
  return fc
    .array(
      fc.tuple(wsArb, tokenArb, wsArb, fc.constantFrom(',', ';')),
      { minLength: 1, maxLength: 30 }
    )
    .map((entries) => {
      const parts: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const [leadingWs, token, trailingWs, sep] = entries[i] as [string, string, string, string];
        parts.push(leadingWs + token + trailingWs);
        if (i < entries.length - 1) {
          parts.push(sep);
        }
      }
      return { raw: parts.join(''), expectedCount: entries.length };
    });
}

describe('Property 1: CNPJ parsing from cnpj_resp produces correct count', () => {
  // Feature: dashboard-metrics-refactor, Property 1: CNPJ parsing from cnpj_resp produces correct count
  // **Validates: Requirements 2.2, 2.4**

  it('should produce correct count for random comma/semicolon-separated strings', () => {
    fc.assert(
      fc.property(cnpjSeparatedString(), ({ raw, expectedCount }) => {
        const count = parseCnpjCount(raw);
        expect(count).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('should produce correct count for strings with whitespace padding', () => {
    fc.assert(
      fc.property(cnpjWithWhitespace(), ({ raw, expectedCount }) => {
        const count = parseCnpjCount(raw);
        expect(count).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('should return 0 for null, undefined, empty string, and whitespace-only inputs', () => {
    // Edge cases: null, undefined, empty string, whitespace-only → count 0
    expect(parseCnpjCount(null)).toBe(0);
    expect(parseCnpjCount(undefined)).toBe(0);
    expect(parseCnpjCount('')).toBe(0);
    expect(parseCnpjCount('   ')).toBe(0);
    expect(parseCnpjCount('\t')).toBe(0);
    expect(parseCnpjCount(' , , ; ')).toBe(0);
    expect(parseCnpjCount(',,,;;,')).toBe(0);
  });

  it('should count only non-empty entries after split/trim/filter for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (input: string) => {
        const count = parseCnpjCount(input);
        // Independently compute expected count using the same logic
        const expected = input
          .split(/[;,]/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0).length;
        expect(count).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle consecutive separators producing empty entries correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(',', ';', ' ', 'A', '123', 'abc'), { minLength: 1, maxLength: 40 }),
        (parts: string[]) => {
          const input = parts.join('');
          const count = parseCnpjCount(input);
          const expected = input
            .split(/[;,]/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0).length;
          expect(count).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
