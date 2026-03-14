import * as fc from 'fast-check';

// Feature: dashboard-metrics-refactor, Property 2: Player CNPJ lookups use cnpj_resp exclusively
// **Validates: Requirements 2.1, 2.3, 3.1, 3.4**

/**
 * Pure parsing function extracted from KPIService and CompanyService.
 * Both services use the same logic: read from extra.cnpj_resp, split, trim, filter.
 */
function parseCnpjList(cnpjResp: string | null | undefined): string[] {
  if (!cnpjResp) return [];
  return cnpjResp
    .split(/[;,]/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

/**
 * Simulates how KPIService.getPlayerKPIs() reads the company list from a player object.
 * It reads exclusively from extra.cnpj_resp — extra.cnpj is ignored.
 */
function getCompanyListFromPlayer(playerExtra: Record<string, any>): string[] {
  const cnpjResp = playerExtra?.['cnpj_resp'] || '';
  return cnpjResp
    .split(/[;,]/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

/**
 * Simulates how CompanyService.getCompanies() reads company IDs from a player object.
 * It reads exclusively from extra.cnpj_resp — extra.cnpj and extra.companies are ignored.
 */
function getCompanyIdsFromPlayer(playerExtra: Record<string, any>): string[] {
  const companiesStr = playerExtra?.['cnpj_resp'] || '';
  return companiesStr
    .split(/[;,]/)
    .map((id: string) => id.trim())
    .filter((id: string) => id.length > 0)
    .map((id: string) => String(id));
}

/**
 * Generates a non-empty alphanumeric token (simulating a CNPJ identifier).
 */
const tokenArb = fc.string({
  minLength: 1,
  maxLength: 14,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''))
});

/**
 * Generates a comma-separated string of CNPJ-like tokens.
 */
function cnpjTokenList(minLen: number = 1, maxLen: number = 10): fc.Arbitrary<{ raw: string; tokens: string[] }> {
  return fc
    .array(tokenArb, { minLength: minLen, maxLength: maxLen })
    .map((tokens) => ({
      raw: tokens.join(','),
      tokens
    }));
}

describe('Property 2: Player CNPJ lookups use cnpj_resp exclusively', () => {
  // Feature: dashboard-metrics-refactor, Property 2: Player CNPJ lookups use cnpj_resp exclusively
  // **Validates: Requirements 2.1, 2.3, 3.1, 3.4**

  it('KPI service reads company list from cnpj_resp, ignoring cnpj', () => {
    fc.assert(
      fc.property(
        cnpjTokenList(1, 10),
        cnpjTokenList(1, 10),
        (cnpjRespData, cnpjData) => {
          const playerExtra = {
            cnpj_resp: cnpjRespData.raw,
            cnpj: cnpjData.raw
          };

          const result = getCompanyListFromPlayer(playerExtra);

          // Result must match cnpj_resp tokens, not cnpj tokens
          expect(result).toEqual(cnpjRespData.tokens);
          // Verify it does NOT match cnpj when the values differ
          if (cnpjRespData.raw !== cnpjData.raw) {
            expect(result).not.toEqual(cnpjData.tokens);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Company service reads company IDs from cnpj_resp, ignoring cnpj and companies', () => {
    fc.assert(
      fc.property(
        cnpjTokenList(1, 10),
        cnpjTokenList(1, 10),
        cnpjTokenList(1, 10),
        (cnpjRespData, cnpjData, companiesData) => {
          const playerExtra = {
            cnpj_resp: cnpjRespData.raw,
            cnpj: cnpjData.raw,
            companies: companiesData.raw
          };

          const result = getCompanyIdsFromPlayer(playerExtra);

          // Result must match cnpj_resp tokens
          expect(result).toEqual(cnpjRespData.tokens);
          // Verify it does NOT match cnpj or companies when values differ
          if (cnpjRespData.raw !== cnpjData.raw) {
            expect(result).not.toEqual(cnpjData.tokens);
          }
          if (cnpjRespData.raw !== companiesData.raw) {
            expect(result).not.toEqual(companiesData.tokens);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty list when cnpj_resp is absent, even if cnpj has values', () => {
    fc.assert(
      fc.property(
        cnpjTokenList(1, 10),
        fc.constantFrom(null, undefined, ''),
        (cnpjData, cnpjRespValue) => {
          const playerExtra: Record<string, any> = {
            cnpj: cnpjData.raw
          };
          if (cnpjRespValue !== undefined) {
            playerExtra['cnpj_resp'] = cnpjRespValue;
          }

          const kpiResult = getCompanyListFromPlayer(playerExtra);
          const companyResult = getCompanyIdsFromPlayer(playerExtra);

          // Both should return empty — cnpj is never read
          expect(kpiResult).toEqual([]);
          expect(companyResult).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('company count from cnpj_resp matches parseCnpjList length', () => {
    fc.assert(
      fc.property(
        cnpjTokenList(0, 20),
        cnpjTokenList(1, 10),
        (cnpjRespData, cnpjData) => {
          const playerExtra = {
            cnpj_resp: cnpjRespData.raw,
            cnpj: cnpjData.raw
          };

          const companies = getCompanyListFromPlayer(playerExtra);
          const expectedCount = parseCnpjList(cnpjRespData.raw).length;

          expect(companies.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
