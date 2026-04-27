import { ComponentFixture, TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { 
  generatePlayerStatus, 
  generatePointWallet, 
  generateSeasonProgress,
  generateCompany,
  generateKPIData
} from '@app/testing/mock-data-generators';
import { Company } from '@model/gamification-dashboard.model';

function companiesFromCnpjList(list: { cnpj: string }[]): Company[] {
  return list.map((item, i) => {
    const name = item.cnpj.includes(' l ') ? item.cnpj.split(' l ')[0].trim() : `Empresa ${i}`;
    return {
      id: String(i + 1),
      name,
      cnpj: item.cnpj,
      healthScore: 80,
      kpis: []
    };
  });
}

/** IDs devolvidos por `PlayerService.getPlayerCnpjResp` (CNPJ / chave da carteira). */
function cnpjRespIdsFromList(list: { cnpj: string }[]): string[] {
  return companiesFromCnpjList(list).map(c => c.cnpj);
}

describe('GamificationDashboardComponent - Integration Tests', () => {
  let component: GamificationDashboardComponent;
  let fixture: ComponentFixture<GamificationDashboardComponent>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let kpiService: jasmine.SpyObj<KPIService>;
  let toastService: jasmine.SpyObj<ToastService>;
  let actionLogService: jasmine.SpyObj<ActionLogService>;
  beforeEach(async () => {
    // Create spy objects for services
    const playerServiceSpy = jasmine.createSpyObj('PlayerService', [
      'getPlayerStatus',
      'getPlayerPoints',
      'getSeasonProgress',
      'getPlayerCnpj',
      'getPlayerCnpjResp',
      'clearCache'
    ]);
    playerServiceSpy.getPlayerCnpjResp.and.returnValue(of([]));

    const kpiServiceSpy = jasmine.createSpyObj('KPIService', [
      'getPlayerKPIs'
    ]);
    
    const toastServiceSpy = jasmine.createSpyObj('ToastService', [
      'error',
      'alert',
      'success'
    ]);

    const actionLogServiceSpy = jasmine.createSpyObj('ActionLogService', [
      'getProgressMetrics',
      'getPlayerCnpjListWithCount',
      'getUniqueClientesCount',
      'getCompletedTasksCount',
      'getPontosForMonth'
    ]);
    actionLogServiceSpy.getProgressMetrics.and.returnValue(of({
      activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
      processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
    }));
    actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(of([]));
    actionLogServiceSpy.getUniqueClientesCount.and.returnValue(of(0));
    actionLogServiceSpy.getCompletedTasksCount.and.returnValue(of(0));
    actionLogServiceSpy.getPontosForMonth.and.returnValue(of(500));

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
    companyKpiServiceSpy.fetchGamificacaoMapsAsync.and.returnValue(
      Promise.resolve(emptyGamificacaoMaps)
    );
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
    const ngbModalSpy = jasmine.createSpyObj('NgbModal', ['open']);
    const activatedRouteSpy = {
      snapshot: { queryParams: {} },
      queryParams: of({})
    };
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    const performanceMonitorSpy = jasmine.createSpyObj('PerformanceMonitorService', [
      'measureRenderTime',
      'trackChangeDetection',
      'logPerformanceReport'
    ]);
    performanceMonitorSpy.measureRenderTime.and.returnValue(() => {});

    const sessaoProviderSpy = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: { _id: 'test-user', email: 'test@example.com', roles: [] },
      token: 'test-token'
    });

    cnpjLookupSpy.enrichCnpjListFull.and.returnValue(of(new Map()));

    await TestBed.configureTestingModule({
      declarations: [GamificationDashboardComponent],
      providers: [
        { provide: PlayerService, useValue: playerServiceSpy },
        { provide: KPIService, useValue: kpiServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: ActionLogService, useValue: actionLogServiceSpy },
        { provide: CompanyKpiService, useValue: companyKpiServiceSpy },
        { provide: PerformanceMonitorService, useValue: performanceMonitorSpy },
        { provide: SessaoProvider, useValue: sessaoProviderSpy },
        { provide: CacheManagerService, useValue: cacheManagerSpy },
        { provide: SeasonDatesService, useValue: seasonDatesServiceSpy },
        { provide: CnpjLookupService, useValue: cnpjLookupSpy },
        { provide: NgbModal, useValue: ngbModalSpy },
        { provide: ActivatedRoute, useValue: activatedRouteSpy },
        { provide: Router, useValue: routerSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    playerService = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    kpiService = TestBed.inject(KPIService) as jasmine.SpyObj<KPIService>;
    toastService = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    actionLogService = TestBed.inject(ActionLogService) as jasmine.SpyObj<ActionLogService>;
    playerService.getPlayerCnpj.and.returnValue(of([]));

    fixture = TestBed.createComponent(GamificationDashboardComponent);
    component = fixture.componentInstance;
  });

  describe('Dashboard Initialization', () => {
    it('should create the dashboard component', () => {
      expect(component).toBeTruthy();
    });

    it('should load all child components data on initialization', fakeAsync(() => {
      // Arrange
      const mockPlayerStatus = generatePlayerStatus();
      const mockPointWallet = generatePointWallet();
      const mockSeasonProgress = generateSeasonProgress();
      const mockCompanies = [generateCompany(), generateCompany()];
      const mockKPIs = [generateKPIData(), generateKPIData(), generateKPIData()];

      playerService.getPlayerStatus.and.returnValue(of(mockPlayerStatus));
      playerService.getPlayerPoints.and.returnValue(of(mockPointWallet));
      playerService.getSeasonProgress.and.returnValue(of(mockSeasonProgress));
      playerService.getPlayerCnpjResp.and.returnValue(of(mockCompanies.map(c => c.cnpj)));
      kpiService.getPlayerKPIs.and.returnValue(of(mockKPIs));

      // Act
      fixture.detectChanges();
      flushMicrotasks(); // Triggers ngOnInit
      tick();

      // Assert
      expect(component.playerStatus).toEqual(mockPlayerStatus);
      expect(component.pointWallet).toEqual(mockPointWallet);
      expect(component.seasonProgress).toEqual(mockSeasonProgress);
      expect(component.companies).toEqual([]);
      expect(component.playerKPIs).toEqual(mockKPIs);
      expect(component.isLoadingPlayer).toBe(false);
      expect(component.isLoadingCompanies).toBe(false);
      expect(component.isLoadingKPIs).toBe(false);
    }));

    it('should set loading states correctly during initialization', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()).pipe(delay(100)));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()).pipe(delay(100)));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()).pipe(delay(100)));
      playerService.getPlayerCnpjResp.and.returnValue(of([]).pipe(delay(100)));
      kpiService.getPlayerKPIs.and.returnValue(of([]).pipe(delay(100)));

      // Act
      fixture.detectChanges();
      flushMicrotasks();

      // Assert - Initially loading
      expect(component.isLoadingPlayer).toBe(true);
      expect(component.isLoadingCompanies).toBe(true);
      expect(component.isLoadingKPIs).toBe(true);
      expect(component.isLoading).toBe(true);

      // Wait for all observables to complete
      tick(150);

      // Assert - Loading complete
      expect(component.isLoadingPlayer).toBe(false);
      expect(component.isLoadingCompanies).toBe(false);
      expect(component.isLoadingKPIs).toBe(false);
      expect(component.isLoading).toBe(false);
    }));
  });

  describe('Data Flow to Child Components', () => {
    it('should pass correct data to SeasonLevel component', fakeAsync(() => {
      // Arrange
      const mockPlayerStatus = generatePlayerStatus();
      playerService.getPlayerStatus.and.returnValue(of(mockPlayerStatus));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.playerStatus).toEqual(mockPlayerStatus);
      expect(component.playerStatus?.seasonLevel).toBe(mockPlayerStatus.seasonLevel);
      expect(component.playerStatus?.name).toBe(mockPlayerStatus.name);
      expect(component.playerStatus?.metadata).toEqual(mockPlayerStatus.metadata);
    }));

    it('should pass correct data to PointWallet component', fakeAsync(() => {
      // Arrange
      const mockPointWallet = generatePointWallet();
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(mockPointWallet));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.pointWallet).toEqual(mockPointWallet);
    }));

    it('should pass correct data to SeasonProgress component', fakeAsync(() => {
      // Arrange
      const mockSeasonProgress = generateSeasonProgress();
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(mockSeasonProgress));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.seasonProgress).toEqual(mockSeasonProgress);
    }));

    it('should pass correct data to CompanyTable component', fakeAsync(() => {
      // Arrange
      const mockCompanies = [generateCompany(), generateCompany(), generateCompany()];
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of(mockCompanies.map(c => c.cnpj)));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert — lista `companies` (cnpj_performance) não é mais carregada aqui
      expect(component.companies).toEqual([]);
    }));

    it('should pass correct data to KPI components', fakeAsync(() => {
      // Arrange
      const mockKPIs = [
        generateKPIData(),
        generateKPIData(),
        generateKPIData()
      ];
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of(mockKPIs));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.playerKPIs).toEqual(mockKPIs);
      expect(component.playerKPIs.length).toBe(3);
    }));
  });

  describe('Month Change Handling', () => {
    it('should trigger data reload when month changes', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Reset call counts (month change only reloads KPIs + progress)
      kpiService.getPlayerKPIs.calls.reset();
      actionLogService.getProgressMetrics.calls.reset();

      const monthsAgo = 1; // 1 month ago

      // Act
      component.onMonthChange(monthsAgo);
      tick();

      // Assert
      const expectedMonth = new Date();
      expectedMonth.setMonth(expectedMonth.getMonth() - monthsAgo);
      expect(component.selectedMonth!.getMonth()).toEqual(expectedMonth.getMonth());
      expect(kpiService.getPlayerKPIs).toHaveBeenCalled();
      expect(actionLogService.getProgressMetrics).toHaveBeenCalled();
    }));

    it('should update selectedMonth property when month changes', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
      
      const monthsAgo = 2; // 2 months ago

      // Act
      component.onMonthChange(monthsAgo);
      tick();

      // Assert
      const expectedMonth = new Date();
      expectedMonth.setMonth(expectedMonth.getMonth() - monthsAgo);
      expect(component.selectedMonth!.getMonth()).toEqual(expectedMonth.getMonth());
    }));
  });

  describe('Refresh Mechanism', () => {
    /**
     * Test manual refresh updates data
     * Validates: Requirements 12.1, 12.2
     */
    it('should reload all data when manual refresh is triggered', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Reset call counts
      playerService.getPlayerStatus.calls.reset();
      playerService.getPlayerPoints.calls.reset();
      playerService.getSeasonProgress.calls.reset();
      playerService.getPlayerCnpjResp.calls.reset();
      kpiService.getPlayerKPIs.calls.reset();

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(playerService.getPlayerStatus).toHaveBeenCalled();
      expect(playerService.getPlayerPoints).toHaveBeenCalled();
      expect(playerService.getSeasonProgress).toHaveBeenCalled();
      expect(playerService.getPlayerCnpjResp).toHaveBeenCalled();
      expect(kpiService.getPlayerKPIs).toHaveBeenCalled();
      expect(toastService.alert).toHaveBeenCalledWith('Atualizando dados...');
    }));

    /**
     * Test refresh timestamp updates
     * Validates: Requirements 12.1, 12.3
     */
    it('should update lastRefreshTime when refresh is triggered', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      const beforeRefresh = new Date();

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(component.lastRefreshTime).toBeTruthy();
      expect(component.lastRefreshTime!.getTime()).toBeGreaterThanOrEqual(beforeRefresh.getTime());
    }));

    /**
     * Test refresh timestamp formatting
     * Validates: Requirements 12.1
     */
    it('should format refresh time correctly', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      component.refreshData();
      tick();

      // Assert - Should show "Agora mesmo" for recent refresh
      expect(component.formattedRefreshTime).toBe('Agora mesmo');

      // Simulate time passing
      component.lastRefreshTime = new Date(Date.now() - 65000); // 65 seconds ago
      expect(component.formattedRefreshTime).toBe('Há 1 minuto');

      component.lastRefreshTime = new Date(Date.now() - 180000); // 3 minutes ago
      expect(component.formattedRefreshTime).toBe('Há 3 minutos');
    }));

    /**
     * Test refresh timestamp updates on multiple refreshes
     * Validates: Requirements 12.1, 12.3
     */
    it('should update timestamp on each refresh call', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act - First refresh
      component.refreshData();
      tick();
      const firstRefreshTime = component.lastRefreshTime;

      // Wait a bit
      tick(1000);

      // Act - Second refresh
      component.refreshData();
      tick();
      const secondRefreshTime = component.lastRefreshTime;

      // Assert
      expect(secondRefreshTime).toBeTruthy();
      expect(firstRefreshTime).toBeTruthy();
      expect(secondRefreshTime!.getTime()).toBeGreaterThan(firstRefreshTime!.getTime());
    }));

    /**
     * Test context preservation during refresh - selected month
     * Validates: Requirements 12.4, 12.5
     */
    it('should preserve selected month during refresh', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      const selectedMonth = new Date(2023, 5, 15); // June 15, 2023
      component.selectedMonth = selectedMonth;

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(component.selectedMonth).toEqual(selectedMonth);
    }));

    /**
     * Test context preservation during refresh - modal state
     * Validates: Requirements 12.4, 12.5
     */
    it('should preserve modal state during refresh', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([generateCompany().cnpj]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      const selectedCompany = generateCompany();
      component.selectedCompany = selectedCompany;
      component.isCompanyModalOpen = true;

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(component.selectedCompany).toEqual(selectedCompany);
      expect(component.isCompanyModalOpen).toBe(true);
    }));

    /**
     * Test data updates while preserving context
     * Validates: Requirements 12.2, 12.4
     */
    it('should update data while preserving user context', fakeAsync(() => {
      // Arrange
      const initialPlayerStatus = generatePlayerStatus();
      const updatedPlayerStatus = { ...initialPlayerStatus, seasonLevel: initialPlayerStatus.seasonLevel + 1 };
      
      playerService.getPlayerStatus.and.returnValue(of(initialPlayerStatus));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Set user context
      const selectedMonth = new Date(2023, 4, 1);
      component.selectedMonth = selectedMonth;
      component.isCompanyModalOpen = true;

      // Update service to return new data
      playerService.getPlayerStatus.and.returnValue(of(updatedPlayerStatus));

      // Act
      component.refreshData();
      tick();

      // Assert - Data updated
      expect(component.playerStatus?.seasonLevel).toBe(updatedPlayerStatus.seasonLevel);
      
      // Assert - Context preserved
      expect(component.selectedMonth).toEqual(selectedMonth);
      expect(component.isCompanyModalOpen).toBe(true);
    }));

    /**
     * Test refresh shows user feedback
     * Validates: Requirements 12.1
     */
    it('should show toast notification when refresh starts', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(toastService.alert).toHaveBeenCalledWith('Atualizando dados...');
    }));

    /**
     * Test refresh handles errors gracefully
     * Validates: Requirements 12.2
     */
    it('should handle errors during refresh without losing context', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Set user context
      const selectedMonth = new Date(2023, 3, 1);
      component.selectedMonth = selectedMonth;

      // Make one service fail
      const error = new Error('Network error');
      playerService.getPlayerStatus.and.returnValue(throwError(() => error));

      // Act
      component.refreshData();
      tick();

      // Assert - Context preserved despite error (sem toast de erro)
      expect(component.selectedMonth).toEqual(selectedMonth);
      expect(toastService.error).not.toHaveBeenCalled();
    }));

    /**
     * Test refresh updates all affected components
     * Validates: Requirements 12.4
     */
    it('should update all affected components when data is refreshed', fakeAsync(() => {
      // Arrange
      const initialCompanies = [generateCompany()];
      const updatedCompanies = [generateCompany(), generateCompany()];
      
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of(initialCompanies.map(c => c.cnpj)));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.companies).toEqual([]);

      // Update service to return new data
      playerService.getPlayerCnpjResp.and.returnValue(of(updatedCompanies.map(c => c.cnpj)));

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(component.companies).toEqual([]);
    }));

    /**
     * Test refresh timestamp is null initially
     * Validates: Requirements 12.1
     */
    it('should have null lastRefreshTime before first load', () => {
      // Assert
      expect(component.lastRefreshTime).toBeNull();
      expect(component.formattedRefreshTime).toBe('');
    });

    /**
     * Test refresh preserves loading states correctly
     * Validates: Requirements 12.2
     */
    it('should manage loading states correctly during refresh', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()).pipe(delay(50)));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()).pipe(delay(50)));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()).pipe(delay(50)));
      playerService.getPlayerCnpjResp.and.returnValue(of([]).pipe(delay(50)));
      kpiService.getPlayerKPIs.and.returnValue(of([]).pipe(delay(50)));

      // Act
      component.refreshData();

      // Assert - Loading states should be set
      expect(component.isLoadingPlayer).toBe(true);
      expect(component.isLoadingCompanies).toBe(true);
      expect(component.isLoadingKPIs).toBe(true);

      tick(100);

      // Assert - Loading states should be cleared
      expect(component.isLoadingPlayer).toBe(false);
      expect(component.isLoadingCompanies).toBe(false);
      expect(component.isLoadingKPIs).toBe(false);
    }));
  });

  describe('Error Handling', () => {
    it('should handle player data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load player data');
      playerService.getPlayerStatus.and.returnValue(throwError(() => error));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.playerStatus).toBeNull();
      expect(component.isLoadingPlayer).toBe(false);
      expect(toastService.error).not.toHaveBeenCalled();
    }));

    it('should handle company data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load companies');
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(throwError(() => error));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.companies).toEqual([]);
      expect(component.isLoadingCompanies).toBe(false);
      expect(toastService.error).not.toHaveBeenCalled();
    }));

    it('should handle KPI data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load KPIs');
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.playerKPIs).toEqual([]);
      expect(component.isLoadingKPIs).toBe(false);
      expect(toastService.error).not.toHaveBeenCalled();
    }));

    it('should continue loading other sections when one fails', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load player data');
      playerService.getPlayerStatus.and.returnValue(throwError(() => error));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([generateCompany().cnpj]));
      kpiService.getPlayerKPIs.and.returnValue(of([generateKPIData()]));

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert - Other sections should still load
      expect(component.companies.length).toBe(1);
      expect(component.playerKPIs.length).toBe(1);
    }));
  });

  describe('Company Modal Interaction', () => {
    it('should open modal when company is selected', () => {
      // Arrange
      const mockCompany = generateCompany();

      // Act
      component.onCompanySelected(mockCompany);

      // Assert
      expect(component.selectedCompany).toEqual(mockCompany);
      expect(component.isCompanyModalOpen).toBe(true);
    });

    it('should close modal and clear selection when modal is closed', () => {
      // Arrange
      component.selectedCompany = generateCompany();
      component.isCompanyModalOpen = true;

      // Act
      component.onCompanyModalClosed();

      // Assert
      expect(component.selectedCompany).toBeNull();
      expect(component.isCompanyModalOpen).toBe(false);
    });
  });

  describe('Component Cleanup', () => {
    it('should unsubscribe from all observables on destroy', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      spyOn(component['destroy$'], 'next');
      spyOn(component['destroy$'], 'complete');

      // Act
      component.ngOnDestroy();

      // Assert
      expect(component['destroy$'].next).toHaveBeenCalled();
      expect(component['destroy$'].complete).toHaveBeenCalled();
    }));
  });

  describe('Responsive Behavior', () => {
    beforeEach(() => {
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
    });

    /**
     * Test breakpoint detection - Mobile
     * Validates: Requirements 10.1, 10.2
     */
    it('should detect mobile breakpoint (<768px)', () => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      // Act
      component['checkResponsiveBreakpoints']();

      // Assert
      expect(component.isMobile).toBe(true);
      expect(component.isTablet).toBe(false);
      expect(component.isDesktop).toBe(false);
    });

    /**
     * Test breakpoint detection - Tablet
     * Validates: Requirements 10.1, 10.2
     */
    it('should detect tablet breakpoint (768px-1023px)', () => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800
      });

      // Act
      component['checkResponsiveBreakpoints']();

      // Assert
      expect(component.isMobile).toBe(false);
      expect(component.isTablet).toBe(true);
      expect(component.isDesktop).toBe(false);
    });

    /**
     * Test breakpoint detection - Desktop
     * Validates: Requirements 10.1, 10.2
     */
    it('should detect desktop breakpoint (>=1024px)', () => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1440
      });

      // Act
      component['checkResponsiveBreakpoints']();

      // Assert
      expect(component.isMobile).toBe(false);
      expect(component.isTablet).toBe(false);
      expect(component.isDesktop).toBe(true);
    });

    /**
     * Test responsive breakpoints are checked on init
     * Validates: Requirements 10.1
     */
    it('should check responsive breakpoints on initialization', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.isDesktop).toBe(true);
    }));

    /**
     * Test window resize triggers breakpoint check
     * Validates: Requirements 10.1, 10.2
     */
    it('should update breakpoints on window resize', () => {
      // Arrange - Start at desktop
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1440
      });
      component['checkResponsiveBreakpoints']();
      expect(component.isDesktop).toBe(true);

      // Act - Resize to mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });
      window.dispatchEvent(new Event('resize'));

      // Assert
      expect(component.isMobile).toBe(true);
      expect(component.isDesktop).toBe(false);
    });

    /**
     * Test layout adapts at mobile breakpoint
     * Validates: Requirements 10.2, 10.3
     */
    it('should adapt layout for mobile screens', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.isMobile).toBe(true);
      expect(component.isTablet).toBe(false);
      expect(component.isDesktop).toBe(false);
      
      // Verify main container has proper overflow handling
      const container = fixture.nativeElement.querySelector('.gamification-dashboard');
      expect(container).toBeTruthy();
      const computedStyle = window.getComputedStyle(container);
      expect(['hidden', 'auto', 'clip'].includes(computedStyle.overflowX)).toBe(true);
    }));

    /**
     * Test layout adapts at tablet breakpoint
     * Validates: Requirements 10.2, 10.3
     */
    it('should adapt layout for tablet screens', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      expect(component.isMobile).toBe(false);
      expect(component.isTablet).toBe(true);
      expect(component.isDesktop).toBe(false);
      
      // Verify main container has proper overflow handling
      const container = fixture.nativeElement.querySelector('.gamification-dashboard');
      expect(container).toBeTruthy();
      const computedStyle = window.getComputedStyle(container);
      expect(['hidden', 'auto', 'clip'].includes(computedStyle.overflowX)).toBe(true);
    }));

    /**
     * Test no horizontal scrolling on mobile
     * Validates: Requirements 10.5
     */
    it('should prevent horizontal scrolling on mobile', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert - Check that overflow-x is properly set
      const mainContainers = ['.gamification-dashboard', '.dashboard-sidebar', '.dashboard-main'];
      mainContainers.forEach(selector => {
        const element = fixture.nativeElement.querySelector(selector);
        if (element) {
          const computedStyle = window.getComputedStyle(element);
          expect(['hidden', 'auto', 'clip'].includes(computedStyle.overflowX)).toBe(true);
        }
      });
    }));

    /**
     * Test no horizontal scrolling on tablet
     * Validates: Requirements 10.5
     */
    it('should prevent horizontal scrolling on tablet', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert - Check that overflow-x is properly set
      const mainContainers = ['.gamification-dashboard', '.dashboard-sidebar', '.dashboard-main'];
      mainContainers.forEach(selector => {
        const element = fixture.nativeElement.querySelector(selector);
        if (element) {
          const computedStyle = window.getComputedStyle(element);
          expect(['hidden', 'auto', 'clip'].includes(computedStyle.overflowX)).toBe(true);
        }
      });
    }));

    /**
     * Test no horizontal scrolling on desktop
     * Validates: Requirements 10.5
     */
    it('should prevent horizontal scrolling on desktop', fakeAsync(() => {
      // Arrange
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920
      });

      // Act
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      // Assert
      const element = fixture.nativeElement;
      expect(element.scrollWidth).toBeLessThanOrEqual(1920);
    }));
  });

  describe('Carteira Data Loading', () => {
    beforeEach(() => {
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
    });

    /**
     * Carteira: fetchGamificacaoMapsAsync → getPlayerCnpjResp → enrichCarteiraRowsWithMaps.
     */
    it('should load carteira rows from CompanyService and enrich with KPI data on initialization', fakeAsync(() => {
      const mockList = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]' },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]' },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]' }
      ];
      const supabaseRows = companiesFromCnpjList(mockList);
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: { id: 'delivery', label: 'Entregas', current: 89, target: 100, unit: 'entregas', percentage: 89, color: 'green' }
        },
        {
          cnpj: 'COMPANY B l 0002 [1218|0002-45]',
          cnpjId: '1218',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: { id: 'delivery', label: 'Entregas', current: 45, target: 100, unit: 'entregas', percentage: 45, color: 'yellow' }
        },
        {
          cnpj: 'COMPANY C l 0003 [9654|0003-12]',
          cnpjId: '9654',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: { id: 'delivery', label: 'Entregas', current: 102, target: 100, unit: 'entregas', percentage: 100, color: 'green' }
        }
      ];
      playerService.getPlayerCnpjResp.and.returnValue(of(supabaseRows.map(c => c.cnpj)));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(playerService.getPlayerCnpjResp).toHaveBeenCalled();
      expect(companyKpiService.fetchGamificacaoMapsAsync).toHaveBeenCalled();
      expect(companyKpiService.enrichCarteiraRowsWithMaps).toHaveBeenCalledWith(
        supabaseRows.map(c => ({ cnpj: c.cnpj, empId: c.cnpj })),
        jasmine.any(Object)
      );
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
      expect(component.carteiraClientes.length).toBe(3);
      expect(component.isLoadingClientes).toBe(false);
    }));

    it('should handle empty carteira data', fakeAsync(() => {
      playerService.getPlayerCnpjResp.and.returnValue(of([]));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingClientes).toBe(false);
      expect(companyKpiService.fetchGamificacaoMapsAsync).toHaveBeenCalled();
      expect(companyKpiService.enrichCarteiraRowsWithMaps).not.toHaveBeenCalled();
    }));

    it('should handle carteira data loading errors gracefully', fakeAsync(() => {
      const error = new Error('Failed to load carteira data');
      playerService.getPlayerCnpjResp.and.returnValue(throwError(() => error));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingClientes).toBe(false);
    }));

    it('should set loading state correctly during carteira data load', fakeAsync(() => {
      const mockList = [{ cnpj: 'COMPANY A l 0001 [2000|0001-60]' }];
      const supabaseRows = companiesFromCnpjList(mockList);
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: { id: 'delivery', label: 'Entregas', current: 89, target: 100, unit: 'entregas', percentage: 89, color: 'green' }
        }
      ];
      playerService.getPlayerCnpjResp.and.returnValue(of(supabaseRows.map(c => c.cnpj)).pipe(delay(100)));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();

      expect(component.isLoadingClientes).toBe(true);

      tick(150);

      expect(component.isLoadingClientes).toBe(false);
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
    }));

    it('should call getCompaniesForPlayer with session player id', fakeAsync(() => {
      playerService.getPlayerCnpjResp.and.returnValue(of([]));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(playerService.getPlayerCnpjResp).toHaveBeenCalledWith('test-user');
    }));

    it('should not pass selected month to carteira getCompanies load', fakeAsync(() => {
      playerService.getPlayerCnpjResp.and.returnValue(of([]));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;

      component.selectedMonth = new Date('2024-01-15');
      playerService.getPlayerCnpjResp.calls.reset();

      component['loadClientesData']();
      tick();

      expect(playerService.getPlayerCnpjResp).toHaveBeenCalledWith('test-user');
    }));

    it('should not reload carteira when month changes', fakeAsync(() => {
      const initialList = [{ cnpj: 'COMPANY A l 0001 [2000|0001-60]' }];
      const initialEnriched: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0
        }
      ];

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(initialList)));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(initialEnriched);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes).toEqual(initialEnriched);

      const callsAfterInit = playerService.getPlayerCnpjResp.calls.count();

      component.onMonthChange(1);
      tick();

      expect(playerService.getPlayerCnpjResp.calls.count()).toBe(callsAfterInit);
      expect(component.carteiraClientes).toEqual(initialEnriched);
    }));

    it('should clear carteira when portfolio is empty (session usuario null still uses player id me)', fakeAsync(() => {
      const sessaoProviderSpy = TestBed.inject(SessaoProvider) as jasmine.SpyObj<SessaoProvider>;
      Object.defineProperty(sessaoProviderSpy, 'usuario', {
        get: () => null
      });

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      playerService.getPlayerCnpjResp.calls.reset();
      playerService.getPlayerCnpjResp.and.returnValue(of([]));

      component['loadClientesData']();
      tick();

      expect(component.isLoadingClientes).toBe(false);
      expect(component.carteiraClientes).toEqual([]);
      expect(companyKpiService.fetchGamificacaoMapsAsync).toHaveBeenCalled();
      expect(companyKpiService.enrichCarteiraRowsWithMaps).not.toHaveBeenCalled();
    }));

    it('should enrich companies with KPI data after portfolio companies', fakeAsync(() => {
      const mockList = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]' },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]' }
      ];
      const supabaseRows = companiesFromCnpjList(mockList);
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 89,
            target: 100,
            unit: 'entregas',
            percentage: 89,
            color: 'green' as const
          }
        },
        {
          cnpj: 'COMPANY B l 0002 [1218|0002-45]',
          cnpjId: '1218',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 45,
            target: 100,
            unit: 'entregas',
            percentage: 45,
            color: 'yellow' as const
          }
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(of(supabaseRows.map(c => c.cnpj)));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(companyKpiService.fetchGamificacaoMapsAsync).toHaveBeenCalled();
      expect(companyKpiService.enrichCarteiraRowsWithMaps).toHaveBeenCalledWith(
        supabaseRows.map(c => ({ cnpj: c.cnpj, empId: c.cnpj })),
        jasmine.any(Object)
      );
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(89);
      expect(component.carteiraClientes[1].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[1].deliveryKpi?.current).toBe(45);
    }));

    it('should handle enrichment errors gracefully', fakeAsync(() => {
      const mockList = [{ cnpj: 'COMPANY A l 0001 [2000|0001-60]' }];
      const error = new Error('Failed to enrich companies with KPI data');

      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(mockList)));

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.fetchGamificacaoMapsAsync.and.returnValue(Promise.reject(error));

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.isLoadingClientes).toBe(false);
      expect(component.carteiraClientes).toEqual([]);
    }));
  });

  describe('KPI Display in Carteira Section', () => {
    beforeEach(() => {
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
    });

    it('should display KPI indicator when cliente has deliveryKpi', fakeAsync(() => {
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 89,
            target: 100,
            unit: 'entregas',
            percentage: 89,
            color: 'green' as const
          }
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList([{ cnpj: 'COMPANY A l 0001 [2000|0001-60]' }]))
      );

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[0].deliveryKpi?.label).toBe('Entregas');
      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(89);
      expect(component.carteiraClientes[0].deliveryKpi?.target).toBe(100);
      expect(component.carteiraClientes[0].deliveryKpi?.percentage).toBe(89);
    }));

    it('should display "n/a" when cliente does not have deliveryKpi', fakeAsync(() => {
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY B l 0002 [1218|0002-45]',
          cnpjId: '1218',
          actionCount: 0,
          processCount: 0
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList([{ cnpj: 'COMPANY B l 0002 [1218|0002-45]' }]))
      );

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].deliveryKpi).toBeUndefined();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent?.toLowerCase()).toContain('n/a');
    }));

    it('should handle multiple companies with mixed KPI availability', fakeAsync(() => {
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY A l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 89,
            target: 100,
            unit: 'entregas',
            percentage: 89,
            color: 'green' as const
          }
        },
        {
          cnpj: 'COMPANY B l 0002 [1218|0002-45]',
          cnpjId: '1218',
          actionCount: 0,
          processCount: 0
        },
        {
          cnpj: 'COMPANY C l 0003 [9654|0003-12]',
          cnpjId: '9654',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 102,
            target: 100,
            unit: 'entregas',
            percentage: 100,
            color: 'green' as const
          }
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(
          cnpjRespIdsFromList([
            { cnpj: 'COMPANY A l 0001 [2000|0001-60]' },
            { cnpj: 'COMPANY B l 0002 [1218|0002-45]' },
            { cnpj: 'COMPANY C l 0003 [9654|0003-12]' }
          ])
        )
      );

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes.length).toBe(3);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[1].deliveryKpi).toBeUndefined();
      expect(component.carteiraClientes[2].deliveryKpi).toBeDefined();
    }));

    it('should display KPI indicators with different performance levels', fakeAsync(() => {
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'LOW PERFORMER l 0001 [1000|0001-60]',
          cnpjId: '1000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 25,
            target: 100,
            unit: 'entregas',
            percentage: 25,
            color: 'red' as const
          }
        },
        {
          cnpj: 'MEDIUM PERFORMER l 0002 [2000|0002-45]',
          cnpjId: '2000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 60,
            target: 100,
            unit: 'entregas',
            percentage: 60,
            color: 'yellow' as const
          }
        },
        {
          cnpj: 'HIGH PERFORMER l 0003 [3000|0003-12]',
          cnpjId: '3000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 95,
            target: 100,
            unit: 'entregas',
            percentage: 95,
            color: 'green' as const
          }
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(
          cnpjRespIdsFromList([
            { cnpj: 'LOW PERFORMER l 0001 [1000|0001-60]' },
            { cnpj: 'MEDIUM PERFORMER l 0002 [2000|0002-45]' },
            { cnpj: 'HIGH PERFORMER l 0003 [3000|0003-12]' }
          ])
        )
      );

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes[0].deliveryKpi?.percentage).toBe(25);
      expect(component.carteiraClientes[1].deliveryKpi?.percentage).toBe(60);
      expect(component.carteiraClientes[2].deliveryKpi?.percentage).toBe(95);
    }));

    it('should display KPI indicator when performance exceeds target', fakeAsync(() => {
      const mockEnrichedData: CompanyDisplay[] = [
        {
          cnpj: 'OVER PERFORMER l 0001 [4000|0001-60]',
          cnpjId: '4000',
          actionCount: 0,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 120,
            target: 100,
            unit: 'entregas',
            percentage: 100,
            color: 'green' as const
          }
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList([{ cnpj: 'OVER PERFORMER l 0001 [4000|0001-60]' }]))
      );

      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mockEnrichedData);

      fixture.detectChanges();
      flushMicrotasks();
      tick();

      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(120);
      expect(component.carteiraClientes[0].deliveryKpi?.target).toBe(100);
      expect(component.carteiraClientes[0].deliveryKpi?.percentage).toBe(100);
    }));
  });

  describe('getCompanyDisplayName Helper Method', () => {
    /**
     * Test extract company name correctly from CNPJ string
     * Validates: Task 5.6 - Extract company name correctly from CNPJ string
     */
    it('should extract company name correctly from CNPJ string', () => {
      // Arrange
      const cnpjString = 'RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('RODOPRIMA LOGISTICA LTDA');
    });

    /**
     * Test extract company name with multiple words
     * Validates: Task 5.6 - Handle various company name formats
     */
    it('should extract company name with multiple words', () => {
      // Arrange
      const cnpjString = 'EMPRESA DE TRANSPORTE E LOGISTICA LTDA l 0002 [1218|0002-45]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('EMPRESA DE TRANSPORTE E LOGISTICA LTDA');
    });

    /**
     * Test extract company name with special characters
     * Validates: Task 5.6 - Handle special characters in company names
     */
    it('should extract company name with special characters', () => {
      // Arrange
      const cnpjString = 'COMPANY & PARTNERS - LTDA l 0003 [9654|0003-12]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('COMPANY & PARTNERS - LTDA');
    });

    /**
     * Test handle empty CNPJ string
     * Validates: Task 5.6 - Handle empty/null CNPJ strings in getCompanyDisplayName()
     */
    it('should handle empty CNPJ string', () => {
      // Arrange
      const cnpjString = '';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('');
    });

    /**
     * Test handle null CNPJ string
     * Validates: Task 5.6 - Handle empty/null CNPJ strings in getCompanyDisplayName()
     */
    it('should handle null CNPJ string', () => {
      // Arrange
      const cnpjString = null as any;

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('');
    });

    /**
     * Test handle undefined CNPJ string
     * Validates: Task 5.6 - Handle empty/null CNPJ strings in getCompanyDisplayName()
     */
    it('should handle undefined CNPJ string', () => {
      // Arrange
      const cnpjString = undefined as any;

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('');
    });

    /**
     * Test handle malformed CNPJ string without separator
     * Validates: Task 5.6 - Handle edge cases gracefully
     */
    it('should return full string when CNPJ format is invalid', () => {
      // Arrange
      const cnpjString = 'INVALID FORMAT WITHOUT SEPARATOR';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('INVALID FORMAT WITHOUT SEPARATOR');
    });

    /**
     * Test handle CNPJ string with only company name
     * Validates: Task 5.6 - Handle partial CNPJ formats
     */
    it('should handle CNPJ string with only company name', () => {
      // Arrange
      const cnpjString = 'SIMPLE COMPANY NAME';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('SIMPLE COMPANY NAME');
    });

    /**
     * Test trim whitespace from extracted company name
     * Validates: Task 5.6 - Ensure clean output
     */
    it('should trim whitespace from extracted company name', () => {
      // Arrange
      const cnpjString = '  COMPANY WITH SPACES  l 0001 [2000|0001-60]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('COMPANY WITH SPACES');
    });

    /**
     * Test handle CNPJ string with lowercase 'l' separator
     * Validates: Task 5.6 - Handle standard format
     */
    it('should extract company name with lowercase l separator', () => {
      // Arrange
      const cnpjString = 'STANDARD COMPANY l 0001 [2000|0001-60]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      expect(result).toBe('STANDARD COMPANY');
    });

    /**
     * Test handle CNPJ string with uppercase 'L' separator
     * Validates: Task 5.6 - Handle case variations
     */
    it('should handle CNPJ string with uppercase L separator', () => {
      // Arrange
      const cnpjString = 'COMPANY WITH UPPERCASE L 0001 [2000|0001-60]';

      // Act
      const result = component.getCompanyDisplayName(cnpjString);

      // Assert
      // Note: The regex looks for lowercase 'l', so uppercase 'L' won't match
      // This returns the full string as fallback
      expect(result).toBe('COMPANY WITH UPPERCASE L 0001 [2000|0001-60]');
    });
  });
});
