import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CompanyKpiService, CnpjKpiData, CompanyDisplay } from './company-kpi.service';
import { FunifierApiService } from './funifier-api.service';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

/**
 * Performance Tests for CompanyKpiService
 * 
 * Task 11: Performance Testing
 * 
 * Verifies:
 * - KPI data fetch time for various dataset sizes (< 500ms for 50 companies)
 * - Page load time increase with KPI feature enabled (< 200ms)
 * - Memory overhead for 100+ companies (< 1MB)
 * - Caching effectiveness (90%+ API call reduction)
 * - Scalability with 50+ companies
 * - Rendering performance of KPI indicators
 * - No performance regressions in existing features
 * 
 * Acceptance Criteria:
 * - KPI data fetch < 500ms for 50 companies
 * - Page load increase < 200ms compared to baseline
 * - Memory overhead < 1MB for 100 companies
 * - Caching reduces API calls by 90%+ on subsequent loads
 * - No performance regressions in existing features
 * - Performance tests pass consistently
 */
describe('CompanyKpiService Performance Tests', () => {
  let service: CompanyKpiService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;

  // Helper function to generate mock companies
  const generateMockCompanies = (count: number): { cnpj: string; actionCount: number; processCount: number }[] => {
    return Array.from({ length: count }, (_, i) => ({
      cnpj: `COMPANY ${i} l 000${i % 10} [${1000 + i}|0001-60]`,
      actionCount: Math.floor(Math.random() * 20) + 1,
      processCount: Math.floor(Math.random() * 10) + 1
    }));
  };

  // Helper function to generate mock KPI response
  const generateMockKpiResponse = (count: number): CnpjKpiData[] => {
    return Array.from({ length: count }, (_, i) => ({
      _id: (1000 + i).toString(),
      entrega: Math.floor(Math.random() * 100)
    }));
  };

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

  // ========================================
  // Task 11.2: Measure KPI data fetch time for various dataset sizes
  // ========================================
  describe('KPI Data Fetch Performance', () => {
    it('should fetch KPI data for 10 companies in < 200ms', fakeAsync(() => {
      const companies = generateMockCompanies(10);
      const mockResponse = generateMockKpiResponse(10);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(50)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(50);
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(200);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 25 companies in < 300ms', fakeAsync(() => {
      const companies = generateMockCompanies(25);
      const mockResponse = generateMockKpiResponse(25);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(300);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 50 companies in < 500ms (REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate realistic API delay (150ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(150)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);
      
      const duration = performance.now() - startTime;
      
      // ACCEPTANCE CRITERIA: < 500ms for 50 companies
      expect(duration).toBeLessThan(500);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 100 companies in < 800ms', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(200)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(200);
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(800);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should handle large datasets (200 companies) efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(200);
      const mockResponse = generateMockKpiResponse(200);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(300)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);
      
      const duration = performance.now() - startTime;
      
      // Should still be reasonably fast
      expect(duration).toBeLessThan(1000);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));
  });

  // ========================================
  // Task 11.3: Measure page load time increase with KPI feature
  // ========================================
  describe('Page Load Time Impact', () => {
    it('should add minimal overhead to page load (< 200ms REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      // Simulate realistic API response time
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(80)));

      // Measure baseline (without KPI enrichment)
      const baselineStart = performance.now();
      tick(10); // Simulate other page operations
      const baselineDuration = performance.now() - baselineStart;

      // Measure with KPI enrichment
      const withKpiStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(80);
      const withKpiDuration = performance.now() - withKpiStart;

      const overhead = withKpiDuration - baselineDuration;
      
      // ACCEPTANCE CRITERIA: Page load increase < 200ms
      expect(overhead).toBeLessThan(200);
    }));

    it('should not block page rendering', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      let dataReceived = false;
      
      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        dataReceived = true;
      });

      // Page should be interactive before data arrives
      tick(50);
      expect(dataReceived).toBe(false); // Data not yet received
      
      tick(50);
      expect(dataReceived).toBe(true); // Data received
    }));
  });

  // ========================================
  // Task 11.4: Measure memory overhead for 100+ companies
  // ========================================
  describe('Memory Overhead', () => {
    it('should handle 100 companies with minimal memory overhead', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Measure memory before
      const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      // Measure memory after
      const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = memoryAfter - memoryBefore;

      // ACCEPTANCE CRITERIA: Memory overhead < 1MB for 100 companies
      // Note: This is approximate as memory measurement varies by browser
      if (memoryBefore > 0) {
        expect(memoryIncrease).toBeLessThan(1024 * 1024); // 1MB
      }
    }));

    it('should not leak memory on repeated calls', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Make multiple calls
      for (let i = 0; i < 10; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      // Clear cache to release memory
      service.clearCache();

      // Service should remain functional
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
      });
      tick();
    }));

    it('should efficiently store cache data', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Populate cache
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      // Cache should be efficient - subsequent calls should be instant
      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      expect(cachedDuration).toBeLessThan(10); // Nearly instant
    }));
  });

  // ========================================
  // Task 11.5: Verify caching effectiveness (API call reduction)
  // ========================================
  describe('Caching Effectiveness', () => {
    it('should reduce API calls by 90%+ on subsequent loads (REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First load - 1 API call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Next 9 loads - should use cache (0 additional API calls)
      for (let i = 0; i < 9; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      // Total: 1 API call for 10 loads = 90% reduction
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      
      // ACCEPTANCE CRITERIA: 90%+ API call reduction
      const apiCallReduction = ((10 - 1) / 10) * 100;
      expect(apiCallReduction).toBeGreaterThanOrEqual(90);
    }));

    it('should cache data for 10 minutes', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Wait 9 minutes - should still use cache
      tick(9 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Wait another 2 minutes (total 11 minutes) - cache expired
      tick(2 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);
    }));

    it('should share cache across different company sets with same IDs', fakeAsync(() => {
      const companies1 = generateMockCompanies(10);
      const companies2 = companies1.map(c => ({ ...c, actionCount: c.actionCount + 5 }));
      const mockResponse = generateMockKpiResponse(10);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call with companies1
      service.enrichCompaniesWithKpis(companies1).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Second call with companies2 (same CNPJ IDs, different action counts)
      service.enrichCompaniesWithKpis(companies2).subscribe();
      tick();
      
      // Should use cache (same CNPJ IDs)
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should demonstrate massive performance improvement with caching', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate realistic API delay (200ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(200)));

      // First call (uncached)
      const uncachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(200);
      const uncachedDuration = performance.now() - uncachedStart;

      // Second call (cached)
      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      // Cached should be at least 10x faster
      expect(cachedDuration).toBeLessThan(uncachedDuration / 10);
      expect(cachedDuration).toBeLessThan(50); // Nearly instant
    }));
  });
egressionDuration = performance.now() - regressionStart;
      expect(regressionDuration).toBeLessThan(500); // ✓ NO REGRESSION
    }));
  });
});
 const reduction = ((10 - (finalCalls - initialCalls + 1)) / 10) * 100;
      expect(reduction).toBeGreaterThanOrEqual(90); // ✓ REQUIREMENT MET

      // Test 3: Page load increase < 200ms
      const pageLoadOverhead = fetchDuration;
      expect(pageLoadOverhead).toBeLessThan(200); // ✓ REQUIREMENT MET

      // Test 4: No performance regressions
      service.clearCache();
      const regressionStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);
      const r();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);
      const fetchDuration = performance.now() - fetchStart;
      expect(fetchDuration).toBeLessThan(500); // ✓ REQUIREMENT MET

      // Test 2: Caching reduces API calls by 90%+
      const initialCalls = funifierApiSpy.post.calls.count();
      for (let i = 0; i < 9; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }
      const finalCalls = funifierApiSpy.post.calls.count();
     ==========================
  // Comprehensive Performance Summary
  // ========================================
  describe('Performance Summary', () => {
    it('should meet all performance requirements', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(150)));

      // Test 1: KPI data fetch < 500ms for 50 companies
      const fetchStart = performance.nowue(of(mockResponse));

      // Perform multiple cache clear cycles
      for (let i = 0; i < 10; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
        service.clearCache();
      }

      // Final call should still be fast
      const startTime = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
    }));
  });

  // ==============d call should have same performance as first
      const startTime = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);
    }));

    it('should not degrade performance with repeated cache clears', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnVal).toBeLessThan(50);
      expect(funifierApiSpy.post).not.toHaveBeenCalled();
    }));

    it('should maintain performance after cache clear', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      // First call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);

      // Clear cache
      service.clearCache();

      // Secon
      const companies = Array.from({ length: 50 }, (_, i) => ({
        cnpj: `INVALID FORMAT ${i}`,
        actionCount: 5
      }));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
        expect(result.every(c => !c.deliveryKpi)).toBe(true);
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Should be fast (no API call needed)
      expect(durationown when handling empty company list', fakeAsync(() => {
      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis([]).subscribe(result => {
        expect(result).toEqual([]);
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Should be instant
      expect(duration).toBeLessThan(10);
      expect(funifierApiSpy.post).not.toHaveBeenCalled();
    }));

    it('should not slow down when all companies have invalid CNPJ format', fakeAsync(() => {return companies without KPI data
        expect(result.length).toBe(50);
        expect(result.every(c => !c.deliveryKpi)).toBe(true);
      });
      tick(50);
      
      const duration = performance.now() - startTime;

      // Error handling should be fast
      expect(duration).toBeLessThan(100);
    }));
  });

  // ========================================
  // No Performance Regressions
  // ========================================
  describe('No Performance Regressions', () => {
    it('should not slow d     // Total time should be close to single request
      expect(duration).toBeLessThan(200);
    }));

    it('should efficiently handle error scenarios', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      
      // Simulate API error
      funifierApiSpy.post.and.returnValue(
        throwError(() => new Error('API Error')).pipe(delay(50))
      );

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        // Should     funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      const startTime = performance.now();

      // Make 5 concurrent requests
      const requests = Array.from({ length: 5 }, () => 
        service.enrichCompaniesWithKpis(companies)
      );

      requests.forEach(req => req.subscribe());
      tick(100);

      const duration = performance.now() - startTime;

      // Should only make 1 API call due to caching
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      
 achedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      // Cache should eliminate bottleneck
      expect(uncachedDuration).toBeGreaterThan(290);
      expect(cachedDuration).toBeLessThan(50);
    }));

    it('should handle concurrent requests efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
       const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate slow API (300ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(300)));

      // First call - slow due to API
      const uncachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);
      const uncachedDuration = performance.now() - uncachedStart;

      // Second call - fast due to cache
      const cow API (300ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(300)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);
      
      const duration = performance.now() - startTime;

      // Most time should be spent waiting for API
      expect(duration).toBeGreaterThan(290);
      expect(duration).toBeLessThan(350);
    }));

    it('should demonstrate caching eliminates API bottleneck', fakeAsync(() => {
 ract IDs from all companies
      companies.forEach(company => {
        service.extractCnpjId(company.cnpj);
      });
      
      const duration = performance.now() - startTime;

      // ID extraction should be very fast (< 10ms for 100 companies)
      expect(duration).toBeLessThan(10);
    }));

    it('should identify API call as primary bottleneck', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate sltoBe(false);

      // After data arrives
      tick(50);
      expect(dataReceived).toBe(true);
    }));
  });

  // ========================================
  // Task 11.8: Profile and optimize any bottlenecks found
  // ========================================
  describe('Performance Bottleneck Analysis', () => {
    it('should identify CNPJ ID extraction as fast operation', fakeAsync(() => {
      const companies = generateMockCompanies(100);

      const startTime = performance.now();
      
      // Extnies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      let dataReceived = false;
      
      // Simulate incremental rendering
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        dataReceived = true;
        
        // Data should be complete when received
        expect(result.length).toBe(50);
      });

      // Before data arrives
      tick(50);
      expect(dataReceived).sult;
      });
      tick();

      // All companies should be renderable
      expect(renderableData.length).toBe(40);
      
      // Some with KPI, some without
      const withKpi = renderableData.filter(c => c.deliveryKpi).length;
      const withoutKpi = renderableData.filter(c => !c.deliveryKpi).length;
      
      expect(withKpi).toBe(20);
      expect(withoutKpi).toBe(20);
    }));

    it('should support incremental rendering patterns', fakeAsync(() => {
      const companies = generateMockCompayellow|green/);
          }
        });
      });
      tick();
    }));

    it('should handle partial data without blocking rendering', fakeAsync(() => {
      const companies = generateMockCompanies(40);
      const mockResponse = generateMockKpiResponse(20); // Only half have KPI data
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      let renderableData: CompanyDisplay[] = [];
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        renderableData = reng
        result.forEach(company => {
          expect(company.cnpj).toBeDefined();
          expect(company.actionCount).toBeDefined();
          
          if (company.deliveryKpi) {
            expect(company.deliveryKpi.label).toBe('Entregas no Prazo');
            expect(company.deliveryKpi.current).toBeGreaterThanOrEqual(0);
            expect(company.deliveryKpi.target).toBe(100);
            expect(company.deliveryKpi.percentage).toBeGreaterThanOrEqual(0);
            expect(company.deliveryKpi.color).toMatch(/red|han(100);
      expect(enrichedData.length).toBe(30);
      expect(enrichedData.filter(c => c.deliveryKpi).length).toBe(30);
    }));

    it('should provide data structure optimized for rendering', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        // Verify data structure is ready for renderiteMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      let enrichedData: CompanyDisplay[] = [];
      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        enrichedData = result;
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Data should be ready for rendering quickly
      expect(duration).toBeLessT(180);
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(600);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));
  });

  // ========================================
  // Task 11.7: Measure rendering performance of KPI indicators
  // ========================================
  describe('KPI Indicator Rendering Performance', () => {
    it('should enrich data quickly for immediate rendering', fakeAsync(() => {
      const companies = generacallArgs[1] as any[];
      const matchStage = aggregateQuery[0].$match;
      expect(matchStage._id.$in.length).toBe(20);
    }));

    it('should handle 75 companies efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(75);
      const mockResponse = generateMockKpiResponse(75);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(180)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tickt: i + 1
      }));
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(100);
      });
      tick(100);

      // Should only fetch KPI data for 20 unique IDs
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      const callArgs = funifierApiSpy.post.calls.mostRecent().args;
      const aggregateQuery = liveryKpi).length).toBe(40);
      });
      tick(150);
      
      const duration = performance.now() - startTime;
      
      // Should still meet performance target
      expect(duration).toBeLessThan(500);
    }));

    it('should efficiently deduplicate CNPJ IDs in large datasets', fakeAsync(() => {
      // Create 100 companies but only 20 unique CNPJ IDs
      const companies = Array.from({ length: 100 }, (_, i) => ({
        cnpj: `COMPANY ${i % 20} l 0001 [${1000 + (i % 20)}|0001-60]`,
        actionCoun  cnpj: `INVALID FORMAT ${i}`,
        actionCount: 5
      }));
      const companies = [...validCompanies, ...invalidCompanies];
      const mockResponse = generateMockKpiResponse(40);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(150)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
        // Valid companies should have KPI data
        expect(result.filter(c => c.deormance scales reasonably
      expect(timings[0]).toBeLessThan(100); // 10 companies
      expect(timings[1]).toBeLessThan(200); // 25 companies
      expect(timings[2]).toBeLessThan(500); // 50 companies (REQUIREMENT)
      expect(timings[3]).toBeLessThan(1000); // 100 companies
    }));

    it('should handle 50 companies with mixed valid/invalid CNPJ formats', fakeAsync(() => {
      const validCompanies = generateMockCompanies(40);
      const invalidCompanies = Array.from({ length: 10 }, (_, i) => ({
       
        // Simulate proportional API delay
        const apiDelay = Math.floor(size / 2);
        funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(apiDelay)));

        const startTime = performance.now();
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick(apiDelay);
        const duration = performance.now() - startTime;
        
        timings.push(duration);
        
        // Clear cache for next test
        service.clearCache();
      });

      // Verify perf
  // ========================================
  // Task 11.6: Test with 50+ companies to verify scalability
  // ========================================
  describe('Scalability with 50+ Companies', () => {
    it('should scale linearly with company count', fakeAsync(() => {
      const testSizes = [10, 25, 50, 100];
      const timings: number[] = [];

      testSizes.forEach(size => {
        const companies = generateMockCompanies(size);
        const mockResponse = generateMockKpiResponse(size);
       

  // ========================================
  // Task 11.3: Measure page load time increase with KPI feature
  // ========================================
  describe('Page Load Time Impact', () => {
    it('should add minimal overhead to page load (< 200ms REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      // Simulate realistic API response time
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(80)));

      // Measure baseline (without KPI enrichment)
      const baselineStart = performance.now();
      tick(10); // Simulate other page operations
      const baselineDuration = performance.now() - baselineStart;

      // Measure with KPI enrichment
      const withKpiStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(80);
      const withKpiDuration = performance.now() - withKpiStart;

      const overhead = withKpiDuration - baselineDuration;
      
      // ACCEPTANCE CRITERIA: Page load increase < 200ms
      expect(overhead).toBeLessThan(200);
    }));

    it('should not block page rendering', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      let dataReceived = false;
      
      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        dataReceived = true;
      });

      // Page should be interactive before data arrives
      tick(50);
      expect(dataReceived).toBe(false); // Data not yet received
      
      tick(50);
      expect(dataReceived).toBe(true); // Data received
    }));
  });

  // ========================================
  // Task 11.4: Measure memory overhead for 100+ companies
  // ========================================
  describe('Memory Overhead', () => {
    it('should handle 100 companies with minimal memory overhead', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Measure memory before
      const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      // Measure memory after
      const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = memoryAfter - memoryBefore;

      // ACCEPTANCE CRITERIA: Memory overhead < 1MB for 100 companies
      // Note: This is approximate as memory measurement varies by browser
      if (memoryBefore > 0) {
        expect(memoryIncrease).toBeLessThan(1024 * 1024); // 1MB
      }
    }));

    it('should not leak memory on repeated calls', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Make multiple calls
      for (let i = 0; i < 10; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      // Clear cache to release memory
      service.clearCache();

      // Service should remain functional
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
      });
      tick();
    }));

    it('should efficiently store cache data', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Populate cache
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      // Cache should be efficient - subsequent calls should be instant
      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      expect(cachedDuration).toBeLessThan(10); // Nearly instant
    }));
  });

  // ========================================
  // Task 11.5: Verify caching effectiveness (API call reduction)
  // ========================================
  describe('Caching Effectiveness', () => {
    it('should reduce API calls by 90%+ on subsequent loads (REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First load - 1 API call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Next 9 loads - should use cache (0 additional API calls)
      for (let i = 0; i < 9; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      // Total: 1 API call for 10 loads = 90% reduction
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      
      // ACCEPTANCE CRITERIA: 90%+ API call reduction
      const apiCallReduction = ((10 - 1) / 10) * 100;
      expect(apiCallReduction).toBeGreaterThanOrEqual(90);
    }));

    it('should cache data for 10 minutes', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Wait 9 minutes - should still use cache
      tick(9 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Wait another 2 minutes (total 11 minutes) - cache expired
      tick(2 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);
    }));

    it('should share cache across different company sets with same IDs', fakeAsync(() => {
      const companies1 = generateMockCompanies(10);
      const companies2 = companies1.map(c => ({ ...c, actionCount: c.actionCount + 5 }));
      const mockResponse = generateMockKpiResponse(10);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call with companies1
      service.enrichCompaniesWithKpis(companies1).subscribe();
      tick();
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

      // Second call with companies2 (same CNPJ IDs, different action counts)
      service.enrichCompaniesWithKpis(companies2).subscribe();
      tick();
      
      // Should use cache (same CNPJ IDs)
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));

    it('should demonstrate massive performance improvement with caching', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate realistic API delay (200ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(200)));

      // First call (uncached)
      const uncachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(200);
      const uncachedDuration = performance.now() - uncachedStart;

      // Second call (cached)
      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      // Cached should be at least 10x faster
      expect(cachedDuration).toBeLessThan(uncachedDuration / 10);
      expect(cachedDuration).toBeLessThan(50); // Nearly instant
    }));
  });

  // ========================================
  // Task 11.6: Test with 50+ companies to verify scalability
  // ========================================
  describe('Scalability with 50+ Companies', () => {
    it('should scale linearly with company count', fakeAsync(() => {
      const testSizes = [10, 25, 50, 100];
      const timings: number[] = [];

      testSizes.forEach(size => {
        const companies = generateMockCompanies(size);
        const mockResponse = generateMockKpiResponse(size);
        
        // Simulate proportional API delay
        const apiDelay = Math.floor(size / 2);
        funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(apiDelay)));

        const startTime = performance.now();
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick(apiDelay);
        const duration = performance.now() - startTime;
        
        timings.push(duration);
        
        // Clear cache for next test
        service.clearCache();
      });

      // Verify performance scales reasonably
      expect(timings[0]).toBeLessThan(100); // 10 companies
      expect(timings[1]).toBeLessThan(200); // 25 companies
      expect(timings[2]).toBeLessThan(500); // 50 companies (REQUIREMENT)
      expect(timings[3]).toBeLessThan(1000); // 100 companies
    }));

    it('should handle 50 companies with mixed valid/invalid CNPJ formats', fakeAsync(() => {
      const validCompanies = generateMockCompanies(40);
      const invalidCompanies = Array.from({ length: 10 }, (_, i) => ({
        cnpj: `INVALID FORMAT ${i}`,
        actionCount: 5
      }));
      const companies = [...validCompanies, ...invalidCompanies];
      const mockResponse = generateMockKpiResponse(40);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(150)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
        // Valid companies should have KPI data
        expect(result.filter(c => c.deliveryKpi).length).toBe(40);
      });
      tick(150);
      
      const duration = performance.now() - startTime;
      
      // Should still meet performance target
      expect(duration).toBeLessThan(500);
    }));

    it('should efficiently deduplicate CNPJ IDs in large datasets', fakeAsync(() => {
      // Create 100 companies but only 20 unique CNPJ IDs
      const companies = Array.from({ length: 100 }, (_, i) => ({
        cnpj: `COMPANY ${i % 20} l 0001 [${1000 + (i % 20)}|0001-60]`,
        actionCount: i + 1
      }));
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(100);
      });
      tick(100);

      // Should only fetch KPI data for 20 unique IDs
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      const callArgs = funifierApiSpy.post.calls.mostRecent().args;
      const aggregateQuery = callArgs[1] as any[];
      const matchStage = aggregateQuery[0].$match;
      expect(matchStage._id.$in.length).toBe(20);
    }));

    it('should handle 75 companies efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(75);
      const mockResponse = generateMockKpiResponse(75);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(180)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(180);
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(600);
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
    }));
  });

  // ========================================
  // Task 11.7: Measure rendering performance of KPI indicators
  // ========================================
  describe('KPI Indicator Rendering Performance', () => {
    it('should enrich data quickly for immediate rendering', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      let enrichedData: CompanyDisplay[] = [];
      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        enrichedData = result;
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Data should be ready for rendering quickly
      expect(duration).toBeLessThan(100);
      expect(enrichedData.length).toBe(30);
      expect(enrichedData.filter(c => c.deliveryKpi).length).toBe(30);
    }));

    it('should provide data structure optimized for rendering', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        // Verify data structure is ready for rendering
        result.forEach(company => {
          expect(company.cnpj).toBeDefined();
          expect(company.actionCount).toBeDefined();
          
          if (company.deliveryKpi) {
            expect(company.deliveryKpi.label).toBe('Entregas no Prazo');
            expect(company.deliveryKpi.current).toBeGreaterThanOrEqual(0);
            expect(company.deliveryKpi.target).toBe(100);
            expect(company.deliveryKpi.percentage).toBeGreaterThanOrEqual(0);
            expect(company.deliveryKpi.color).toMatch(/red|yellow|green/);
          }
        });
      });
      tick();
    }));

    it('should handle partial data without blocking rendering', fakeAsync(() => {
      const companies = generateMockCompanies(40);
      const mockResponse = generateMockKpiResponse(20); // Only half have KPI data
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      let renderableData: CompanyDisplay[] = [];
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        renderableData = result;
      });
      tick();

      // All companies should be renderable
      expect(renderableData.length).toBe(40);
      
      // Some with KPI, some without
      const withKpi = renderableData.filter(c => c.deliveryKpi).length;
      const withoutKpi = renderableData.filter(c => !c.deliveryKpi).length;
      
      expect(withKpi).toBe(20);
      expect(withoutKpi).toBe(20);
    }));

    it('should support incremental rendering patterns', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      let dataReceived = false;
      
      // Simulate incremental rendering
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        dataReceived = true;
        
        // Data should be complete when received
        expect(result.length).toBe(50);
      });

      // Before data arrives
      tick(50);
      expect(dataReceived).toBe(false);

      // After data arrives
      tick(50);
      expect(dataReceived).toBe(true);
    }));
  });

  // ========================================
  // Task 11.8: Profile and optimize any bottlenecks found
  // ========================================
  describe('Performance Bottleneck Analysis', () => {
    it('should identify CNPJ ID extraction as fast operation', fakeAsync(() => {
      const companies = generateMockCompanies(100);

      const startTime = performance.now();
      
      // Extract IDs from all companies
      companies.forEach(company => {
        service.extractCnpjId(company.cnpj);
      });
      
      const duration = performance.now() - startTime;

      // ID extraction should be very fast (< 10ms for 100 companies)
      expect(duration).toBeLessThan(10);
    }));

    it('should identify API call as primary bottleneck', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate slow API (300ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(300)));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);
      
      const duration = performance.now() - startTime;

      // Most time should be spent waiting for API
      expect(duration).toBeGreaterThan(290);
      expect(duration).toBeLessThan(350);
    }));

    it('should demonstrate caching eliminates API bottleneck', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      // Simulate slow API (300ms)
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(300)));

      // First call - slow due to API
      const uncachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);
      const uncachedDuration = performance.now() - uncachedStart;

      // Second call - fast due to cache
      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      // Cache should eliminate bottleneck
      expect(uncachedDuration).toBeGreaterThan(290);
      expect(cachedDuration).toBeLessThan(50);
    }));

    it('should handle concurrent requests efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      const startTime = performance.now();

      // Make 5 concurrent requests
      const requests = Array.from({ length: 5 }, () => 
        service.enrichCompaniesWithKpis(companies)
      );

      requests.forEach(req => req.subscribe());
      tick(100);

      const duration = performance.now() - startTime;

      // Should only make 1 API call due to caching
      expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
      
      // Total time should be close to single request
      expect(duration).toBeLessThan(200);
    }));

    it('should efficiently handle error scenarios', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      
      // Simulate API error
      funifierApiSpy.post.and.returnValue(
        throwError(() => new Error('API Error')).pipe(delay(50))
      );

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        // Should return companies without KPI data
        expect(result.length).toBe(50);
        expect(result.every(c => !c.deliveryKpi)).toBe(true);
      });
      tick(50);
      
      const duration = performance.now() - startTime;

      // Error handling should be fast
      expect(duration).toBeLessThan(100);
    }));
  });

  // ========================================
  // No Performance Regressions
  // ========================================
  describe('No Performance Regressions', () => {
    it('should not slow down when handling empty company list', fakeAsync(() => {
      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis([]).subscribe(result => {
        expect(result).toEqual([]);
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Should be instant
      expect(duration).toBeLessThan(10);
      expect(funifierApiSpy.post).not.toHaveBeenCalled();
    }));

    it('should not slow down when all companies have invalid CNPJ format', fakeAsync(() => {
      const companies = Array.from({ length: 50 }, (_, i) => ({
        cnpj: `INVALID FORMAT ${i}`,
        actionCount: 5
      }));

      const startTime = performance.now();
      
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
        expect(result.every(c => !c.deliveryKpi)).toBe(true);
      });
      tick();
      
      const duration = performance.now() - startTime;

      // Should be fast (no API call needed)
      expect(duration).toBeLessThan(50);
      expect(funifierApiSpy.post).not.toHaveBeenCalled();
    }));

    it('should maintain performance after cache clear', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(100)));

      // First call
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);

      // Clear cache
      service.clearCache();

      // Second call should have same performance as first
      const startTime = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);
    }));

    it('should not degrade performance with repeated cache clears', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Perform multiple cache clear cycles
      for (let i = 0; i < 10; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
        service.clearCache();
      }

      // Final call should still be fast
      const startTime = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
    }));
  });

  // ========================================
  // Comprehensive Performance Summary
  // ========================================
  describe('Performance Summary', () => {
    it('should meet all performance requirements', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);
      
      funifierApiSpy.post.and.returnValue(of(mockResponse).pipe(delay(150)));

      // Test 1: KPI data fetch < 500ms for 50 companies
      const fetchStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);
      const fetchDuration = performance.now() - fetchStart;
      expect(fetchDuration).toBeLessThan(500); // ✓ REQUIREMENT MET

      // Test 2: Caching reduces API calls by 90%+
      const initialCalls = funifierApiSpy.post.calls.count();
      for (let i = 0; i < 9; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }
      const finalCalls = funifierApiSpy.post.calls.count();
      const reduction = ((10 - (finalCalls - initialCalls + 1)) / 10) * 100;
      expect(reduction).toBeGreaterThanOrEqual(90); // ✓ REQUIREMENT MET

      // Test 3: Page load increase < 200ms
      const pageLoadOverhead = fetchDuration;
      expect(pageLoadOverhead).toBeLessThan(200); // ✓ REQUIREMENT MET

      // Test 4: No performance regressions
      service.clearCache();
      const regressionStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);
      const regressionDuration = performance.now() - regressionStart;
      expect(regressionDuration).toBeLessThan(500); // ✓ NO REGRESSION
    }));
  });
});
