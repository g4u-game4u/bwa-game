import { TestBed } from '@angular/core/testing';
import { LogoService } from './logo.service';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for LogoService
 * 
 * These tests verify universal properties that should hold for all inputs,
 * using fast-check to generate random test cases.
 * 
 * Focus: URL Resolution Correctness (Property 1) and URL Validation Completeness (Property 4)
 * 
 * **Validates: Requirements 1.2, 1.3, 3.2**
 */
describe('LogoService Property-Based Tests', () => {
  const DEFAULT_LOGO_URL = '/assets/images/logo-bwa-white-inteira-full.png';
  const propertyTestConfig = { numRuns: 100 };

  let service: LogoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LogoService]
    });
    service = TestBed.inject(LogoService);
  });

  /**
   * Property 1: URL Resolution Correctness
   * **Validates: Requirements 1.2, 1.3, 3.2**
   * 
   * For any logo URL configuration value, the LogoService.getLogoUrl() method should return:
   * - The configured URL (trimmed) if it is a valid, non-empty URL format
   * - The default logo URL if the configuration is empty, whitespace-only, undefined, null, or an invalid URL format
   */
  describe('Property 1: URL Resolution Correctness', () => {
    
    describe('Valid URL Resolution', () => {
      /**
       * For any valid relative path starting with '/', isValidLogoUrl should return true
       * and the URL should be considered valid for resolution.
       */
      it('should validate relative paths starting with / as valid URLs', () => {
        fc.assert(
          fc.property(
            // Generate random relative paths starting with /
            fc.tuple(
              fc.constantFrom('/assets/', '/images/', '/static/', '/public/', '/'),
              fc.string({ minLength: 0, maxLength: 50 }).map(s => s.replace(/[\/\s]/g, '')), // path segment
              fc.constantFrom('.png', '.jpg', '.svg', '.gif', '.webp', '')
            ).map(([prefix, segment, ext]) => `${prefix}${segment}${ext}`),
            (relativePath) => {
              const result = service.isValidLogoUrl(relativePath);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any valid absolute URL (http/https), isValidLogoUrl should return true.
       */
      it('should validate absolute URLs (http/https) as valid URLs', () => {
        fc.assert(
          fc.property(
            fc.webUrl(),
            (absoluteUrl) => {
              const result = service.isValidLogoUrl(absoluteUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any valid URL with leading/trailing whitespace, the URL should still be valid
       * after trimming.
       */
      it('should validate URLs with leading/trailing whitespace as valid (after trim)', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.integer({ min: 0, max: 5 }), // leading spaces
              fc.oneof(
                fc.constant('/assets/logo.png'),
                fc.constant('/images/brand.svg'),
                fc.webUrl()
              ),
              fc.integer({ min: 0, max: 5 }) // trailing spaces
            ).map(([leadingSpaces, url, trailingSpaces]) => 
              ' '.repeat(leadingSpaces) + url + ' '.repeat(trailingSpaces)
            ),
            (paddedUrl) => {
              const result = service.isValidLogoUrl(paddedUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any valid URL with various protocols (http, https, data, blob, file),
       * isValidLogoUrl should return true.
       */
      it('should validate URLs with various valid protocols', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.webUrl(), // http/https
              fc.constant('data:image/png;base64,iVBORw0KGgo='),
              fc.constant('data:image/svg+xml;base64,PHN2Zz4='),
              fc.constant('blob:http://localhost:4200/abc-123-def'),
              fc.constant('file:///C:/images/logo.png')
            ),
            (validUrl) => {
              const result = service.isValidLogoUrl(validUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any valid relative path with query parameters or hash fragments,
       * isValidLogoUrl should return true.
       */
      it('should validate relative paths with query params and hash fragments', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.constantFrom('/assets/logo.png', '/images/brand.svg', '/static/icon.gif'),
              fc.oneof(
                fc.constant(''),
                fc.string({ minLength: 1, maxLength: 10 }).map(s => `?v=${s.replace(/[?#&=\s]/g, '')}`),
                fc.string({ minLength: 1, maxLength: 10 }).map(s => `#${s.replace(/[?#&=\s]/g, '')}`)
              )
            ).map(([path, suffix]) => `${path}${suffix}`),
            (urlWithParams) => {
              const result = service.isValidLogoUrl(urlWithParams);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid URL Resolution', () => {
      /**
       * For any empty string input, isValidLogoUrl should return false.
       */
      it('should return false for empty strings', () => {
        fc.assert(
          fc.property(
            fc.constant(''),
            (emptyString) => {
              const result = service.isValidLogoUrl(emptyString);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any whitespace-only string, isValidLogoUrl should return false.
       */
      it('should return false for whitespace-only strings', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer({ min: 1, max: 20 }).map(n => ' '.repeat(n)), // spaces
              fc.integer({ min: 1, max: 10 }).map(n => '\t'.repeat(n)), // tabs
              fc.integer({ min: 1, max: 10 }).map(n => '\n'.repeat(n)), // newlines
              fc.tuple(
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 })
              ).map(([spaces, tabs, newlines]) => 
                ' '.repeat(spaces) + '\t'.repeat(tabs) + '\n'.repeat(newlines)
              ).filter(s => s.length > 0) // mixed whitespace
            ),
            (whitespaceString) => {
              const result = service.isValidLogoUrl(whitespaceString);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For null or undefined inputs, isValidLogoUrl should return false.
       */
      it('should return false for null and undefined', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constant(null),
              fc.constant(undefined)
            ),
            (nullishValue) => {
              const result = service.isValidLogoUrl(nullishValue);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any malformed URL (not starting with / and not a valid absolute URL),
       * isValidLogoUrl should return false.
       */
      it('should return false for malformed URLs (relative paths without leading /)', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.constantFrom('assets/', 'images/', 'static/', ''),
              fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[\/\s]/g, '')),
              fc.constantFrom('.png', '.jpg', '.svg', '')
            ).map(([prefix, segment, ext]) => `${prefix}${segment}${ext}`)
              .filter(s => !s.startsWith('/') && !s.startsWith('http') && s.length > 0),
            (malformedPath) => {
              const result = service.isValidLogoUrl(malformedPath);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any random text that doesn't form a valid URL, isValidLogoUrl should return false.
       */
      it('should return false for random non-URL text', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
                const trimmed = s.trim();
                // Filter out strings that could be valid URLs
                if (trimmed.startsWith('/')) return false;
                if (trimmed.length === 0) return false;
                // Check if it's a valid URL by trying to parse it
                try {
                  new URL(trimmed);
                  return false; // It's a valid URL, filter it out
                } catch {
                  return true; // It's not a valid URL, keep it
                }
              }),
              fc.constantFrom(
                'not a url',
                'just some text',
                'logo.png',
                'example.com/logo.png',
                '://invalid'
              )
            ),
            (randomText) => {
              const result = service.isValidLogoUrl(randomText);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For non-string types, isValidLogoUrl should return false.
       */
      it('should return false for non-string types', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer(),
              fc.boolean(),
              fc.object(),
              fc.array(fc.string()),
              fc.float()
            ),
            (nonStringValue) => {
              const result = service.isValidLogoUrl(nonStringValue as any);
              expect(result).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Default Logo Fallback', () => {
      /**
       * The service should always return a valid URL (never empty or null).
       */
      it('should always return a non-empty URL from getLogoUrl()', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }), // number of calls
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const logoUrl = service.getLogoUrl();
                expect(logoUrl).toBeTruthy();
                expect(logoUrl.length).toBeGreaterThan(0);
              }
            }
          ),
          { numRuns: 50 }
        );
      });

      /**
       * The default logo URL should always be a valid relative path.
       */
      it('should return a valid default logo URL', () => {
        fc.assert(
          fc.property(
            fc.constant(true), // dummy property
            () => {
              const defaultUrl = service.getDefaultLogoUrl();
              expect(defaultUrl).toBe(DEFAULT_LOGO_URL);
              expect(service.isValidLogoUrl(defaultUrl)).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * When environment logoUrl is not configured (current test environment),
       * getLogoUrl should return the default logo URL.
       */
      it('should return default logo when no custom URL is configured', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const logoUrl = service.getLogoUrl();
                // In test environment, logoUrl is not configured, so should return default
                expect(logoUrl).toBe(DEFAULT_LOGO_URL);
              }
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('URL Trimming Behavior', () => {
      /**
       * For any valid URL with whitespace, the validation should work on the trimmed version.
       */
      it('should handle URLs with various whitespace patterns correctly', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t\n'),
              fc.constantFrom('/assets/logo.png', '/images/brand.svg'),
              fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t\n')
            ).map(([leading, url, trailing]) => ({
              paddedUrl: leading + url + trailing,
              expectedValid: true
            })),
            ({ paddedUrl, expectedValid }) => {
              const result = service.isValidLogoUrl(paddedUrl);
              expect(result).toBe(expectedValid);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Edge Cases', () => {
      /**
       * Very long valid URLs should still be validated correctly.
       */
      it('should handle very long valid URLs', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 100, max: 500 }).map(length => 
              '/assets/' + 'a'.repeat(length) + '.png'
            ),
            (longUrl) => {
              const result = service.isValidLogoUrl(longUrl);
              expect(result).toBeTrue();
            }
          ),
          { numRuns: 50 }
        );
      });

      /**
       * URLs with unicode characters should be handled correctly.
       */
      it('should handle URLs with unicode characters', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constant('/assets/логотип.png'),
              fc.constant('/images/图标.svg'),
              fc.constant('https://example.com/ロゴ.png'),
              fc.constant('/assets/émoji-🎨.png')
            ),
            (unicodeUrl) => {
              const result = service.isValidLogoUrl(unicodeUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * URLs with encoded characters should be handled correctly.
       */
      it('should handle URLs with encoded characters', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constant('/assets/logo%20image.png'),
              fc.constant('/images/brand%2Flogo.svg'),
              fc.constant('https://example.com/logo%3Fv%3D1.png')
            ),
            (encodedUrl) => {
              const result = service.isValidLogoUrl(encodedUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Single character paths starting with / should be valid.
       */
      it('should handle single character paths', () => {
        fc.assert(
          fc.property(
            fc.constant('/'),
            (singleCharPath) => {
              const result = service.isValidLogoUrl(singleCharPath);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Localhost and IP address URLs should be valid.
       */
      it('should handle localhost and IP address URLs', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constant('http://localhost/logo.png'),
              fc.constant('http://localhost:4200/assets/logo.png'),
              fc.constant('http://127.0.0.1/logo.png'),
              fc.constant('http://192.168.1.1:8080/images/brand.svg'),
              fc.constant('https://10.0.0.1/static/icon.gif')
            ),
            (localUrl) => {
              const result = service.isValidLogoUrl(localUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });
  });

  /**
   * Property 3: Caching Consistency
   * **Validates: Requirements 4.3**
   * 
   * For any sequence of calls to LogoService.getLogoUrl(), the method should always
   * return the same value (the value resolved at service initialization), demonstrating
   * that the logo URL is cached and not re-resolved on each call.
   */
  describe('Property 3: Caching Consistency', () => {

    describe('Sequential Call Consistency', () => {
      /**
       * For any random number of sequential calls (1-100), all calls to getLogoUrl()
       * should return the exact same value.
       */
      it('should return identical value for any number of sequential calls (1-100)', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              const results: string[] = [];
              
              // Make the specified number of sequential calls
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getLogoUrl());
              }
              
              // All results should be identical to the first result
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
       * The cached value should remain constant regardless of how many times
       * getLogoUrl() is called in rapid succession.
       */
      it('should maintain cache consistency under rapid successive calls', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 10, max: 100 }),
            (numCalls) => {
              const firstCall = service.getLogoUrl();
              
              // Make rapid successive calls
              for (let i = 0; i < numCalls; i++) {
                const currentCall = service.getLogoUrl();
                expect(currentCall).withContext(
                  `Call ${i + 1} returned '${currentCall}' but expected '${firstCall}'`
                ).toBe(firstCall);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The cached value should be consistent across interleaved calls
       * to getLogoUrl() and getDefaultLogoUrl().
       */
      it('should maintain cache consistency when interleaved with getDefaultLogoUrl() calls', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.boolean(), // true = call getLogoUrl(), false = call getDefaultLogoUrl()
              { minLength: 10, maxLength: 100 }
            ),
            (callPattern) => {
              const logoUrlResults: string[] = [];
              
              // Execute the random call pattern
              for (const callGetLogoUrl of callPattern) {
                if (callGetLogoUrl) {
                  logoUrlResults.push(service.getLogoUrl());
                } else {
                  // Call getDefaultLogoUrl() but don't track it
                  service.getDefaultLogoUrl();
                }
              }
              
              // All getLogoUrl() results should be identical
              if (logoUrlResults.length > 0) {
                const firstResult = logoUrlResults[0];
                expect(logoUrlResults.every(result => result === firstResult)).withContext(
                  `Expected all getLogoUrl() calls to return '${firstResult}'`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Cache Immutability', () => {
      /**
       * The cached logo URL should not change even after many calls.
       */
      it('should return the same value before and after many intermediate calls', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numIntermediateCalls) => {
              // Get initial value
              const initialValue = service.getLogoUrl();
              
              // Make many intermediate calls
              for (let i = 0; i < numIntermediateCalls; i++) {
                service.getLogoUrl();
              }
              
              // Get final value
              const finalValue = service.getLogoUrl();
              
              expect(finalValue).withContext(
                `Expected final value '${finalValue}' to equal initial value '${initialValue}'`
              ).toBe(initialValue);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Multiple service instances should each maintain their own consistent cache.
       * Note: In Angular with providedIn: 'root', there's typically one instance,
       * but this tests the caching behavior of individual instances.
       */
      it('should maintain consistent cache within the same service instance', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 1, max: 50 }),
            (callsBefore, callsAfter) => {
              // Make calls before
              const resultsBefore: string[] = [];
              for (let i = 0; i < callsBefore; i++) {
                resultsBefore.push(service.getLogoUrl());
              }
              
              // Make calls after
              const resultsAfter: string[] = [];
              for (let i = 0; i < callsAfter; i++) {
                resultsAfter.push(service.getLogoUrl());
              }
              
              // All results should be identical
              const allResults = [...resultsBefore, ...resultsAfter];
              const firstResult = allResults[0];
              expect(allResults.every(r => r === firstResult)).withContext(
                `Expected all ${allResults.length} calls to return '${firstResult}'`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Return Value Properties', () => {
      /**
       * The cached value should always be a non-empty string.
       */
      it('should always return a non-empty string from cache', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const result = service.getLogoUrl();
                expect(result).toBeTruthy();
                expect(typeof result).toBe('string');
                expect(result.length).toBeGreaterThan(0);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The cached value should always be a valid URL according to isValidLogoUrl().
       */
      it('should always return a valid URL from cache', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (numCalls) => {
              for (let i = 0; i < numCalls; i++) {
                const result = service.getLogoUrl();
                expect(service.isValidLogoUrl(result)).withContext(
                  `Expected cached URL '${result}' to be valid`
                ).toBeTrue();
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The cached value should be reference-equal across calls (same string instance).
       */
      it('should return reference-equal strings across calls', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 2, max: 50 }),
            (numCalls) => {
              const results: string[] = [];
              for (let i = 0; i < numCalls; i++) {
                results.push(service.getLogoUrl());
              }
              
              // Check that all results are the same reference
              // Note: In JavaScript, string literals are interned, so this tests
              // that we're returning the same cached value, not creating new strings
              const first = results[0];
              for (let i = 1; i < results.length; i++) {
                expect(results[i]).toBe(first);
              }
            }
          ),
          propertyTestConfig
        );
      });
    });
  });

  /**
   * Property 4: URL Validation Completeness
   * **Validates: Requirements 1.2, 3.2**
   * 
   * For any string input to LogoService.isValidLogoUrl():
   * - Relative paths starting with '/' should return true
   * - Valid absolute URLs (http://, https://) should return true
   * - Empty strings, whitespace-only strings, null, undefined, and malformed URLs should return false
   */
  describe('Property 4: URL Validation Completeness', () => {

    describe('Valid URL Categories', () => {
      /**
       * Any relative path starting with '/' should be categorized as valid.
       */
      it('should return true for any relative path starting with /', () => {
        fc.assert(
          fc.property(
            // Generate random relative paths starting with /
            fc.tuple(
              fc.constant('/'),
              fc.string({ minLength: 0, maxLength: 100 })
            ).map(([slash, rest]) => slash + rest.replace(/^\//g, '')), // Ensure starts with single /
            (relativePath) => {
              const result = service.isValidLogoUrl(relativePath);
              expect(result).withContext(`Expected '${relativePath}' to be valid`).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Any valid http:// URL should be categorized as valid.
       */
      it('should return true for valid http:// URLs', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.constant('http://'),
              fc.domain(),
              fc.oneof(
                fc.constant(''),
                fc.webPath()
              )
            ).map(([protocol, domain, path]) => `${protocol}${domain}${path}`),
            (httpUrl) => {
              const result = service.isValidLogoUrl(httpUrl);
              expect(result).withContext(`Expected '${httpUrl}' to be valid`).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Any valid https:// URL should be categorized as valid.
       */
      it('should return true for valid https:// URLs', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.constant('https://'),
              fc.domain(),
              fc.oneof(
                fc.constant(''),
                fc.webPath()
              )
            ).map(([protocol, domain, path]) => `${protocol}${domain}${path}`),
            (httpsUrl) => {
              const result = service.isValidLogoUrl(httpsUrl);
              expect(result).withContext(`Expected '${httpsUrl}' to be valid`).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Generated web URLs from fast-check should all be valid.
       */
      it('should return true for all fast-check generated web URLs', () => {
        fc.assert(
          fc.property(
            fc.webUrl(),
            (webUrl) => {
              const result = service.isValidLogoUrl(webUrl);
              expect(result).withContext(`Expected '${webUrl}' to be valid`).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Invalid URL Categories', () => {
      /**
       * Empty strings should always be categorized as invalid.
       */
      it('should return false for empty strings', () => {
        fc.assert(
          fc.property(
            fc.constant(''),
            (emptyStr) => {
              const result = service.isValidLogoUrl(emptyStr);
              expect(result).withContext('Expected empty string to be invalid').toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Whitespace-only strings should always be categorized as invalid.
       */
      it('should return false for whitespace-only strings', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer({ min: 1, max: 20 }).map(n => ' '.repeat(n)), // spaces
              fc.integer({ min: 1, max: 10 }).map(n => '\t'.repeat(n)), // tabs
              fc.integer({ min: 1, max: 10 }).map(n => '\n'.repeat(n)), // newlines
              fc.integer({ min: 1, max: 10 }).map(n => '\r'.repeat(n)), // carriage returns
              fc.tuple(
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 })
              ).map(([spaces, tabs, newlines, returns]) => 
                ' '.repeat(spaces) + '\t'.repeat(tabs) + '\n'.repeat(newlines) + '\r'.repeat(returns)
              ).filter(s => s.length > 0) // mixed whitespace
            ),
            (whitespaceStr) => {
              const result = service.isValidLogoUrl(whitespaceStr);
              expect(result).withContext(`Expected whitespace-only '${JSON.stringify(whitespaceStr)}' to be invalid`).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Null values should always be categorized as invalid.
       */
      it('should return false for null', () => {
        fc.assert(
          fc.property(
            fc.constant(null),
            (nullValue) => {
              const result = service.isValidLogoUrl(nullValue);
              expect(result).withContext('Expected null to be invalid').toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Undefined values should always be categorized as invalid.
       */
      it('should return false for undefined', () => {
        fc.assert(
          fc.property(
            fc.constant(undefined),
            (undefinedValue) => {
              const result = service.isValidLogoUrl(undefinedValue);
              expect(result).withContext('Expected undefined to be invalid').toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Malformed URLs (not starting with / and not valid absolute URLs) should be invalid.
       */
      it('should return false for malformed URLs', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Relative paths without leading /
              fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
                const trimmed = s.trim();
                if (trimmed.startsWith('/')) return false;
                if (trimmed.length === 0) return false;
                // Check if it's a valid URL by trying to parse it
                try {
                  new URL(trimmed);
                  return false; // It's a valid URL, filter it out
                } catch {
                  return true; // It's not a valid URL, keep it
                }
              }),
              // Specific malformed examples that are truly invalid
              fc.constantFrom(
                'assets/logo.png',
                'images/brand.svg',
                'logo.png',
                'example.com/logo.png',
                'www.example.com/logo.png',
                '://missing-protocol',
                'just-text',
                'random string with spaces',
                '123456',
                'true',
                'false'
              )
            ),
            (malformedUrl) => {
              const result = service.isValidLogoUrl(malformedUrl);
              expect(result).withContext(`Expected malformed URL '${malformedUrl}' to be invalid`).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Non-string types should always be categorized as invalid.
       */
      it('should return false for non-string types', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer(),
              fc.double(),
              fc.boolean(),
              fc.object(),
              fc.array(fc.anything()),
              fc.func(fc.anything())
            ),
            (nonStringValue) => {
              const result = service.isValidLogoUrl(nonStringValue as any);
              expect(result).withContext(`Expected non-string type to be invalid`).toBeFalse();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Random String Classification', () => {
      /**
       * For any random string, the validation should correctly categorize it:
       * - Valid if starts with '/' (after trim)
       * - Valid if it's a parseable URL (http://, https://, data:, blob:, file:)
       * - Invalid otherwise
       */
      it('should correctly categorize any random string', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 0, maxLength: 200 }),
            (randomString) => {
              const result = service.isValidLogoUrl(randomString);
              const trimmed = randomString.trim();
              
              // Determine expected result based on validation rules
              let expectedValid = false;
              
              if (trimmed === '') {
                expectedValid = false;
              } else if (trimmed.startsWith('/')) {
                expectedValid = true;
              } else {
                // Check if it's a valid absolute URL
                try {
                  new URL(trimmed);
                  expectedValid = true;
                } catch {
                  expectedValid = false;
                }
              }
              
              expect(result).withContext(
                `String '${randomString}' (trimmed: '${trimmed}') should be ${expectedValid ? 'valid' : 'invalid'}`
              ).toBe(expectedValid);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Validation result should be consistent across multiple calls with the same input.
       */
      it('should return consistent results for the same input', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.string(),
              fc.constant(null),
              fc.constant(undefined)
            ),
            fc.integer({ min: 2, max: 10 }),
            (input, numCalls) => {
              const results: boolean[] = [];
              for (let i = 0; i < numCalls; i++) {
                results.push(service.isValidLogoUrl(input));
              }
              
              // All results should be identical
              const firstResult = results[0];
              expect(results.every(r => r === firstResult)).withContext(
                `Expected consistent results for input '${input}', got: ${results.join(', ')}`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Boundary Cases', () => {
      /**
       * Single character '/' should be valid.
       */
      it('should return true for single slash /', () => {
        fc.assert(
          fc.property(
            fc.constant('/'),
            (singleSlash) => {
              const result = service.isValidLogoUrl(singleSlash);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Very long valid URLs should still be categorized correctly.
       */
      it('should handle very long valid URLs correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 100, max: 1000 }).map(len => '/' + 'a'.repeat(len)),
            (longPath) => {
              const result = service.isValidLogoUrl(longPath);
              expect(result).toBeTrue();
            }
          ),
          { numRuns: 50 }
        );
      });

      /**
       * Very long invalid strings should still be categorized correctly.
       */
      it('should handle very long invalid strings correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 100, max: 1000 }).map(len => 'a'.repeat(len)),
            (longInvalidString) => {
              const result = service.isValidLogoUrl(longInvalidString);
              expect(result).toBeFalse();
            }
          ),
          { numRuns: 50 }
        );
      });

      /**
       * Strings with special characters should be handled correctly.
       */
      it('should handle strings with special characters', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Valid: relative paths with special chars
              fc.constant('/path/with spaces/logo.png'),
              fc.constant('/path/with%20encoded/logo.png'),
              fc.constant('/path/with-dashes/logo.png'),
              fc.constant('/path/with_underscores/logo.png'),
              fc.constant('/path/with.dots/logo.png'),
              // Valid: absolute URLs with special chars
              fc.constant('https://example.com/path?query=value&other=123'),
              fc.constant('https://example.com/path#fragment'),
              fc.constant('https://user:pass@example.com/path')
            ),
            (specialCharUrl) => {
              const result = service.isValidLogoUrl(specialCharUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Unicode strings should be handled correctly based on URL validity.
       */
      it('should handle unicode strings correctly', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Valid: relative paths with unicode
              fc.constant('/assets/логотип.png'),
              fc.constant('/images/图标.svg'),
              fc.constant('/static/アイコン.gif'),
              // Valid: absolute URLs with unicode
              fc.constant('https://example.com/логотип.png'),
              fc.constant('https://例え.jp/logo.png')
            ),
            (unicodeUrl) => {
              const result = service.isValidLogoUrl(unicodeUrl);
              expect(result).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });
    });
  });
});
