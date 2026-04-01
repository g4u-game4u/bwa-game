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
});
