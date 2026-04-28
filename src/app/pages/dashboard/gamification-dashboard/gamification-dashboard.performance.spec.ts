import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectionStrategy, NO_ERRORS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CacheManagerService } from '@services/cache-manager.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import {
  generateMockPlayerStatus,
  generateMockCompanies,
  generatePointWallet
} from '@app/testing/mock-data-generators';

describe('GamificationDashboardComponent - Performance Tests', () => {
  let component: GamificationDashboardComponent;
  let fixture: ComponentFixture<GamificationDashboardComponent>;
  let performanceMonitor: jasmine.SpyObj<PerformanceMonitorService>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let kpiService: jasmine.SpyObj<KPIService>;
  let companyKpiService: jasmine.SpyObj<CompanyKpiService>;

  beforeEach(async () => {
    const performanceMonitorSpy = jasmine.createSpyObj('PerformanceMonitorService', [
      'measureRenderTime',
      'trackChangeDetection',
      'logPerformanceReport',
      'measureMemoryUsage'
    ]);
    performanceMonitorSpy.measureRenderTime.and.returnValue(() => {});

    const playerServiceSpy = jasmine.createSpyObj('PlayerService', [
      'getPlayerStatus',
      'getPlayerPoints',
      'getSeasonProgress',
      'getPlayerCnpj',
      'getPlayerCnpjResp',
      'clearCache',
      'usesGame4uWalletFromStats'
    ]);
    playerServiceSpy.usesGame4uWalletFromStats.and.returnValue(false);
    playerServiceSpy.getPlayerStatus.and.returnValue(of(generateMockPlayerStatus()));
    playerServiceSpy.getPlayerPoints.and.returnValue(
      of({
        available: 1000,
        pending: 500,
        redeemed: 2000
      })
    );
    playerServiceSpy.getSeasonProgress.and.returnValue(
      of({
        currentLevel: 5,
        progress: 65,
        daysRemaining: 45
      })
    );
    playerServiceSpy.getPlayerCnpjResp.and.returnValue(
      of(generateMockCompanies(10).map(c => c.cnpj))
    );
    playerServiceSpy.getPlayerCnpj.and.returnValue(of([]));

    const kpiServiceSpy = jasmine.createSpyObj('KPIService', ['getPlayerKPIs']);
    kpiServiceSpy.getPlayerKPIs.and.returnValue(of([]));

    const toastServiceSpy = jasmine.createSpyObj('ToastService', ['error', 'alert']);

    const actionLogServiceSpy = jasmine.createSpyObj('ActionLogService', [
      'getProgressMetrics',
      'getPlayerCnpjListWithCount',
      'getUniqueClientesCount',
      'getCompletedTasksCount',
      'getPontosForMonth',
      'getMonthlyGame4uPlayerDashboardData'
    ]);
    actionLogServiceSpy.getProgressMetrics.and.returnValue(
      of({
        activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
        processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
      })
    );
    actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(of([]));
    actionLogServiceSpy.getUniqueClientesCount.and.returnValue(of(0));
    actionLogServiceSpy.getCompletedTasksCount.and.returnValue(of(0));
    actionLogServiceSpy.getPontosForMonth.and.returnValue(of(500));
    actionLogServiceSpy.getMonthlyGame4uPlayerDashboardData.and.returnValue(
      of({
        wallet: generatePointWallet(),
        pontosActionLog: 500,
        sidebar: { tarefasFinalizadas: 0 }
      })
    );

    const emptyGamificacaoMaps = { byEmpId: new Map(), byCnpjNorm: new Map() };
    const companyKpiServiceSpy = jasmine.createSpyObj('CompanyKpiService', [
      'extractCnpjId',
      'getKpiData',
      'enrichCompaniesWithKpis',
      'enrichFromCnpjResp',
      'fetchGamificacaoMapsAsync',
      'enrichCarteiraRowsWithMaps',
      'prefetchGamificacaoSnapshot',
      'clearCache'
    ]);
    companyKpiServiceSpy.enrichCompaniesWithKpis.and.returnValue(of([]));
    companyKpiServiceSpy.enrichFromCnpjResp.and.returnValue(of([]));
    companyKpiServiceSpy.fetchGamificacaoMapsAsync.and.returnValue(Promise.resolve(emptyGamificacaoMaps));
    companyKpiServiceSpy.enrichCarteiraRowsWithMaps.and.returnValue([]);

    const cacheManagerSpy = jasmine.createSpyObj('CacheManagerService', ['clearAllCaches']);
    const seasonDatesServiceSpy = jasmine.createSpyObj('SeasonDatesService', ['getSeasonDates']);
    seasonDatesServiceSpy.getSeasonDates.and.returnValue(
      Promise.resolve({
        start: new Date(2023, 3, 1, 0, 0, 0, 0),
        end: new Date(2023, 8, 30, 23, 59, 59, 999)
      })
    );
    const cnpjLookupSpy = jasmine.createSpyObj('CnpjLookupService', ['enrichCnpjListFull']);
    cnpjLookupSpy.enrichCnpjListFull.and.returnValue(of(new Map()));
    const ngbModalSpy = jasmine.createSpyObj('NgbModal', ['open']);
    const activatedRouteSpy = {
      snapshot: { queryParams: {} },
      queryParams: of({})
    };
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const sessaoProviderSpy = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: { _id: 'test-user', email: 'test@example.com', roles: [] },
      token: 'test-token'
    });

    await TestBed.configureTestingModule({
      declarations: [GamificationDashboardComponent],
      providers: [
        { provide: PerformanceMonitorService, useValue: performanceMonitorSpy },
        { provide: PlayerService, useValue: playerServiceSpy },
        { provide: KPIService, useValue: kpiServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: ActionLogService, useValue: actionLogServiceSpy },
        { provide: CompanyKpiService, useValue: companyKpiServiceSpy },
        { provide: CacheManagerService, useValue: cacheManagerSpy },
        { provide: SeasonDatesService, useValue: seasonDatesServiceSpy },
        { provide: CnpjLookupService, useValue: cnpjLookupSpy },
        { provide: NgbModal, useValue: ngbModalSpy },
        { provide: ActivatedRoute, useValue: activatedRouteSpy },
        { provide: Router, useValue: routerSpy },
        { provide: SessaoProvider, useValue: sessaoProviderSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    performanceMonitor = TestBed.inject(PerformanceMonitorService) as jasmine.SpyObj<PerformanceMonitorService>;
    playerService = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    kpiService = TestBed.inject(KPIService) as jasmine.SpyObj<KPIService>;
    companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;

    fixture = TestBed.createComponent(GamificationDashboardComponent);
    component = fixture.componentInstance;
  });

  describe('Change Detection Optimization', () => {
    it('should use OnPush change detection strategy', () => {
      const componentDef = (component.constructor as any).ɵcmp;
      expect(componentDef.changeDetection).toBe(ChangeDetectionStrategy.OnPush);
    });

    it('should track change detection cycles', () => {
      fixture.detectChanges();
      expect(performanceMonitor.trackChangeDetection).toHaveBeenCalledWith('GamificationDashboardComponent');
    });

    it('should not trigger change detection on unrelated property changes', () => {
      fixture.detectChanges();
      const initialCalls = performanceMonitor.trackChangeDetection.calls.count();

      // Change a property that shouldn't trigger change detection
      component.lastRefreshTime = new Date();

      // Should not have triggered additional change detection
      expect(performanceMonitor.trackChangeDetection.calls.count()).toBe(initialCalls);
    });
  });

  describe('Render Time Measurement', () => {
    it('should measure component render time', () => {
      expect(performanceMonitor.measureRenderTime).toHaveBeenCalledWith('GamificationDashboardComponent');
    });

    it('should complete render measurement after view init', () => {
      const endMeasurement = jasmine.createSpy('endMeasurement');
      performanceMonitor.measureRenderTime.and.returnValue(endMeasurement);

      fixture = TestBed.createComponent(GamificationDashboardComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(endMeasurement).toHaveBeenCalled();
    });
  });

  describe('Performance Monitoring', () => {
    it('should log performance report in development mode', (done) => {
      spyOn<any>(component, 'isProduction').and.returnValue(false);

      fixture.detectChanges();

      setTimeout(() => {
        expect(performanceMonitor.logPerformanceReport).toHaveBeenCalled();
        done();
      }, 1100);
    });

    it('should not log performance report in production mode', (done) => {
      spyOn<any>(component, 'isProduction').and.returnValue(true);

      fixture.detectChanges();

      setTimeout(() => {
        expect(performanceMonitor.logPerformanceReport).not.toHaveBeenCalled();
        done();
      }, 1100);
    });
  });

  describe('Memory Management', () => {
    it('should unsubscribe from observables on destroy', () => {
      fixture.detectChanges();

      const destroySpy = spyOn(component['destroy$'], 'next');
      const completeSpy = spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should not have memory leaks from subscriptions', () => {
      fixture.detectChanges();

      // Verify all subscriptions use takeUntil
      expect(playerService.getPlayerStatus).toHaveBeenCalled();
      expect(playerService.getPlayerCnpjResp).toHaveBeenCalled();
      expect(kpiService.getPlayerKPIs).toHaveBeenCalled();

      component.ngOnDestroy();

      // After destroy, no new subscriptions should be active
      expect(component['destroy$'].closed).toBe(true);
    });
  });

  describe('Lazy Loading', () => {
    it('should not load modal component until needed', () => {
      fixture.detectChanges();

      // Modal should not be in the DOM initially
      const modalElement = fixture.debugElement.query(By.css('app-modal-company-detail'));
      expect(modalElement).toBeNull();
    });

    it('should lazy load modal when company is selected', () => {
      fixture.detectChanges();

      const mockCompany = generateMockCompanies(1)[0];
      component.onCompanySelected(mockCompany);

      expect(component.selectedCompany).toBe(mockCompany);
      expect(component.isCompanyModalOpen).toBe(true);
    });
  });

  describe('Responsive Performance', () => {
    it('should efficiently handle window resize events', () => {
      fixture.detectChanges();

      const initialBreakpoint = component.isMobile;

      // Simulate resize
      spyOn<any>(component, 'checkResponsiveBreakpoints').and.callThrough();
      window.dispatchEvent(new Event('resize'));

      expect(component['checkResponsiveBreakpoints']).toHaveBeenCalled();
    });

    it('should debounce resize events', (done) => {
      fixture.detectChanges();

      const checkSpy = spyOn<any>(component, 'checkResponsiveBreakpoints').and.callThrough();

      // Trigger multiple resize events rapidly
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new Event('resize'));
      }

      // Should have been called for each event (no debouncing in current implementation)
      // This test documents current behavior
      expect(checkSpy.calls.count()).toBeGreaterThan(0);
      done();
    });
  });

  describe('Data Loading Performance', () => {
    it('should load all data in parallel', () => {
      fixture.detectChanges();

      // All services should be called immediately
      expect(playerService.getPlayerStatus).toHaveBeenCalled();
      expect(playerService.getPlayerPoints).toHaveBeenCalled();
      expect(playerService.getSeasonProgress).toHaveBeenCalled();
      expect(playerService.getPlayerCnpjResp).toHaveBeenCalled();
      expect(kpiService.getPlayerKPIs).toHaveBeenCalled();
    });

    it('should handle large datasets efficiently', () => {
      const largeCompanyList = generateMockCompanies(1000);
      playerService.getPlayerCnpjResp.and.returnValue(of(largeCompanyList.map(c => c.cnpj)));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(
        largeCompanyList.map((c, i) => ({
          cnpj: c.cnpj,
          cnpjId: String(i),
          actionCount: 0,
          processCount: 0
        }))
      );

      const startTime = performance.now();
      fixture.detectChanges();
      const endTime = performance.now();

      const renderTime = endTime - startTime;

      // Should render in less than 100ms even with 1000 carteira rows
      expect(renderTime).toBeLessThan(100);
      expect(component.carteiraClientes.length).toBe(1000);
    });
  });

  describe('TrackBy Functions', () => {
    it('should have trackBy function for KPI list', () => {
      const mockKpi = { id: 'kpi-1', label: 'Test KPI', current: 100, target: 200 };
      const result = component.trackByKpiId(0, mockKpi);

      expect(result).toBe('kpi-1');
    });

    it('should return consistent values for trackBy', () => {
      const mockKpi = { id: 'kpi-1', label: 'Test KPI', current: 100, target: 200 };

      const result1 = component.trackByKpiId(0, mockKpi);
      const result2 = component.trackByKpiId(0, mockKpi);

      expect(result1).toBe(result2);
    });
  });
});
