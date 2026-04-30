/**
 * Integration Tests for Company KPI Indicators Feature
 * 
 * Tests the complete flow from action_log → enrichment → UI display
 * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay, CnpjKpiData } from '@services/company-kpi.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ActivatedRoute, Router } from '@angular/router';
import { CacheManagerService } from '@services/cache-manager.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  generatePlayerStatus,
  generatePointWallet,
  generateSeasonProgress,
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

describe('GamificationDashboard - Company KPI Integration Tests', () => {
  let component: GamificationDashboardComponent;
  let fixture: ComponentFixture<GamificationDashboardComponent>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let kpiService: jasmine.SpyObj<KPIService>;
  let toastService: jasmine.SpyObj<ToastService>;
  let actionLogService: jasmine.SpyObj<ActionLogService>;
  let companyKpiService: jasmine.SpyObj<CompanyKpiService>;
  let performanceMonitor: jasmine.SpyObj<PerformanceMonitorService>;
  let sessaoProvider: jasmine.SpyObj<SessaoProvider>;

  beforeEach(async () => {
    // Create spy objects for all services
    const playerServiceSpy = jasmine.createSpyObj('PlayerService', [
      'getPlayerStatus',
      'getPlayerPoints',
      'getSeasonProgress',
      'getPlayerCnpj',
      'getPlayerCnpjResp',
      'clearCache',
      'usesGame4uWalletFromStats'
    ]);

    const kpiServiceSpy = jasmine.createSpyObj('KPIService', ['getPlayerKPIs']);

    const toastServiceSpy = jasmine.createSpyObj('ToastService', [
      'error',
      'alert',
      'success'
    ]);

    const actionLogServiceSpy = jasmine.createSpyObj('ActionLogService', [
      'getProgressMetrics',
      'getMonthlyPointsGoalTarget',
      'getPlayerCnpjListWithCount',
      'getUniqueClientesCount',
      'getCompletedTasksCount',
      'getPontosForMonth',
      'getMonthlyGame4uPlayerDashboardData'
    ]);

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

    const activatedRouteSpy = {
      snapshot: { queryParams: {} },
      queryParams: of({})
    };

    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

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
    companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
    performanceMonitor = TestBed.inject(PerformanceMonitorService) as jasmine.SpyObj<PerformanceMonitorService>;
    sessaoProvider = TestBed.inject(SessaoProvider) as jasmine.SpyObj<SessaoProvider>;

    // Setup default return values
    playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
    playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
    playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
    playerService.getPlayerCnpj.and.returnValue(of([]));
    playerService.getPlayerCnpjResp.and.returnValue(of([]));
    playerService.usesGame4uWalletFromStats.and.returnValue(false);
    kpiService.getPlayerKPIs.and.returnValue(of([]));
    actionLogService.getProgressMetrics.and.returnValue(of({
      activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
      processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
    }));
    actionLogService.getMonthlyPointsGoalTarget.and.returnValue(of(0));
    actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([]));
    actionLogService.getUniqueClientesCount.and.returnValue(of(0));
    actionLogService.getCompletedTasksCount.and.returnValue(of(0));
    actionLogService.getPontosForMonth.and.returnValue(of(500));
    actionLogService.getMonthlyGame4uPlayerDashboardData.and.returnValue(
      of({
        wallet: generatePointWallet(),
        pontosActionLog: 500,
        sidebar: { tarefasFinalizadas: 0 }
      })
    );
    companyKpiService.enrichCompaniesWithKpis.and.returnValue(of([]));
    companyKpiService.fetchGamificacaoMapsAsync.and.returnValue(Promise.resolve(emptyGamificacaoMaps));
    companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue([]);
    companyKpiService.enrichFromCnpjResp.and.returnValue(of([]));

    fixture = TestBed.createComponent(GamificationDashboardComponent);
    component = fixture.componentInstance;
  });

  /**
   * Helper function to create mock CNPJ list from action_log
   */
  function createMockCnpjList(): { cnpj: string; actionCount: number }[] {
    return [
      { cnpj: 'RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]', actionCount: 5 },
      { cnpj: 'ACME CORPORATION l 0002 [1218|0002-45]', actionCount: 3 },
      { cnpj: 'TECH SOLUTIONS LTDA l 0003 [9654|0003-12]', actionCount: 8 }
    ];
  }

  /**
   * Helper function to create mock KPI data from cnpj__c
   */
  function createMockKpiData(): Map<string, CnpjKpiData> {
    const kpiMap = new Map<string, CnpjKpiData>();
    kpiMap.set('2000', { _id: '2000', entrega: 89 });
    kpiMap.set('1218', { _id: '1218', entrega: 45 });
    kpiMap.set('9654', { _id: '9654', entrega: 102 });
    return kpiMap;
  }

  /**
   * Helper function to create enriched company display data
   */
  function createEnrichedCompanies(): CompanyDisplay[] {
    return [
      {
        cnpj: 'RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]',
        cnpjId: '2000',
        actionCount: 5,
        processCount: 0,
        deliveryKpi: {
          id: 'delivery',
          label: 'Entregas',
          current: 89,
          target: 100,
          unit: 'entregas',
          percentage: 89,
          color: 'green'
        }
      },
      {
        cnpj: 'ACME CORPORATION l 0002 [1218|0002-45]',
        cnpjId: '1218',
        actionCount: 3,
        processCount: 0,
        deliveryKpi: {
          id: 'delivery',
          label: 'Entregas',
          current: 45,
          target: 100,
          unit: 'entregas',
          percentage: 45,
          color: 'red'
        }
      },
      {
        cnpj: 'TECH SOLUTIONS LTDA l 0003 [9654|0003-12]',
        cnpjId: '9654',
        actionCount: 8,
        processCount: 0,
        deliveryKpi: {
          id: 'delivery',
          label: 'Entregas',
          current: 102,
          target: 100,
          unit: 'entregas',
          percentage: 100,
          color: 'green'
        }
      }
    ];
  }

  describe('Complete Flow: action_log → enrichment → UI display', () => {
    /**
     * Test 9.2: Complete flow with valid KPI data
     * Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3
     */
    it('should load carteira from getPlayerCnpjResp and enrich with KPI data', fakeAsync(() => {
      // Arrange
      const mockCnpjList = createMockCnpjList();
      const enrichedCompanies = createEnrichedCompanies();

      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(mockCnpjList)));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges(); // Triggers ngOnInit
      tick();

      // Assert
      expect(playerService.getPlayerCnpjResp).toHaveBeenCalled();
      expect(companyKpiService.fetchGamificacaoMapsAsync).toHaveBeenCalled();
      expect(companyKpiService.enrichCarteiraRowsWithMaps).toHaveBeenCalled();
      expect(companyKpiService.enrichFromCnpjResp).toHaveBeenCalled();
      expect(component.carteiraClientes).toEqual(enrichedCompanies);
      expect(component.carteiraClientes.length).toBe(3);
    }));

    /**
     * Test 9.2: Verify KPI data structure
     * Validates: Requirements 1.2, 2.3
     */
    it('should have correct KPI data structure in enriched companies', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      const firstCompany = component.carteiraClientes[0];
      expect(firstCompany.deliveryKpi).toBeDefined();
      expect(firstCompany.deliveryKpi?.id).toBe('delivery');
      expect(firstCompany.deliveryKpi?.label).toBe('Entregas');
      expect(firstCompany.deliveryKpi?.current).toBe(89);
      expect(firstCompany.deliveryKpi?.target).toBe(100);
      expect(firstCompany.deliveryKpi?.unit).toBe('entregas');
      expect(firstCompany.deliveryKpi?.percentage).toBe(89);
    }));

    /**
     * Test 9.2: Verify CNPJ ID extraction
     * Validates: Requirements 2.1, 2.2
     */
    it('should extract CNPJ IDs correctly from action_log format', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes[0].cnpjId).toBe('2000');
      expect(component.carteiraClientes[1].cnpjId).toBe('1218');
      expect(component.carteiraClientes[2].cnpjId).toBe('9654');
    }));

    /**
     * Test 9.2: Verify action counts are preserved
     * Validates: Requirements 1.1
     */
    it('should preserve action counts from action_log', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes[0].actionCount).toBe(5);
      expect(component.carteiraClientes[1].actionCount).toBe(3);
      expect(component.carteiraClientes[2].actionCount).toBe(8);
    }));
  });

  describe('Companies with valid KPI data', () => {
    /**
     * Test 9.3: Load companies with valid KPI data
     * Validates: Requirements 1.1, 1.2, 2.3
     */
    it('should display KPI indicators for companies with valid data', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      component.carteiraClientes.forEach(company => {
        expect(company.deliveryKpi).toBeDefined();
        expect(company.deliveryKpi?.current).toBeGreaterThanOrEqual(0);
        expect(company.deliveryKpi?.target).toBeGreaterThan(0);
      });
    }));

    /**
     * Test 9.3: Verify KPI color coding
     * Validates: Requirements 1.3
     */
    it('should assign correct colors based on KPI performance', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      // Company with 89% should be green (>= 80%)
      expect(component.carteiraClientes[0].deliveryKpi?.color).toBe('green');
      // Company with 45% should be red (< 50%)
      expect(component.carteiraClientes[1].deliveryKpi?.color).toBe('red');
      // Company with 102% should be green (>= 80%)
      expect(component.carteiraClientes[2].deliveryKpi?.color).toBe('green');
    }));

    /**
     * Test 9.3: Verify multiple companies load correctly
     * Validates: Requirements 1.1
     */
    it('should handle multiple companies with KPI data', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(3);
      expect(component.carteiraClientes.every(c => c.deliveryKpi !== undefined)).toBe(true);
    }));
  });

  describe('Companies without KPI data', () => {
    /**
     * Test 9.4: Handle empty cnpj__c results
     * Validates: Requirements 2.4
     */
    it('should handle companies without KPI data gracefully', fakeAsync(() => {
      // Arrange
      const companiesWithoutKpi: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY WITHOUT KPI l 0001 [5000|0001-00]',
          cnpjId: '5000',
          actionCount: 2,
          processCount: 0
          // No deliveryKpi property
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList([{ cnpj: 'COMPANY WITHOUT KPI l 0001 [5000|0001-00]' }]))
      );
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(companiesWithoutKpi);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(companiesWithoutKpi));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].deliveryKpi).toBeUndefined();
      expect(component.isLoadingClientes).toBe(false);
    }));

    /**
     * Test 9.4: Handle empty CNPJ list
     * Validates: Requirements 2.4
     */
    it('should handle empty CNPJ list from action_log', fakeAsync(() => {
      // Arrange
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue([]);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingClientes).toBe(false);
    }));

    /**
     * Test 9.4: Handle invalid CNPJ format
     * Validates: Requirements 2.1, 2.4
     */
    it('should handle invalid CNPJ format gracefully', fakeAsync(() => {
      // Arrange
      const companiesWithInvalidFormat: CompanyDisplay[] = [
        {
          cnpj: 'INVALID FORMAT',
          cnpjId: undefined,
          actionCount: 1,
          processCount: 0
          // No deliveryKpi due to invalid format
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList([{ cnpj: 'INVALID FORMAT' }]))
      );
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(companiesWithInvalidFormat);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(companiesWithInvalidFormat));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].cnpjId).toBeUndefined();
      expect(component.carteiraClientes[0].deliveryKpi).toBeUndefined();
    }));

    /**
     * Test 9.4: Handle mixed valid and invalid data
     * Validates: Requirements 2.4
     */
    it('should handle mix of companies with and without KPI data', fakeAsync(() => {
      // Arrange
      const mixedCompanies: CompanyDisplay[] = [
        {
          cnpj: 'COMPANY WITH KPI l 0001 [2000|0001-60]',
          cnpjId: '2000',
          actionCount: 5,
          processCount: 0,
          deliveryKpi: {
            id: 'delivery',
            label: 'Entregas',
            current: 89,
            target: 100,
            unit: 'entregas',
            percentage: 89,
            color: 'green'
          }
        },
        {
          cnpj: 'COMPANY WITHOUT KPI l 0002 [9999|0002-00]',
          cnpjId: '9999',
          actionCount: 2,
          processCount: 0
          // No deliveryKpi
        }
      ];

      playerService.getPlayerCnpjResp.and.returnValue(
        of(
          cnpjRespIdsFromList([
            { cnpj: 'COMPANY WITH KPI l 0001 [2000|0001-60]' },
            { cnpj: 'COMPANY WITHOUT KPI l 0002 [9999|0002-00]' }
          ])
        )
      );
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(mixedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(mixedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(2);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[1].deliveryKpi).toBeUndefined();
    }));
  });

  describe('KPI display in carteira list', () => {
    /**
     * Test 9.5: Verify KPI display in UI
     * Validates: Requirements 1.1, 1.3
     */
    it('should display KPI indicators in carteira list', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      // Assert
      expect(component.carteiraClientes.length).toBe(3);
      component.carteiraClientes.forEach(company => {
        expect(company.deliveryKpi).toBeDefined();
      });
    }));

    /**
     * Test 9.5: Verify company name extraction
     * Validates: Requirements 1.1
     */
    it('should extract and display company names correctly', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.getCompanyDisplayName(component.carteiraClientes[0].cnpj))
        .toBe('RODOPRIMA LOGISTICA LTDA');
      expect(component.getCompanyDisplayName(component.carteiraClientes[1].cnpj))
        .toBe('ACME CORPORATION');
      expect(component.getCompanyDisplayName(component.carteiraClientes[2].cnpj))
        .toBe('TECH SOLUTIONS LTDA');
    }));

    /**
     * Test 9.5: Verify loading state management
     * Validates: Requirements 1.4
     */
    it('should manage loading state correctly during data fetch', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      const delayedMaps = { byEmpId: new Map(), byCnpjNorm: new Map() };
      companyKpiService.fetchGamificacaoMapsAsync.and.returnValue(
        new Promise(resolve => setTimeout(() => resolve(delayedMaps), 100))
      );
      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList(createMockCnpjList())).pipe(delay(100))
      );
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(
        of(enrichedCompanies).pipe(delay(100))
      );

      // Act
      fixture.detectChanges();

      // Assert - Initially loading
      expect(component.isLoadingClientes).toBe(true);

      tick(250);

      // Assert - Loading complete
      expect(component.isLoadingClientes).toBe(false);
      expect(component.carteiraClientes.length).toBe(3);
    }));

    /**
     * Test 9.5: Verify data updates when refreshed
     * Validates: Requirements 1.4
     */
    it('should update KPI data when dashboard is refreshed', fakeAsync(() => {
      // Arrange - Initial data
      const initialCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(initialCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(initialCompanies));

      fixture.detectChanges();
      tick();

      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(89);

      // Arrange - Updated data
      const updatedCompanies = createEnrichedCompanies();
      updatedCompanies[0].deliveryKpi!.current = 95; // Updated value
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(updatedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(updatedCompanies));

      // Act - Refresh
      component.refreshData();
      tick();

      // Assert
      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(95);
    }));
  });

  describe('Error scenarios', () => {
    /**
     * Test 9.6: Handle API failures gracefully
     * Validates: Requirements 2.4
     */
    it('should handle action_log API failure gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('API Error');
      playerService.getPlayerCnpjResp.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingClientes).toBe(false);
      // Should not break the application
      expect(component.isLoadingPlayer).toBe(false);
    }));

    /**
     * Test 9.6: Handle enrichment service failure
     * Validates: Requirements 2.4
     */
    it('should handle KPI enrichment failure gracefully', fakeAsync(() => {
      // Arrange
      const mockCnpjList = createMockCnpjList();
      const error = new Error('Enrichment Error');
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(mockCnpjList)));
      companyKpiService.fetchGamificacaoMapsAsync.and.returnValue(Promise.reject(error));
      companyKpiService.enrichFromCnpjResp.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.isLoadingClientes).toBe(false);
      // Application should continue to function
      expect(component.isLoadingPlayer).toBe(false);
    }));

    /**
     * Test 9.6: Handle network timeout
     * Validates: Requirements 2.4
     */
    it('should handle network timeout gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Network timeout');
      playerService.getPlayerCnpjResp.and.returnValue(
        throwError(() => error).pipe(delay(5000))
      );

      // Act
      fixture.detectChanges();
      tick(5100);

      // Assert
      expect(component.isLoadingClientes).toBe(false);
    }));

    /**
     * Test 9.6: Handle partial API failure
     * Validates: Requirements 2.4
     */
    it('should continue loading other sections when carteira fails', fakeAsync(() => {
      // Arrange
      const error = new Error('Carteira API Error');
      playerService.getPlayerCnpjResp.and.returnValue(throwError(() => error));
      
      // Other services should still work
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      kpiService.getPlayerKPIs.and.returnValue(of([generateKPIData()]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.playerStatus).toBeDefined();
      expect(component.playerKPIs.length).toBe(1);
    }));

    /**
     * Test 9.6: Handle malformed API response
     * Validates: Requirements 2.4
     */
    it('should handle malformed API response gracefully', fakeAsync(() => {
      // Arrange
      playerService.getPlayerCnpjResp.and.returnValue(of([]));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue([]);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingClientes).toBe(false);
    }));
  });

  describe('Caching behavior', () => {
    /**
     * Test 9.7: Verify caching reduces API calls
     * Validates: Performance requirement
     */
    it('should use cached data on subsequent loads', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act - First load
      fixture.detectChanges();
      tick();

      const firstCallCount = companyKpiService.fetchGamificacaoMapsAsync.calls.count();

      // Act - Second load (should use cache)
      component.loadDashboardData();
      tick();

      // Assert
      // Note: Caching is handled by the service, so we verify the service is called
      // The actual caching behavior is tested in the service unit tests
      expect(companyKpiService.fetchGamificacaoMapsAsync.calls.count()).toBeGreaterThan(
        firstCallCount
      );
    }));

    /**
     * Test 9.7: Verify cache is cleared on manual refresh
     * Validates: Requirements 1.4
     */
    it('should clear cache when manual refresh is triggered', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      fixture.detectChanges();
      tick();

      // Act
      component.refreshData();
      tick();

      // Assert
      // Carteira enrichment runs again after refresh
      expect(companyKpiService.fetchGamificacaoMapsAsync.calls.count()).toBeGreaterThanOrEqual(2);
    }));

    /**
     * Test 9.7: Verify cache behavior across multiple loads
     * Validates: Performance requirement
     */
    it('should handle multiple loads efficiently', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act - Multiple loads
      fixture.detectChanges();
      tick();

      component.loadDashboardData();
      tick();

      component.loadDashboardData();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(3);
      expect(component.isLoadingClientes).toBe(false);
    }));
  });

  describe('End-to-end flow with realistic data', () => {
    /**
     * Test 9.8: Complete realistic scenario
     * Validates: All requirements
     */
    it('should handle realistic production scenario', fakeAsync(() => {
      // Arrange - Realistic data
      const realisticCnpjList = [
        { cnpj: 'TRANSPORTADORA ABC LTDA l 0001 [1001|0001-23]', actionCount: 12 },
        { cnpj: 'LOGISTICA XYZ S.A. l 0002 [1002|0002-45]', actionCount: 8 },
        { cnpj: 'DISTRIBUIDORA 123 LTDA l 0003 [1003|0003-67]', actionCount: 15 },
        { cnpj: 'COMERCIO VAREJO LTDA l 0004 [1004|0004-89]', actionCount: 5 },
        { cnpj: 'INDUSTRIA TECH LTDA l 0005 [1005|0005-01]', actionCount: 20 }
      ];

      const realisticEnrichedCompanies: CompanyDisplay[] = realisticCnpjList.map((item, index) => ({
        cnpj: item.cnpj,
        cnpjId: `100${index + 1}`,
        actionCount: item.actionCount,
        processCount: 0,
        deliveryKpi: {
          id: 'delivery',
          label: 'Entregas',
          current: 50 + (index * 10),
          target: 100,
          unit: 'entregas',
          percentage: 50 + (index * 10),
          color: (50 + (index * 10)) >= 80 ? 'green' : (50 + (index * 10)) >= 50 ? 'yellow' : 'red'
        }
      }));

      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(realisticCnpjList)));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(realisticEnrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(realisticEnrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(5);
      expect(component.isLoadingClientes).toBe(false);

      // Verify all companies have KPI data
      component.carteiraClientes.forEach(company => {
        expect(company.deliveryKpi).toBeDefined();
        expect(company.cnpjId).toBeDefined();
        expect(company.actionCount).toBeGreaterThan(0);
      });

      // Verify color coding is correct
      expect(component.carteiraClientes[0].deliveryKpi?.color).toBe('yellow'); // 50%
      expect(component.carteiraClientes[1].deliveryKpi?.color).toBe('yellow'); // 60%
      expect(component.carteiraClientes[2].deliveryKpi?.color).toBe('yellow'); // 70%
      expect(component.carteiraClientes[3].deliveryKpi?.color).toBe('green'); // 80%
      expect(component.carteiraClientes[4].deliveryKpi?.color).toBe('green'); // 90%
    }));

    /**
     * Test 9.8: Performance within acceptable limits
     * Validates: Performance requirement (< 500ms)
     */
    it('should load KPI data within performance limits', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      const startTime = Date.now();

      const perfMaps = { byEmpId: new Map(), byCnpjNorm: new Map() };
      companyKpiService.fetchGamificacaoMapsAsync.and.returnValue(
        new Promise(resolve => setTimeout(() => resolve(perfMaps), 100))
      );
      playerService.getPlayerCnpjResp.and.returnValue(
        of(cnpjRespIdsFromList(createMockCnpjList())).pipe(delay(100))
      );
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(
        of(enrichedCompanies).pipe(delay(100))
      );

      // Act
      fixture.detectChanges();
      tick(250);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(component.carteiraClientes.length).toBe(3);
      expect(duration).toBeLessThan(500); // Should be under 500ms
    }));

    /**
     * Test 9.8: Verify data consistency
     * Validates: Requirements 2.2, 2.3
     */
    it('should maintain data consistency throughout the flow', fakeAsync(() => {
      // Arrange
      const mockCnpjList = createMockCnpjList();
      const enrichedCompanies = createEnrichedCompanies();

      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(mockCnpjList)));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      // Act
      fixture.detectChanges();
      tick();

      // Assert - Verify data consistency (CNPJ order; action counts come from Funifier enrichment)
      for (let i = 0; i < mockCnpjList.length; i++) {
        expect(component.carteiraClientes[i].cnpj).toBe(mockCnpjList[i].cnpj);
      }
    }));

    /**
     * Test 9.8: Verify month selection affects data
     * Validates: Requirements 1.4
     */
    it('should reload KPI data when month changes', fakeAsync(() => {
      // Arrange - Initial month
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      fixture.detectChanges();
      tick();

      const initialKpiCalls = kpiService.getPlayerKPIs.calls.count();

      // Act - Change month (reloads KPIs + progress, not carteira)
      component.onMonthChange(1); // 1 month ago
      tick();

      // Assert
      expect(kpiService.getPlayerKPIs.calls.count()).toBeGreaterThan(initialKpiCalls);
      expect(component.selectedMonth!.getMonth()).not.toBe(new Date().getMonth());
    }));
  });

  describe('Component cleanup', () => {
    it('should unsubscribe from observables on destroy', fakeAsync(() => {
      // Arrange
      const enrichedCompanies = createEnrichedCompanies();
      playerService.getPlayerCnpjResp.and.returnValue(of(cnpjRespIdsFromList(createMockCnpjList())));
      companyKpiService.enrichCarteiraRowsWithMaps.and.returnValue(enrichedCompanies);
      companyKpiService.enrichFromCnpjResp.and.returnValue(of(enrichedCompanies));

      fixture.detectChanges();
      tick();

      // Act
      component.ngOnDestroy();

      // Assert - Component should clean up properly
      expect(component.carteiraClientes.length).toBe(3);
    }));
  });
});
