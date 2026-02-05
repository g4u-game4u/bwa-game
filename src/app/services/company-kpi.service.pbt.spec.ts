import { TestBed } from '@angular/core/testing';
import { CompanyKpiService, CnpjKpiData, CompanyDisplay } from './company-kpi.service';
import { FunifierApiService } from './funifier-api.service';
import * as fc from 'fast-check';
import { of } from 'rxjs';

/**
 * Property-Based Tests for CompanyKpiService
 * 
 * These tests verify universal properties that should hold for all inputs,
 * using fast-check to generate random test cases.
 * 
 * Focus: CNPJ ID extraction correctness and deterministic behavior
 */
describe('CompanyKpiService Property-Based Tests', () => {
  let service: CompanyKpiService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['post']);

    TestBed.configureTestingModule({
      providers: [
        CompanyKpiService,
        { provide: FunifierApiService, useValue: apiSpy }
      ]
    });

    service = TestBed.inject(CompanyKpiService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
  });

  /**
   * Property 1: CNPJ ID Extraction Idempotency
   * **Validates: Requirements 2.1**
   * 
   * For any CNPJ string, extracting the ID multiple times should always
   * return the same result. The extraction function is idempotent.
   */
  describe('Property 1: CNPJ ID Extraction Idempotency', () => {
    it('should return the same result when called multiple times with the same input', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (cnpjString) => {
            const result1 = service.extractCnpjId(cnpjString);
            const result2 = service.extractCnpjId(cnpjString);
            const result3 = service.extractCnpjId(cnpjString);

            expect(result1).toEqual(result2);
            expect(result2).toEqual(result3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent for valid CNPJ format strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // company name
          fc.string({ minLength: 1, maxLength: 10 }), // code
          fc.string({ minLength: 1, maxLength: 20 }), // id
          fc.string({ minLength: 1, maxLength: 20 }), // suffix
          (name, code, id, suffix) => {
            const cnpj = `${name} l ${code} [${id}|${suffix}]`;
            
            const result1 = service.extractCnpjId(cnpj);
            const result2 = service.extractCnpjId(cnpj);

            expect(result1).toEqual(result2);
            expect(result1).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent for invalid format strings', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (invalidCnpj) => {
            // Filter out strings that accidentally match the valid format
            fc.pre(!invalidCnpj.match(/\[([^\|]+)\|/));

            const result1 = service.extractCnpjId(invalidCnpj);
            const result2 = service.extractCnpjId(invalidCnpj);

            expect(result1).toEqual(result2);
            expect(result1).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: CNPJ ID Extraction Determinism
   * **Validates: Requirements 2.1, 2.2**
   * 
   * For any valid CNPJ string with format "[ID|...]", extraction should
   * always return the ID between [ and |. The extraction is deterministic.
   */
  describe('Property 2: CNPJ ID Extraction Determinism', () => {
    it('should always extract the ID between [ and | for valid format', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // prefix
          fc.string({ minLength: 1, maxLength: 20 }), // id
          fc.string({ minLength: 1, maxLength: 20 }), // suffix
          (prefix, id, suffix) => {
            const cnpj = `${prefix}[${id}|${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract ID correctly regardless of prefix content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }), // any prefix
          fc.string({ minLength: 1, maxLength: 20 }), // id
          fc.string({ minLength: 1, maxLength: 20 }), // suffix
          (prefix, id, suffix) => {
            const cnpj = `${prefix}[${id}|${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract ID correctly regardless of suffix content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // prefix
          fc.string({ minLength: 1, maxLength: 20 }), // id
          fc.string({ minLength: 0, maxLength: 100 }), // any suffix
          (prefix, id, suffix) => {
            const cnpj = `${prefix}[${id}|${suffix}`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle IDs with various character types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: 1, max: 999999 }).map(n => n.toString()), // numeric
            fc.string({ minLength: 1, maxLength: 20 }), // alphanumeric
            fc.string({ minLength: 1, maxLength: 20 }), // any string
          ),
          (id: string) => {
            const cnpj = `COMPANY l CODE [${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trim whitespace from extracted ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }), // id
          fc.integer({ min: 0, max: 5 }), // leading spaces
          fc.integer({ min: 0, max: 5 }), // trailing spaces
          (id, leadingSpaces, trailingSpaces) => {
            const paddedId = ' '.repeat(leadingSpaces) + id + ' '.repeat(trailingSpaces);
            const cnpj = `COMPANY l CODE [${paddedId}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: CNPJ ID Extraction Format Validation
   * **Validates: Requirements 2.1, 2.4**
   * 
   * For any string that doesn't match the expected format "[ID|...]",
   * extraction should consistently return null. Invalid formats are
   * handled gracefully.
   */
  describe('Property 3: CNPJ ID Extraction Format Validation', () => {
    it('should return null for strings without opening bracket', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (id, suffix) => {
            // String without opening bracket
            const cnpj = `COMPANY l CODE ${id}|${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for strings without pipe separator', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (id, suffix) => {
            // String without pipe separator
            const cnpj = `COMPANY l CODE [${id}-${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for null, undefined, or non-string inputs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.boolean(),
            fc.object(),
            fc.array(fc.string())
          ),
          (invalidInput) => {
            const result = service.extractCnpjId(invalidInput as any);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string for empty brackets with pipe', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }), // prefix
          fc.string({ minLength: 0, maxLength: 20 }), // suffix
          (prefix, suffix) => {
            const cnpj = `${prefix}[|${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            // Empty string between [ and | should return empty string after trim
            expect(result).toBe('');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle strings with multiple bracket-pipe patterns', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }), // first id
          fc.string({ minLength: 1, maxLength: 20 }), // second id
          (id1, id2) => {
            // String with multiple patterns - should extract first match
            const cnpj = `PREFIX [${id1}|SUFFIX1] [${id2}|SUFFIX2]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id1.trim());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Extraction Consistency Across Real-World Formats
   * **Validates: Requirements 2.1, 2.2**
   * 
   * For CNPJ strings that match the real-world format from action_log,
   * extraction should consistently return the correct ID.
   */
  describe('Property 4: Extraction Consistency Across Real-World Formats', () => {
    it('should extract ID from realistic CNPJ strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 50 }).map(s => s.toUpperCase()), // company name
          fc.integer({ min: 1, max: 9999 }).map(n => n.toString().padStart(4, '0')), // code
          fc.integer({ min: 1000, max: 9999 }).map(n => n.toString()), // id
          fc.string({ minLength: 7, maxLength: 7 }), // suffix like "0001-60"
          (companyName, code, id, suffix) => {
            const cnpj = `${companyName} l ${code} [${id}|${suffix}]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle company names with special characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // base name
          fc.constantFrom(' & ', ' - ', ' / ', ' . ', ' (', ')'), // special char
          fc.integer({ min: 1000, max: 9999 }).map(n => n.toString()), // id
          (baseName, specialChar, id) => {
            const companyName = `${baseName}${specialChar}COMPANY`;
            const cnpj = `${companyName} l 0001 [${id}|0001-60]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various code formats', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: 1, max: 9999 }).map(n => n.toString().padStart(4, '0')),
            fc.integer({ min: 1, max: 99 }).map(n => n.toString().padStart(2, '0')),
            fc.string({ minLength: 1, maxLength: 10 })
          ),
          fc.integer({ min: 1000, max: 9999 }).map(n => n.toString()),
          (code, id) => {
            const cnpj = `COMPANY NAME l ${code} [${id}|0001-60]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Extraction Preserves ID Content
   * **Validates: Requirements 2.1, 2.2**
   * 
   * The extracted ID should be exactly the content between [ and |,
   * with only whitespace trimming applied. No other transformations.
   */
  describe('Property 5: Extraction Preserves ID Content', () => {
    it('should preserve alphanumeric characters in ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (id: string) => {
            // Filter to only alphanumeric
            const alphanumericId = id.replace(/[^a-zA-Z0-9]/g, '');
            if (alphanumericId.length === 0) return; // Skip if no alphanumeric chars
            
            const cnpj = `COMPANY l CODE [${alphanumericId}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(alphanumericId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve special characters in ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom('-', '_', '.', '/', '\\'),
          (baseId, specialChar) => {
            const id = `${baseId}${specialChar}${baseId}`;
            const cnpj = `COMPANY l CODE [${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not modify case of extracted ID', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 20 }).map(s => s.toLowerCase()),
            fc.string({ minLength: 1, maxLength: 20 }).map(s => s.toUpperCase()),
            fc.string({ minLength: 1, maxLength: 20 })
          ),
          (id) => {
            const cnpj = `COMPANY l CODE [${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle IDs with internal spaces', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (part1, part2) => {
            const id = `${part1} ${part2}`;
            const cnpj = `COMPANY l CODE [${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            // Internal spaces should be preserved, only leading/trailing trimmed
            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Extraction Edge Cases
   * **Validates: Requirements 2.4**
   * 
   * Edge cases should be handled consistently and predictably.
   */
  describe('Property 6: Extraction Edge Cases', () => {
    it('should handle very long strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (longPrefix, id) => {
            const cnpj = `${longPrefix}[${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle strings with unicode characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (id: string) => {
            const cnpj = `COMPANY l CODE [${id}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(id.trim());
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle empty string input', () => {
      const result = service.extractCnpjId('');
      expect(result).toBeNull();
    });

    it('should handle single character IDs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }),
          (char: string) => {
            const cnpj = `COMPANY l CODE [${char}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(char);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle IDs at maximum reasonable length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 50, maxLength: 100 }),
          (longId) => {
            const cnpj = `COMPANY l CODE [${longId}|SUFFIX]`;
            const result = service.extractCnpjId(cnpj);

            expect(result).toBe(longId.trim());
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
