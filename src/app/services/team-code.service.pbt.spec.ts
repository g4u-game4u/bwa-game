import { TestBed } from '@angular/core/testing';
import { TeamCodeService, TeamCodes } from './team-code.service';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for TeamCodeService
 * 
 * These tests verify universal properties that should hold for all inputs,
 * using fast-check to generate random test cases.
 * 
 * Focus: Default Values Consistency (Property 1)
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */
describe('TeamCodeService Property-Based Tests', () => {
  // Default values as specified in the design document
  const DEFAULT_SUPERVISOR_CODE = 'Fkmdmko';
  const DEFAULT_GESTOR_CODE = 'FkmdnFU';
  const DEFAULT_DIRETOR_CODE = 'FkmdhZ9';
  
  const propertyTestConfig = { numRuns: 100 };

  let service: TeamCodeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TeamCodeService]
    });
    service = TestBed.inject(TeamCodeService);
  });

  /**
   * Property 1: Default Values Consistency
   * **Feature: configurable-team-codes, Property 1: Default Values Consistency**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * 
   * For any TeamCodeService instance where environment variables are not set,
   * the resolved team codes should equal the default values:
   * supervisor='Fkmdmko', gestor='FkmdnFU', diretor='FkmdhZ9'.
   */
  describe('Property 1: Default Values Consistency', () => {

    describe('Default Values Are Always Returned When Environment Is Not Configured', () => {
      /**
       * The service should always return the default supervisor code when
       * environment is not configured with a custom value.
       */
      it('should return default supervisor code (Fkmdmko) when environment is not configured', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }), // number of calls
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const supervisorCode = service.getSupervisorCode();
                expect(supervisorCode).toBe(DEFAULT_SUPERVISOR_CODE);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The service should always return the default gestor code when
       * environment is not configured with a custom value.
       */
      it('should return default gestor code (FkmdnFU) when environment is not configured', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }), // number of calls
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const gestorCode = service.getGestorCode();
                expect(gestorCode).toBe(DEFAULT_GESTOR_CODE);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The service should always return the default diretor code when
       * environment is not configured with a custom value.
       */
      it('should return default diretor code (FkmdhZ9) when environment is not configured', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }), // number of calls
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const diretorCode = service.getDiretorCode();
                expect(diretorCode).toBe(DEFAULT_DIRETOR_CODE);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The getTeamCodes() method should return an object with all default values
       * when environment is not configured.
       */
      it('should return all default team codes from getTeamCodes() when environment is not configured', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }), // number of calls
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                expect(teamCodes.supervisor).toBe(DEFAULT_SUPERVISOR_CODE);
                expect(teamCodes.gestor).toBe(DEFAULT_GESTOR_CODE);
                expect(teamCodes.diretor).toBe(DEFAULT_DIRETOR_CODE);
              }
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Service Always Returns Same Cached Values Across Multiple Calls', () => {
      /**
       * For any random number of sequential calls (1-100), all calls to getSupervisorCode()
       * should return the exact same value.
       */
      it('should return identical supervisor code for any number of sequential calls', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              const results: string[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getSupervisorCode());
              }
              
              const firstResult = results[0];
              expect(results.every(result => result === firstResult)).withContext(
                `Expected all ${numCalls} calls to return '${firstResult}', but got different values`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any random number of sequential calls (1-100), all calls to getGestorCode()
       * should return the exact same value.
       */
      it('should return identical gestor code for any number of sequential calls', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              const results: string[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getGestorCode());
              }
              
              const firstResult = results[0];
              expect(results.every(result => result === firstResult)).withContext(
                `Expected all ${numCalls} calls to return '${firstResult}', but got different values`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any random number of sequential calls (1-100), all calls to getDiretorCode()
       * should return the exact same value.
       */
      it('should return identical diretor code for any number of sequential calls', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              const results: string[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getDiretorCode());
              }
              
              const firstResult = results[0];
              expect(results.every(result => result === firstResult)).withContext(
                `Expected all ${numCalls} calls to return '${firstResult}', but got different values`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any random number of sequential calls (1-100), all calls to getTeamCodes()
       * should return objects with identical values.
       */
      it('should return identical team codes object for any number of sequential calls', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              const results: TeamCodes[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getTeamCodes());
              }
              
              const firstResult = results[0];
              expect(results.every(result => 
                result.supervisor === firstResult.supervisor &&
                result.gestor === firstResult.gestor &&
                result.diretor === firstResult.diretor
              )).withContext(
                `Expected all ${numCalls} calls to return identical team codes`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The cached values should remain constant when interleaving calls
       * to different getter methods.
       */
      it('should maintain cache consistency when interleaving different getter calls', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.array(
              fc.integer({ min: 0, max: 3 }), // 0=supervisor, 1=gestor, 2=diretor, 3=all
              { minLength: 10, maxLength: 100 }
            ),
            (callPattern) => {
              const supervisorResults: string[] = [];
              const gestorResults: string[] = [];
              const diretorResults: string[] = [];
              
              for (const callType of callPattern) {
                switch (callType) {
                  case 0:
                    supervisorResults.push(service.getSupervisorCode());
                    break;
                  case 1:
                    gestorResults.push(service.getGestorCode());
                    break;
                  case 2:
                    diretorResults.push(service.getDiretorCode());
                    break;
                  case 3:
                    const codes = service.getTeamCodes();
                    supervisorResults.push(codes.supervisor);
                    gestorResults.push(codes.gestor);
                    diretorResults.push(codes.diretor);
                    break;
                }
              }
              
              // All results for each code type should be identical
              if (supervisorResults.length > 0) {
                expect(supervisorResults.every(r => r === supervisorResults[0])).toBeTrue();
              }
              if (gestorResults.length > 0) {
                expect(gestorResults.every(r => r === gestorResults[0])).toBeTrue();
              }
              if (diretorResults.length > 0) {
                expect(diretorResults.every(r => r === diretorResults[0])).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Default Values Are Always Valid Team Codes', () => {
      /**
       * The default supervisor code should always be a valid team code.
       */
      it('should return a valid team code for supervisor', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const supervisorCode = service.getSupervisorCode();
                expect(service.isValidTeamCode(supervisorCode)).withContext(
                  `Expected supervisor code '${supervisorCode}' to be valid`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The default gestor code should always be a valid team code.
       */
      it('should return a valid team code for gestor', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const gestorCode = service.getGestorCode();
                expect(service.isValidTeamCode(gestorCode)).withContext(
                  `Expected gestor code '${gestorCode}' to be valid`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The default diretor code should always be a valid team code.
       */
      it('should return a valid team code for diretor', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const diretorCode = service.getDiretorCode();
                expect(service.isValidTeamCode(diretorCode)).withContext(
                  `Expected diretor code '${diretorCode}' to be valid`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * All team codes from getTeamCodes() should always be valid.
       */
      it('should return all valid team codes from getTeamCodes()', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                expect(service.isValidTeamCode(teamCodes.supervisor)).withContext(
                  `Expected supervisor code '${teamCodes.supervisor}' to be valid`
                ).toBeTrue();
                expect(service.isValidTeamCode(teamCodes.gestor)).withContext(
                  `Expected gestor code '${teamCodes.gestor}' to be valid`
                ).toBeTrue();
                expect(service.isValidTeamCode(teamCodes.diretor)).withContext(
                  `Expected diretor code '${teamCodes.diretor}' to be valid`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Default team codes should always be non-empty strings.
       */
      it('should return non-empty strings for all team codes', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                
                expect(teamCodes.supervisor).toBeTruthy();
                expect(typeof teamCodes.supervisor).toBe('string');
                expect(teamCodes.supervisor.length).toBeGreaterThan(0);
                
                expect(teamCodes.gestor).toBeTruthy();
                expect(typeof teamCodes.gestor).toBe('string');
                expect(teamCodes.gestor.length).toBeGreaterThan(0);
                
                expect(teamCodes.diretor).toBeTruthy();
                expect(typeof teamCodes.diretor).toBe('string');
                expect(teamCodes.diretor.length).toBeGreaterThan(0);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Default team codes should not contain leading or trailing whitespace.
       */
      it('should return team codes without leading or trailing whitespace', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                
                expect(teamCodes.supervisor).toBe(teamCodes.supervisor.trim());
                expect(teamCodes.gestor).toBe(teamCodes.gestor.trim());
                expect(teamCodes.diretor).toBe(teamCodes.diretor.trim());
              }
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Team Codes Structure Consistency', () => {
      /**
       * The TeamCodes object should always have exactly three properties.
       */
      it('should return TeamCodes object with exactly three properties', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                const keys = Object.keys(teamCodes);
                
                expect(keys.length).toBe(3);
                expect(keys).toContain('supervisor');
                expect(keys).toContain('gestor');
                expect(keys).toContain('diretor');
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Individual getter methods should return the same values as the corresponding
       * properties in getTeamCodes().
       */
      it('should return consistent values between individual getters and getTeamCodes()', () => {
        // Feature: configurable-team-codes, Property 1: Default Values Consistency
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const teamCodes = service.getTeamCodes();
                
                expect(service.getSupervisorCode()).toBe(teamCodes.supervisor);
                expect(service.getGestorCode()).toBe(teamCodes.gestor);
                expect(service.getDiretorCode()).toBe(teamCodes.diretor);
              }
            }
          ),
          propertyTestConfig
        );
      });
    });
  });

  /**
   * Property 4: Team Code Validation
   * **Feature: configurable-team-codes, Property 4: Team Code Validation**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   * 
   * For any string input to `isValidTeamCode`, the function should return true
   * only for non-empty, non-whitespace strings.
   */
  describe('Property 4: Team Code Validation', () => {

    // Helper to generate whitespace-only strings
    const whitespaceArbitrary = (minLen: number, maxLen: number) =>
      fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: minLen, maxLength: maxLen })
        .map(arr => arr.join(''));

    // Helper to generate space-only strings
    const spacesArbitrary = (minLen: number, maxLen: number) =>
      fc.integer({ min: minLen, max: maxLen }).map(len => ' '.repeat(len));

    // Helper to generate tab-only strings
    const tabsArbitrary = (minLen: number, maxLen: number) =>
      fc.integer({ min: minLen, max: maxLen }).map(len => '\t'.repeat(len));

    // Helper to generate newline-only strings
    const newlinesArbitrary = (minLen: number, maxLen: number) =>
      fc.array(fc.constantFrom('\n', '\r'), { minLength: minLen, maxLength: maxLen })
        .map(arr => arr.join(''));

    // Helper to generate alphanumeric strings
    const alphanumericArbitrary = (minLen: number, maxLen: number) =>
      fc.array(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        { minLength: minLen, maxLength: maxLen }
      ).map(arr => arr.join(''));

    describe('Valid Team Codes (Non-Empty, Non-Whitespace Strings)', () => {
      /**
       * For any randomly generated non-empty, non-whitespace string,
       * isValidTeamCode should return true.
       */
      it('should return true for any non-empty, non-whitespace string', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            (validCode: string) => {
              expect(service.isValidTeamCode(validCode)).withContext(
                `Expected '${validCode}' to be a valid team code`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated alphanumeric string (typical team code format),
       * isValidTeamCode should return true.
       */
      it('should return true for any alphanumeric string', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            alphanumericArbitrary(1, 20),
            (alphanumericCode: string) => {
              expect(service.isValidTeamCode(alphanumericCode)).withContext(
                `Expected alphanumeric code '${alphanumericCode}' to be valid`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated string with leading/trailing whitespace but
       * non-whitespace content, isValidTeamCode should return true.
       */
      it('should return true for strings with leading/trailing whitespace but non-whitespace content', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.tuple(
              spacesArbitrary(0, 5),
              fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
              spacesArbitrary(0, 5)
            ),
            ([leadingSpaces, content, trailingSpaces]: [string, string, string]) => {
              const codeWithSpaces = leadingSpaces + content + trailingSpaces;
              expect(service.isValidTeamCode(codeWithSpaces)).withContext(
                `Expected '${codeWithSpaces}' (with spaces around '${content}') to be valid`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid Team Codes (Empty Strings)', () => {
      /**
       * For any randomly generated empty string, isValidTeamCode should return false.
       */
      it('should return false for empty string', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.constant(''),
            (emptyString: string) => {
              expect(service.isValidTeamCode(emptyString)).withContext(
                `Expected empty string to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid Team Codes (Whitespace-Only Strings)', () => {
      /**
       * For any randomly generated whitespace-only string, isValidTeamCode should return false.
       */
      it('should return false for whitespace-only strings (spaces)', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            spacesArbitrary(1, 100),
            (whitespaceOnly: string) => {
              expect(service.isValidTeamCode(whitespaceOnly)).withContext(
                `Expected whitespace-only string (length ${whitespaceOnly.length}) to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated string containing only tabs, isValidTeamCode should return false.
       */
      it('should return false for tab-only strings', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            tabsArbitrary(1, 50),
            (tabsOnly: string) => {
              expect(service.isValidTeamCode(tabsOnly)).withContext(
                `Expected tab-only string to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated string containing only newlines, isValidTeamCode should return false.
       */
      it('should return false for newline-only strings', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            newlinesArbitrary(1, 50),
            (newlinesOnly: string) => {
              expect(service.isValidTeamCode(newlinesOnly)).withContext(
                `Expected newline-only string to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated string containing mixed whitespace characters,
       * isValidTeamCode should return false.
       */
      it('should return false for mixed whitespace-only strings', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            whitespaceArbitrary(1, 50),
            (mixedWhitespace: string) => {
              expect(service.isValidTeamCode(mixedWhitespace)).withContext(
                `Expected mixed whitespace string to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid Team Codes (Null/Undefined)', () => {
      /**
       * For null input, isValidTeamCode should return false.
       */
      it('should return false for null', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.constant(null),
            (nullValue: null) => {
              expect(service.isValidTeamCode(nullValue)).withContext(
                `Expected null to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For undefined input, isValidTeamCode should return false.
       */
      it('should return false for undefined', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.constant(undefined),
            (undefinedValue: undefined) => {
              expect(service.isValidTeamCode(undefinedValue)).withContext(
                `Expected undefined to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid Team Codes (Non-String Types)', () => {
      /**
       * For any randomly generated number, isValidTeamCode should return false.
       */
      it('should return false for numbers', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.oneof(fc.integer(), fc.float(), fc.double()),
            (numberValue: number) => {
              expect(service.isValidTeamCode(numberValue as any)).withContext(
                `Expected number ${numberValue} to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated boolean, isValidTeamCode should return false.
       */
      it('should return false for booleans', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.boolean(),
            (boolValue: boolean) => {
              expect(service.isValidTeamCode(boolValue as any)).withContext(
                `Expected boolean ${boolValue} to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated object, isValidTeamCode should return false.
       */
      it('should return false for objects', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.object(),
            (objectValue: object) => {
              expect(service.isValidTeamCode(objectValue as any)).withContext(
                `Expected object to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated array, isValidTeamCode should return false.
       */
      it('should return false for arrays', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.array(fc.anything()),
            (arrayValue: unknown[]) => {
              expect(service.isValidTeamCode(arrayValue as any)).withContext(
                `Expected array to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any randomly generated function, isValidTeamCode should return false.
       */
      it('should return false for functions', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.func(fc.anything()),
            (funcValue: () => unknown) => {
              expect(service.isValidTeamCode(funcValue as any)).withContext(
                `Expected function to be invalid`
              ).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Validation Consistency', () => {
      /**
       * For any input, calling isValidTeamCode multiple times should always
       * return the same result (deterministic behavior).
       */
      it('should return consistent results for repeated calls with same input', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.oneof(
              fc.string(),
              fc.constant(null),
              fc.constant(undefined),
              fc.integer(),
              fc.boolean()
            ),
            fc.integer({ min: 2, max: 50 }),
            (input: string | null | undefined | number | boolean, numCalls: number) => {
              const results: boolean[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(service.isValidTeamCode(input as any));
              }
              
              const firstResult = results[0];
              expect(results.every(r => r === firstResult)).withContext(
                `Expected all ${numCalls} calls with input '${input}' to return ${firstResult}`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The validation result should be the inverse for valid vs invalid inputs:
       * if a string is valid, adding only whitespace should not change validity
       * (since trim is applied internally).
       */
      it('should maintain validity when adding whitespace to valid strings', () => {
        // Feature: configurable-team-codes, Property 4: Team Code Validation
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            spacesArbitrary(0, 10),
            spacesArbitrary(0, 10),
            (validContent: string, leadingWs: string, trailingWs: string) => {
              const original = validContent;
              const withWhitespace = leadingWs + validContent + trailingWs;
              
              const originalValid = service.isValidTeamCode(original);
              const withWhitespaceValid = service.isValidTeamCode(withWhitespace);
              
              expect(originalValid).withContext(
                `Expected original '${original}' to be valid`
              ).toBeTrue();
              expect(withWhitespaceValid).withContext(
                `Expected '${withWhitespace}' (with added whitespace) to also be valid`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });
  });
});
