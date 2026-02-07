import { TestBed } from '@angular/core/testing';
import { CompanyKpiService, CnpjKpiData, CompanyDisplay } from './company-kpi.service';
import { FunifierApiService } from './funifier-api.service';
import { of, throwError } from 'rxjs';

/**
 * Error Scenario Tests for CompanyKpiService
 * 
 * Validates: Requirements 2.4 (Error Handling)
 * 
 * This test suite comprehensively tests error scenarios and edge cases:
 * - Invalid CNPJ format handling
 * - Missing KPI data handling
 * - API error handling (500, 404, network timeout)
 * - Partial data scenarios
 * - Empty data scenarios
 * - Null/undefined handling
 * - Graceful degradation
 * - No console errors for expected failures
 */
describe('CompanyKpiService - Error Scenarios', () => {
  let service: CompanyKpiService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let consoleErrorSpy: jasmine.Spy;

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
    
    // Spy on console.error to verify error logging
    consoleErrorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    // Clear cache after each test
    service.clearCache();
  });

  // ========================================
  // Task 10.1: Invalid CNPJ Format Handling
  // ========================================
  describe('Invalid CNPJ Format Handling', () => {
    it('should handle malformed CNPJ strings without brackets', (done) => {
      const companies = [
        { cnpj: 'COMPANY NAME WITHOUT BRACKETS', actionCount: 5 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBeUndefined();
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[0].cnpj).toBe('COMPANY NAME WITHOUT BRACKETS');
        expect(result[0].actionCount).toBe(5);
        // Should not call API for invalid format
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle CNPJ strings with missing pipe separator', (done) => {
      const companies = [
        { cnpj: 'COMPANY NAME l CODE [2000-SUFFIX]', actionCount: 3 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBeUndefined();
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle empty CNPJ strings', (done) => {
      const companies = [
        { cnpj: '', actionCount: 2 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBeUndefined();
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle CNPJ strings with only whitespace', (done) => {
      const companies = [
        { cnpj: '   ', actionCount: 1 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBeUndefined();
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle CNPJ strings with special characters causing regex issues', (done) => {
      const companies = [
        { cnpj: 'COMPANY [[[INVALID|||]]]', actionCount: 4 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        // Should extract something or return undefined
        expect(result[0].cnpj).toBe('COMPANY [[[INVALID|||]]]');
        done();
      });
    });

    it('should handle mixed valid and invalid CNPJ formats gracefully', (done) => {
      const companies = [
        { cnpj: 'VALID COMPANY l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'INVALID FORMAT', actionCount: 3 },
        { cnpj: '', actionCount: 1 },
        { cnpj: 'ANOTHER VALID l 0002 [1218|0002-45]', actionCount: 7 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '1218', entrega: 45 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(4);
        
        // Valid companies should have KPI data
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(89);
        
        // Invalid companies should not have KPI data
        expect(result[1].cnpjId).toBeUndefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        
        expect(result[2].cnpjId).toBeUndefined();
        expect(result[2].deliveryKpi).toBeUndefined();
        
        // Another valid company
        expect(result[3].cnpjId).toBe('1218');
        expect(result[3].deliveryKpi).toBeDefined();
        expect(result[3].deliveryKpi?.current).toBe(45);
        
        // Should only call API once with valid IDs
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  // ========================================
  // Task 10.2: Missing KPI Data Handling
  // ========================================
  describe('Missing KPI Data Handling', () => {
    it('should handle CNPJ ID not found in cnpj__c collection', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      // API returns empty array (no matching CNPJ ID)
      funifierApiSpy.post.and.returnValue(of([]));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[0].cnpj).toBe('COMPANY A l 0001 [2000|0001-60]');
        expect(result[0].actionCount).toBe(5);
        done();
      });
    });

    it('should handle partial KPI data (some IDs found, others not)', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9999|0003-12]', actionCount: 7 }
      ];

      // Only 2 out of 3 IDs have KPI data
      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '1218', entrega: 45 }
        // 9999 is missing
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(89);
        
        expect(result[1].deliveryKpi).toBeDefined();
        expect(result[1].deliveryKpi?.current).toBe(45);
        
        // Company C should not have KPI data
        expect(result[2].cnpjId).toBe('9999');
        expect(result[2].deliveryKpi).toBeUndefined();
        
        done();
      });
    });

    it('should handle KPI data with missing entrega field', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      // API returns data but entrega field is missing
      const mockKpiResponse: any[] = [
        { _id: '2000' } // Missing entrega
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeDefined();
        // Should default to 0 when entrega is missing
        expect(result[0].deliveryKpi?.current).toBe(0);
        done();
      });
    });

    it('should handle KPI data with null entrega value', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: any[] = [
        { _id: '2000', entrega: null }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(0);
        done();
      });
    });

    it('should handle KPI data with undefined entrega value', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: any[] = [
        { _id: '2000', entrega: undefined }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(0);
        done();
      });
    });
  });

  // ========================================
  // Task 10.3: API Error Handling
  // ========================================
  describe('API Error Handling', () => {
    it('should handle 500 Internal Server Error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const serverError = new Error('Internal Server Error');
      (serverError as any).status = 500;

      funifierApiSpy.post.and.returnValue(throwError(() => serverError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        // Should return companies without KPI data
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeUndefined();
        
        // Should log error
        expect(consoleErrorSpy).toHaveBeenCalled();
        
        done();
      });
    });

    it('should handle 404 Not Found error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const notFoundError = new Error('Not Found');
      (notFoundError as any).status = 404;

      funifierApiSpy.post.and.returnValue(throwError(() => notFoundError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(consoleErrorSpy).toHaveBeenCalled();
        done();
      });
    });

    it('should handle network timeout error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';

      funifierApiSpy.post.and.returnValue(throwError(() => timeoutError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(consoleErrorSpy).toHaveBeenCalled();
        done();
      });
    });

    it('should handle 503 Service Unavailable error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const serviceError = new Error('Service Unavailable');
      (serviceError as any).status = 503;

      funifierApiSpy.post.and.returnValue(throwError(() => serviceError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle 401 Unauthorized error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const authError = new Error('Unauthorized');
      (authError as any).status = 401;

      funifierApiSpy.post.and.returnValue(throwError(() => authError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(consoleErrorSpy).toHaveBeenCalled();
        done();
      });
    });

    it('should handle connection refused error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const connectionError = new Error('Connection refused');
      connectionError.name = 'HttpErrorResponse';

      funifierApiSpy.post.and.returnValue(throwError(() => connectionError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle DNS resolution error gracefully', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const dnsError = new Error('DNS resolution failed');
      dnsError.name = 'NetworkError';

      funifierApiSpy.post.and.returnValue(throwError(() => dnsError));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle multiple API errors in sequence', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const error1 = new Error('First error');
      const error2 = new Error('Second error');

      // First call fails
      funifierApiSpy.post.and.returnValue(throwError(() => error1));

      service.enrichCompaniesWithKpis(companies).subscribe(result1 => {
        expect(result1[0].deliveryKpi).toBeUndefined();

        // Clear cache and try again
        service.clearCache();

        // Second call also fails
        funifierApiSpy.post.and.returnValue(throwError(() => error2));

        service.enrichCompaniesWithKpis(companies).subscribe(result2 => {
          expect(result2[0].deliveryKpi).toBeUndefined();
          done();
        });
      });
    });
  });

  // ========================================
  // Task 10.4: Partial Data Scenarios
  // ========================================
  describe('Partial Data Scenarios', () => {
    it('should handle scenario where only first company has KPI data', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 7 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(result[2].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle scenario where only last company has KPI data', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 7 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '9654', entrega: 102 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(result[2].deliveryKpi).toBeDefined();
        expect(result[2].deliveryKpi?.current).toBe(102);
        done();
      });
    });

    it('should handle alternating pattern of KPI data availability', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 7 },
        { cnpj: 'COMPANY D l 0004 [5555|0004-88]', actionCount: 2 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '9654', entrega: 102 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(4);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(result[2].deliveryKpi).toBeDefined();
        expect(result[3].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle large dataset with sparse KPI data', (done) => {
      const companies = Array.from({ length: 50 }, (_, i) => ({
        cnpj: `COMPANY ${i} l 000${i} [${1000 + i}|000${i}-00]`,
        actionCount: i + 1
      }));

      // Only 5 out of 50 have KPI data
      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '1000', entrega: 89 },
        { _id: '1010', entrega: 45 },
        { _id: '1020', entrega: 67 },
        { _id: '1030', entrega: 92 },
        { _id: '1040', entrega: 78 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
        
        const withKpi = result.filter(c => c.deliveryKpi !== undefined);
        const withoutKpi = result.filter(c => c.deliveryKpi === undefined);
        
        expect(withKpi.length).toBe(5);
        expect(withoutKpi.length).toBe(45);
        
        done();
      });
    });

    it('should handle mixed valid/invalid CNPJ with partial KPI data', (done) => {
      const companies = [
        { cnpj: 'VALID A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'INVALID FORMAT', actionCount: 3 },
        { cnpj: 'VALID B l 0002 [1218|0002-45]', actionCount: 7 },
        { cnpj: '', actionCount: 2 },
        { cnpj: 'VALID C l 0003 [9654|0003-12]', actionCount: 4 }
      ];

      // Only 2 out of 3 valid IDs have KPI data
      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
        // 1218 and 9654 missing
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(5);
        
        expect(result[0].deliveryKpi).toBeDefined(); // Valid with KPI
        expect(result[1].deliveryKpi).toBeUndefined(); // Invalid format
        expect(result[2].deliveryKpi).toBeUndefined(); // Valid but no KPI
        expect(result[3].deliveryKpi).toBeUndefined(); // Empty string
        expect(result[4].deliveryKpi).toBeUndefined(); // Valid but no KPI
        
        done();
      });
    });
  });

  // ========================================
  // Task 10.5: Empty Data Scenarios
  // ========================================
  describe('Empty Data Scenarios', () => {
    it('should handle empty companies array', (done) => {
      service.enrichCompaniesWithKpis([]).subscribe(result => {
        expect(result).toEqual([]);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle null companies input', (done) => {
      service.enrichCompaniesWithKpis(null as any).subscribe(result => {
        expect(result).toEqual([]);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle undefined companies input', (done) => {
      service.enrichCompaniesWithKpis(undefined as any).subscribe(result => {
        expect(result).toEqual([]);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle empty KPI data response', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ];

      funifierApiSpy.post.and.returnValue(of([]));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle null API response', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(of(null as any));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle undefined API response', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(of(undefined as any));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle companies with all invalid CNPJ formats', (done) => {
      const companies = [
        { cnpj: 'INVALID 1', actionCount: 5 },
        { cnpj: 'INVALID 2', actionCount: 3 },
        { cnpj: '', actionCount: 2 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(result[2].deliveryKpi).toBeUndefined();
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });
  });

  // ========================================
  // Task 10.6: Null/Undefined Handling
  // ========================================
  describe('Null/Undefined Handling in All Methods', () => {
    describe('extractCnpjId()', () => {
      it('should handle null input', () => {
        const result = service.extractCnpjId(null as any);
        expect(result).toBeNull();
      });

      it('should handle undefined input', () => {
        const result = service.extractCnpjId(undefined as any);
        expect(result).toBeNull();
      });

      it('should handle empty string', () => {
        const result = service.extractCnpjId('');
        expect(result).toBeNull();
      });

      it('should handle non-string input (number)', () => {
        const result = service.extractCnpjId(12345 as any);
        expect(result).toBeNull();
      });

      it('should handle non-string input (object)', () => {
        const result = service.extractCnpjId({} as any);
        expect(result).toBeNull();
      });

      it('should handle non-string input (array)', () => {
        const result = service.extractCnpjId([] as any);
        expect(result).toBeNull();
      });
    });

    describe('getKpiData()', () => {
      it('should handle null input', (done) => {
        service.getKpiData(null as any).subscribe(result => {
          expect(result.size).toBe(0);
          expect(funifierApiSpy.post).not.toHaveBeenCalled();
          done();
        });
      });

      it('should handle undefined input', (done) => {
        service.getKpiData(undefined as any).subscribe(result => {
          expect(result.size).toBe(0);
          expect(funifierApiSpy.post).not.toHaveBeenCalled();
          done();
        });
      });

      it('should handle empty array', (done) => {
        service.getKpiData([]).subscribe(result => {
          expect(result.size).toBe(0);
          expect(funifierApiSpy.post).not.toHaveBeenCalled();
          done();
        });
      });

      it('should handle array with null values', (done) => {
        service.getKpiData([null as any, undefined as any, '2000']).subscribe(result => {
          expect(funifierApiSpy.post).toHaveBeenCalled();
          done();
        });
      });
    });

    describe('enrichCompaniesWithKpis()', () => {
      it('should handle companies with null cnpj', (done) => {
        const companies = [
          { cnpj: null as any, actionCount: 5 }
        ];

        service.enrichCompaniesWithKpis(companies).subscribe(result => {
          expect(result.length).toBe(1);
          expect(result[0].cnpjId).toBeUndefined();
          expect(result[0].deliveryKpi).toBeUndefined();
          done();
        });
      });

      it('should handle companies with undefined cnpj', (done) => {
        const companies = [
          { cnpj: undefined as any, actionCount: 5 }
        ];

        service.enrichCompaniesWithKpis(companies).subscribe(result => {
          expect(result.length).toBe(1);
          expect(result[0].cnpjId).toBeUndefined();
          expect(result[0].deliveryKpi).toBeUndefined();
          done();
        });
      });

      it('should handle companies with null actionCount', (done) => {
        const companies = [
          { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: null as any }
        ];

        const mockKpiResponse: CnpjKpiData[] = [
          { _id: '2000', entrega: 89 }
        ];

        funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

        service.enrichCompaniesWithKpis(companies).subscribe(result => {
          expect(result.length).toBe(1);
          expect(result[0].actionCount).toBeNull();
          expect(result[0].deliveryKpi).toBeDefined();
          done();
        });
      });

      it('should handle companies with undefined actionCount', (done) => {
        const companies = [
          { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: undefined as any }
        ];

        const mockKpiResponse: CnpjKpiData[] = [
          { _id: '2000', entrega: 89 }
        ];

        funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

        service.enrichCompaniesWithKpis(companies).subscribe(result => {
          expect(result.length).toBe(1);
          expect(result[0].actionCount).toBeUndefined();
          expect(result[0].deliveryKpi).toBeDefined();
          done();
        });
      });
    });
  });

  // ========================================
  // Task 10.7: Graceful Degradation
  // ========================================
  describe('Graceful Degradation', () => {
    it('should continue functioning after API error', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      // First call fails
      funifierApiSpy.post.and.returnValue(throwError(() => new Error('API Error')));

      service.enrichCompaniesWithKpis(companies).subscribe(result1 => {
        expect(result1.length).toBe(1);
        expect(result1[0].deliveryKpi).toBeUndefined();

        // Clear cache
        service.clearCache();

        // Second call succeeds
        const mockKpiResponse: CnpjKpiData[] = [
          { _id: '2000', entrega: 89 }
        ];
        funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

        service.enrichCompaniesWithKpis(companies).subscribe(result2 => {
          expect(result2.length).toBe(1);
          expect(result2[0].deliveryKpi).toBeDefined();
          expect(result2[0].deliveryKpi?.current).toBe(89);
          done();
        });
      });
    });

    it('should preserve company data even when KPI fetch fails', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ];

      funifierApiSpy.post.and.returnValue(throwError(() => new Error('API Error')));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        
        // All company data should be preserved
        expect(result[0].cnpj).toBe('COMPANY A l 0001 [2000|0001-60]');
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].actionCount).toBe(5);
        
        expect(result[1].cnpj).toBe('COMPANY B l 0002 [1218|0002-45]');
        expect(result[1].cnpjId).toBe('1218');
        expect(result[1].actionCount).toBe(3);
        
        done();
      });
    });

    it('should not throw exceptions on malformed data', (done) => {
      const companies = [
        { cnpj: 'VALID l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: null as any, actionCount: null as any },
        { cnpj: undefined as any, actionCount: undefined as any },
        { cnpj: '', actionCount: 0 },
        { cnpj: 'INVALID FORMAT', actionCount: -1 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe({
        next: (result) => {
          expect(result.length).toBe(5);
          expect(result[0].deliveryKpi).toBeDefined();
          done();
        },
        error: () => {
          fail('Should not throw error on malformed data');
        }
      });
    });

    it('should handle rapid successive calls without breaking', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      let completedCalls = 0;
      const totalCalls = 5;

      for (let i = 0; i < totalCalls; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe(result => {
          expect(result.length).toBe(1);
          completedCalls++;
          if (completedCalls === totalCalls) {
            done();
          }
        });
      }
    });

    it('should maintain cache integrity after errors', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      // First call succeeds and caches data
      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result1 => {
        expect(result1[0].deliveryKpi).toBeDefined();

        // Second call should use cache even if API would fail
        funifierApiSpy.post.and.returnValue(throwError(() => new Error('API Error')));

        service.enrichCompaniesWithKpis(companies).subscribe(result2 => {
          // Should still get cached data
          expect(result2[0].deliveryKpi).toBeDefined();
          expect(result2[0].deliveryKpi?.current).toBe(89);
          done();
        });
      });
    });
  });

  // ========================================
  // Task 10.8: No Console Errors for Expected Failures
  // ========================================
  describe('Console Error Logging', () => {
    it('should log error for API failures', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(throwError(() => new Error('API Error')));

      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Error enriching companies with KPIs'),
          jasmine.anything()
        );
        done();
      });
    });

    it('should NOT log error for invalid CNPJ format (expected behavior)', (done) => {
      const companies = [
        { cnpj: 'INVALID FORMAT', actionCount: 5 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        // Should not log error for invalid format - it's expected
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        done();
      });
    });

    it('should NOT log error for empty companies array (expected behavior)', (done) => {
      service.enrichCompaniesWithKpis([]).subscribe(() => {
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        done();
      });
    });

    it('should NOT log error for missing KPI data (expected behavior)', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(of([]));

      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        // Missing KPI data is expected, should not log error
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        done();
      });
    });

    it('should log error for getKpiData API failures', (done) => {
      funifierApiSpy.post.and.returnValue(throwError(() => new Error('Network Error')));

      service.getKpiData(['2000']).subscribe(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Error fetching KPI data'),
          jasmine.anything()
        );
        done();
      });
    });

    it('should provide meaningful error messages', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const error = new Error('Specific API Error Message');
      funifierApiSpy.post.and.returnValue(throwError(() => error));

      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          jasmine.any(String),
          error
        );
        done();
      });
    });
  });

  // ========================================
  // Additional Edge Cases
  // ========================================
  describe('Additional Edge Cases', () => {
    it('should handle very long CNPJ strings', (done) => {
      const longCnpj = 'A'.repeat(1000) + ' l CODE [2000|SUFFIX]';
      const companies = [
        { cnpj: longCnpj, actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeDefined();
        done();
      });
    });

    it('should handle CNPJ with unicode characters', (done) => {
      const companies = [
        { cnpj: 'COMPAÑÍA ESPAÑOLA l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeDefined();
        done();
      });
    });

    it('should handle negative entrega values', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: -10 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(-10);
        // Percentage should be 0 for negative values
        expect(result[0].deliveryKpi?.percentage).toBe(0);
        done();
      });
    });

    it('should handle extremely large entrega values', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 999999 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(999999);
        // Percentage should be capped at 100
        expect(result[0].deliveryKpi?.percentage).toBe(100);
        done();
      });
    });

    it('should handle floating point entrega values', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89.5 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(89.5);
        done();
      });
    });

    it('should handle duplicate CNPJ IDs in companies list', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY A BRANCH l 0002 [2000|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY A HQ l 0003 [2000|0003-12]', actionCount: 7 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        
        // All should have the same KPI data
        expect(result[0].deliveryKpi?.current).toBe(89);
        expect(result[1].deliveryKpi?.current).toBe(89);
        expect(result[2].deliveryKpi?.current).toBe(89);
        
        // Should only call API once
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
        
        done();
      });
    });

    it('should handle API response with extra unexpected fields', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: any[] = [
        { 
          _id: '2000', 
          entrega: 89,
          unexpectedField1: 'value1',
          unexpectedField2: 123,
          nestedObject: { foo: 'bar' }
        }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(89);
        // Should ignore extra fields
        done();
      });
    });

    it('should handle zero actionCount', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 0 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].actionCount).toBe(0);
        expect(result[0].deliveryKpi).toBeDefined();
        done();
      });
    });
  });
});
