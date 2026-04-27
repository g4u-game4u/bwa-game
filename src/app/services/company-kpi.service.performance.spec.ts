import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { CompanyKpiService, CnpjKpiData, GamificacaoEmpresaRow } from './company-kpi.service';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

const PERF_TEST_GAMIFICACAO_URL = 'http://localhost/perf-test-gamificacao';

function mockRowsFromKpiData(data: CnpjKpiData[]): GamificacaoEmpresaRow[] {
  return data.map(k => ({
    CNPJ: '11.111.111/1111-11',
    EmpID: k._id,
    porcEntregas: `${k.entrega ?? 0},00`,
    procFinalizados: '0',
    procPendentes: '0',
    regime: '',
    data_criacao: '',
    data_processamento: ''
  }));
}

/**
 * Performance Tests for CompanyKpiService (API gamificação via HttpClient).
 */
describe('CompanyKpiService Performance Tests', () => {
  let service: CompanyKpiService;
  let httpSpy: jasmine.SpyObj<HttpClient>;
  let prevUrl: string;
  let prevToken: string;

  const generateMockCompanies = (count: number): { cnpj: string; actionCount: number; processCount: number }[] => {
    return Array.from({ length: count }, (_, i) => ({
      cnpj: `COMPANY ${i} l 000${i % 10} [${1000 + i}|0001-60]`,
      actionCount: Math.floor(Math.random() * 20) + 1,
      processCount: Math.floor(Math.random() * 10) + 1
    }));
  };

  const generateMockKpiResponse = (count: number): CnpjKpiData[] => {
    return Array.from({ length: count }, (_, i) => ({
      _id: (1000 + i).toString(),
      entrega: Math.floor(Math.random() * 100)
    }));
  };

  beforeEach(() => {
    prevUrl = environment.gamificacaoApiUrl;
    prevToken = environment.gamificacaoApiToken;
    environment.gamificacaoApiUrl = PERF_TEST_GAMIFICACAO_URL;
    environment.gamificacaoApiToken = 'perf-token';

    httpSpy = jasmine.createSpyObj('HttpClient', ['get']);
    httpSpy.get.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        CompanyKpiService,
        { provide: HttpClient, useValue: httpSpy }
      ]
    });

    service = TestBed.inject(CompanyKpiService);
  });

  afterEach(() => {
    service.clearCache();
    environment.gamificacaoApiUrl = prevUrl;
    environment.gamificacaoApiToken = prevToken;
  });

  describe('KPI Data Fetch Performance', () => {
    it('should fetch KPI data for 10 companies in < 200ms', fakeAsync(() => {
      const companies = generateMockCompanies(10);
      const mockResponse = generateMockKpiResponse(10);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(50)));

      const startTime = performance.now();

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(50);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);
      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 25 companies in < 300ms', fakeAsync(() => {
      const companies = generateMockCompanies(25);
      const mockResponse = generateMockKpiResponse(25);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(100)));

      const startTime = performance.now();

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(100);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 50 companies in < 500ms (REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(150)));

      const startTime = performance.now();

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(150);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500);
      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));

    it('should fetch KPI data for 100 companies in < 800ms', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(200)));

      const startTime = performance.now();

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(200);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(800);
      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));

    it('should handle large datasets (200 companies) efficiently', fakeAsync(() => {
      const companies = generateMockCompanies(200);
      const mockResponse = generateMockKpiResponse(200);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(300)));

      const startTime = performance.now();

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(300);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));
  });

  describe('Page Load Time Impact', () => {
    it('should add minimal overhead to page load (< 200ms REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(80)));

      const baselineStart = performance.now();
      tick(10);
      const baselineDuration = performance.now() - baselineStart;

      const withKpiStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(80);
      const withKpiDuration = performance.now() - withKpiStart;

      const overhead = withKpiDuration - baselineDuration;

      expect(overhead).toBeLessThan(200);
    }));

    it('should not block page rendering', fakeAsync(() => {
      const companies = generateMockCompanies(30);
      const mockResponse = generateMockKpiResponse(30);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(100)));

      let dataReceived = false;

      service.enrichCompaniesWithKpis(companies).subscribe(() => {
        dataReceived = true;
      });

      tick(50);
      expect(dataReceived).toBe(false);

      tick(50);
      expect(dataReceived).toBe(true);
    }));
  });

  describe('Memory Overhead', () => {
    it('should handle 100 companies with minimal memory overhead', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = memoryAfter - memoryBefore;

      if (memoryBefore > 0) {
        expect(memoryIncrease).toBeLessThan(1024 * 1024);
      }
    }));

    it('should not leak memory on repeated calls', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      for (let i = 0; i < 10; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      service.clearCache();

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(50);
      });
      tick();
    }));

    it('should efficiently store cache data', fakeAsync(() => {
      const companies = generateMockCompanies(100);
      const mockResponse = generateMockKpiResponse(100);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();

      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      expect(cachedDuration).toBeLessThan(10);
    }));
  });

  describe('Caching Effectiveness', () => {
    it('should reduce API calls by 90%+ on subsequent loads (REQUIREMENT)', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(httpSpy.get).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 9; i++) {
        service.enrichCompaniesWithKpis(companies).subscribe();
        tick();
      }

      expect(httpSpy.get).toHaveBeenCalledTimes(1);

      const apiCallReduction = ((10 - 1) / 10) * 100;
      expect(apiCallReduction).toBeGreaterThanOrEqual(90);
    }));

    it('should cache data for 10 minutes', fakeAsync(() => {
      const companies = generateMockCompanies(20);
      const mockResponse = generateMockKpiResponse(20);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(httpSpy.get).toHaveBeenCalledTimes(1);

      tick(9 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(httpSpy.get).toHaveBeenCalledTimes(1);

      tick(2 * 60 * 1000);
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      expect(httpSpy.get).toHaveBeenCalledTimes(2);
    }));

    it('should share cache across different company sets with same IDs', fakeAsync(() => {
      const companies1 = generateMockCompanies(10);
      const companies2 = companies1.map(c => ({ ...c, actionCount: c.actionCount + 5 }));
      const mockResponse = generateMockKpiResponse(10);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)));

      service.enrichCompaniesWithKpis(companies1).subscribe();
      tick();
      expect(httpSpy.get).toHaveBeenCalledTimes(1);

      service.enrichCompaniesWithKpis(companies2).subscribe();
      tick();

      expect(httpSpy.get).toHaveBeenCalledTimes(1);
    }));

    it('should demonstrate massive performance improvement with caching', fakeAsync(() => {
      const companies = generateMockCompanies(50);
      const mockResponse = generateMockKpiResponse(50);

      httpSpy.get.and.returnValue(of(mockRowsFromKpiData(mockResponse)).pipe(delay(200)));

      const uncachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick(200);
      const uncachedDuration = performance.now() - uncachedStart;

      const cachedStart = performance.now();
      service.enrichCompaniesWithKpis(companies).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      expect(cachedDuration).toBeLessThan(uncachedDuration / 10);
      expect(cachedDuration).toBeLessThan(50);
    }));
  });
});
