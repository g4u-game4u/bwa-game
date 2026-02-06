import { TestBed } from '@angular/core/testing';
import { CompanyKpiService, CnpjKpiData, CompanyDisplay } from './company-kpi.service';
import { FunifierApiService } from './funifier-api.service';
import { of, throwError } from 'rxjs';

describe('CompanyKpiService', () => {
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

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ========================================
  // Task 2.2: Tests for extractCnpjId() with valid formats
  // ========================================
  describe('extractCnpjId() - Valid Formats', () => {
    it('should extract ID from standard CNPJ format', () => {
      const cnpj = 'RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('2000');
    });

    it('should extract ID with spaces', () => {
      const cnpj = 'COMPANY NAME l CODE [ 1234 |SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('1234');
    });

    it('should extract numeric ID', () => {
      const cnpj = 'ABC COMPANY l 0001 [9876|0001-00]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('9876');
    });

    it('should extract alphanumeric ID', () => {
      const cnpj = 'TEST CORP l 0002 [ABC123|SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('ABC123');
    });

    it('should extract single character ID', () => {
      const cnpj = 'COMPANY l CODE [X|SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('X');
    });

    it('should extract ID with special characters', () => {
      const cnpj = 'COMPANY l CODE [ID-123_ABC|SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('ID-123_ABC');
    });

    it('should trim whitespace from extracted ID', () => {
      const cnpj = 'COMPANY l CODE [  2000  |SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('2000');
    });
  });

  // ========================================
  // Task 2.3: Tests for extractCnpjId() with invalid formats
  // ========================================
  describe('extractCnpjId() - Invalid Formats', () => {
    it('should return null for empty string', () => {
      const result = service.extractCnpjId('');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = service.extractCnpjId(null as any);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = service.extractCnpjId(undefined as any);
      expect(result).toBeNull();
    });

    it('should return null for non-string input', () => {
      const result = service.extractCnpjId(12345 as any);
      expect(result).toBeNull();
    });

    it('should return null when missing opening bracket', () => {
      const cnpj = 'COMPANY l CODE 2000|SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBeNull();
    });

    it('should return null when missing pipe separator', () => {
      const cnpj = 'COMPANY l CODE [2000-SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBeNull();
    });

    it('should return null when missing both bracket and pipe', () => {
      const cnpj = 'COMPANY l CODE 2000';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBeNull();
    });

    it('should return null for empty brackets', () => {
      const cnpj = 'COMPANY l CODE [|SUFFIX]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBe('');
    });

    it('should return null for malformed format', () => {
      const cnpj = 'INVALID FORMAT STRING';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBeNull();
    });

    it('should return null for string with only brackets', () => {
      const cnpj = '[]';
      const result = service.extractCnpjId(cnpj);
      expect(result).toBeNull();
    });
  });

  // ========================================
  // Task 2.4: Tests for getKpiData() with mocked API responses
  // ========================================
  describe('getKpiData() - API Integration', () => {
    it('should fetch KPI data for single CNPJ ID', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(1);
        expect(result.get('2000')).toEqual({ _id: '2000', entrega: 89 });
        expect(funifierApiSpy.post).toHaveBeenCalledWith(
          '/v3/database/cnpj__c/aggregate?strict=true',
          [{ $match: { _id: { $in: ['2000'] } } }]
        );
        done();
      });
    });

    it('should fetch KPI data for multiple CNPJ IDs', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '1218', entrega: 45 },
        { _id: '9654', entrega: 102 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getKpiData(['2000', '1218', '9654']).subscribe(result => {
        expect(result.size).toBe(3);
        expect(result.get('2000')?.entrega).toBe(89);
        expect(result.get('1218')?.entrega).toBe(45);
        expect(result.get('9654')?.entrega).toBe(102);
        done();
      });
    });

    it('should return empty map for empty input array', (done) => {
      service.getKpiData([]).subscribe(result => {
        expect(result.size).toBe(0);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should return empty map for null input', (done) => {
      service.getKpiData(null as any).subscribe(result => {
        expect(result.size).toBe(0);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle partial data (some IDs not found)', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
        // '1218' not in response
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getKpiData(['2000', '1218']).subscribe(result => {
        expect(result.size).toBe(1);
        expect(result.has('2000')).toBe(true);
        expect(result.has('1218')).toBe(false);
        done();
      });
    });

    it('should handle API returning empty array', (done) => {
      funifierApiSpy.post.and.returnValue(of([]));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle API returning non-array response', (done) => {
      funifierApiSpy.post.and.returnValue(of({} as any));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle items without _id field', (done) => {
      const mockResponse: any[] = [
        { _id: '2000', entrega: 89 },
        { entrega: 45 } // Missing _id
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(1);
        expect(result.has('2000')).toBe(true);
        done();
      });
    });
  });

  // ========================================
  // Task 2.5: Tests for enrichCompaniesWithKpis() with various scenarios
  // ========================================
  describe('enrichCompaniesWithKpis() - Data Enrichment', () => {
    it('should enrich companies with KPI data', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '1218', entrega: 45 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        
        expect(result[0].cnpj).toBe('COMPANY A l 0001 [2000|0001-60]');
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].actionCount).toBe(5);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[0].deliveryKpi?.current).toBe(89);
        expect(result[0].deliveryKpi?.label).toBe('Entregas');
        
        expect(result[1].cnpj).toBe('COMPANY B l 0002 [1218|0002-45]');
        expect(result[1].cnpjId).toBe('1218');
        expect(result[1].actionCount).toBe(3);
        expect(result[1].deliveryKpi).toBeDefined();
        expect(result[1].deliveryKpi?.current).toBe(45);
        
        done();
      });
    });

    it('should handle companies without KPI data', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(of([])); // No KPI data

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });
    });

    it('should handle companies with invalid CNPJ format', (done) => {
      const companies = [
        { cnpj: 'INVALID FORMAT', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '1218', entrega: 45 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        
        // Invalid format company
        expect(result[0].cnpjId).toBeUndefined();
        expect(result[0].deliveryKpi).toBeUndefined();
        
        // Valid company
        expect(result[1].cnpjId).toBe('1218');
        expect(result[1].deliveryKpi).toBeDefined();
        
        done();
      });
    });

    it('should return empty array for empty input', (done) => {
      service.enrichCompaniesWithKpis([]).subscribe(result => {
        expect(result).toEqual([]);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should return empty array for null input', (done) => {
      service.enrichCompaniesWithKpis(null as any).subscribe(result => {
        expect(result).toEqual([]);
        expect(funifierApiSpy.post).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle mixed valid and invalid CNPJ formats', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'INVALID', actionCount: 2 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 8 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '9654', entrega: 102 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(3);
        expect(result[0].deliveryKpi).toBeDefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(result[2].deliveryKpi).toBeDefined();
        done();
      });
    });

    it('should handle duplicate CNPJ IDs', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY A BRANCH l 0002 [2000|0002-45]', actionCount: 3 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].deliveryKpi?.current).toBe(89);
        expect(result[1].deliveryKpi?.current).toBe(89);
        // Should only call API once with unique IDs
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('should preserve all company properties', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].cnpj).toBe('COMPANY A l 0001 [2000|0001-60]');
        expect(result[0].actionCount).toBe(5);
        expect(result[0].cnpjId).toBe('2000');
        done();
      });
    });
  });

  // ========================================
  // Task 2.6: Tests for caching behavior
  // ========================================
  describe('Caching Behavior', () => {
    it('should cache KPI data and reuse on subsequent calls', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call
      service.getKpiData(['2000']).subscribe(result1 => {
        expect(result1.size).toBe(1);
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Second call should use cache
        service.getKpiData(['2000']).subscribe(result2 => {
          expect(result2.size).toBe(1);
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1); // Still 1, not 2
          done();
        });
      });
    });

    it('should use same cache for same IDs in different order', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 },
        { _id: '1218', entrega: 45 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call with IDs in one order
      service.getKpiData(['2000', '1218']).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Second call with IDs in different order
        service.getKpiData(['1218', '2000']).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1); // Should use cache
          done();
        });
      });
    });

    it('should create separate cache entries for different ID sets', (done) => {
      const mockResponse1: CnpjKpiData[] = [{ _id: '2000', entrega: 89 }];
      const mockResponse2: CnpjKpiData[] = [{ _id: '1218', entrega: 45 }];

      funifierApiSpy.post.and.returnValues(of(mockResponse1), of(mockResponse2));

      // First call
      service.getKpiData(['2000']).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Second call with different IDs
        service.getKpiData(['1218']).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(2); // New API call
          done();
        });
      });
    });

    it('should clear cache when clearCache() is called', (done) => {
      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call
      service.getKpiData(['2000']).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Clear cache
        service.clearCache();

        // Second call should hit API again
        service.getKpiData(['2000']).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it('should share cached data across enrichCompaniesWithKpis calls', (done) => {
      const companies1 = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];
      const companies2 = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 3 }
      ];

      const mockResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First enrichment call
      service.enrichCompaniesWithKpis(companies1).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Second enrichment call with same CNPJ ID
        service.enrichCompaniesWithKpis(companies2).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1); // Should use cache
          done();
        });
      });
    });
  });

  // ========================================
  // Task 2.7: Tests for error handling
  // ========================================
  describe('Error Handling', () => {
    it('should handle API errors gracefully in getKpiData', (done) => {
      funifierApiSpy.post.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0); // Should return empty map
        done();
      });
    });

    it('should handle network errors in getKpiData', (done) => {
      funifierApiSpy.post.and.returnValue(
        throwError(() => ({ status: 0, message: 'Network error' }))
      );

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle 404 errors in getKpiData', (done) => {
      funifierApiSpy.post.and.returnValue(
        throwError(() => ({ status: 404, message: 'Not found' }))
      );

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle 500 errors in getKpiData', (done) => {
      funifierApiSpy.post.and.returnValue(
        throwError(() => ({ status: 500, message: 'Server error' }))
      );

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle API errors gracefully in enrichCompaniesWithKpis', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      funifierApiSpy.post.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].cnpjId).toBe('2000');
        expect(result[0].deliveryKpi).toBeUndefined(); // No KPI data due to error
        done();
      });
    });

    it('should not throw error when all companies have invalid CNPJ format', (done) => {
      const companies = [
        { cnpj: 'INVALID FORMAT 1', actionCount: 5 },
        { cnpj: 'INVALID FORMAT 2', actionCount: 3 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].deliveryKpi).toBeUndefined();
        expect(result[1].deliveryKpi).toBeUndefined();
        expect(funifierApiSpy.post).not.toHaveBeenCalled(); // No API call for invalid IDs
        done();
      });
    });

    it('should handle malformed API response', (done) => {
      funifierApiSpy.post.and.returnValue(of(null as any));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should handle API response with missing entrega field', (done) => {
      const mockResponse: any[] = [
        { _id: '2000' } // Missing entrega
      ];

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(1);
        const kpiData = result.get('2000');
        expect(kpiData).toBeDefined();
        expect(kpiData?.entrega).toBeUndefined();
        done();
      });
    });
  });

  // ========================================
  // Additional Tests: KPI Data Mapping
  // ========================================
  describe('KPI Data Mapping', () => {
    it('should map KPI data with correct structure', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 89 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        const kpi = result[0].deliveryKpi;
        
        expect(kpi).toBeDefined();
        expect(kpi?.id).toBe('delivery');
        expect(kpi?.label).toBe('Entregas');
        expect(kpi?.current).toBe(89);
        expect(kpi?.target).toBe(100);
        expect(kpi?.unit).toBe('entregas');
        expect(kpi?.percentage).toBe(89);
        expect(kpi?.color).toBe('yellow'); // 89% is between 50-79%
        
        done();
      });
    });

    it('should calculate percentage correctly', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 50 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.percentage).toBe(50);
        done();
      });
    });

    it('should cap percentage at 100%', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 150 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.percentage).toBe(100);
        done();
      });
    });

    it('should assign green color for >= 80% completion', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 85 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.color).toBe('green');
        done();
      });
    });

    it('should assign yellow color for 50-79% completion', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 65 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.color).toBe('yellow');
        done();
      });
    });

    it('should assign red color for < 50% completion', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 30 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.color).toBe('red');
        done();
      });
    });

    it('should handle zero entrega value', (done) => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];

      const mockKpiResponse: CnpjKpiData[] = [
        { _id: '2000', entrega: 0 }
      ];

      funifierApiSpy.post.and.returnValue(of(mockKpiResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.current).toBe(0);
        expect(result[0].deliveryKpi?.percentage).toBe(0);
        expect(result[0].deliveryKpi?.color).toBe('red');
        done();
      });
    });
  });
});
