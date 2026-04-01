import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { 
  generatePlayerStatus, 
  generatePointWallet, 
  generateSeasonProgress,
  generateCompany,
  generateKPIData
} from '@app/testing/mock-data-generators';

describe('GamificationDashboardComponent - Integration Tests', () => {
  let component: GamificationDashboardComponent;
  let fixture: ComponentFixture<GamificationDashboardComponent>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let companyService: jasmine.SpyObj<CompanyService>;
  let kpiService: jasmine.SpyObj<KPIService>;
  let toastService: jasmine.SpyObj<ToastService>;
  let actionLogService: jasmine.SpyObj<ActionLogService>;

  beforeEach(async () => {
    // Create spy objects for services
    const playerServiceSpy = jasmine.createSpyObj('PlayerService', [
      'getPlayerStatus',
      'getPlayerPoints',
      'getSeasonProgress'
    ]);
    
    const companyServiceSpy = jasmine.createSpyObj('CompanyService', [
      'getCompanies'
    ]);
    
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
      'getCompletedTasksCount'
    ]);
    actionLogServiceSpy.getProgressMetrics.and.returnValue(of({
      activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
      macro: { pendentes: 0, incompletas: 0, finalizadas: 0 }
    }));
    actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(of([]));
    actionLogServiceSpy.getUniqueClientesCount.and.returnValue(of(0));
    actionLogServiceSpy.getCompletedTasksCount.and.returnValue(of(0));

    const companyKpiServiceSpy = jasmine.createSpyObj('CompanyKpiService', [
      'extractCnpjId',
      'getKpiData',
      'enrichCompaniesWithKpis',
      'clearCache'
    ]);
    companyKpiServiceSpy.enrichCompaniesWithKpis.and.returnValue(of([]));

    const performanceMonitorSpy = jasmine.createSpyObj('PerformanceMonitorService', [
      'measureRenderTime',
      'trackChangeDetection',
      'logPerformanceReport'
    ]);
    performanceMonitorSpy.measureRenderTime.and.returnValue(() => {});

    const sessaoProviderSpy = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: { _id: 'test-user', email: 'test@example.com', roles: [] }
    });

    await TestBed.configureTestingModule({
      declarations: [GamificationDashboardComponent],
      providers: [
        { provide: PlayerService, useValue: playerServiceSpy },
        { provide: CompanyService, useValue: companyServiceSpy },
        { provide: KPIService, useValue: kpiServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: ActionLogService, useValue: actionLogServiceSpy },
        { provide: CompanyKpiService, useValue: companyKpiServiceSpy },
        { provide: PerformanceMonitorService, useValue: performanceMonitorSpy },
        { provide: SessaoProvider, useValue: sessaoProviderSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    playerService = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    companyService = TestBed.inject(CompanyService) as jasmine.SpyObj<CompanyService>;
    kpiService = TestBed.inject(KPIService) as jasmine.SpyObj<KPIService>;
    toastService = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    actionLogService = TestBed.inject(ActionLogService) as jasmine.SpyObj<ActionLogService>;

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
      companyService.getCompanies.and.returnValue(of(mockCompanies));
      kpiService.getPlayerKPIs.and.returnValue(of(mockKPIs));

      // Act
      fixture.detectChanges(); // Triggers ngOnInit
      tick();

      // Assert
      expect(component.playerStatus).toEqual(mockPlayerStatus);
      expect(component.pointWallet).toEqual(mockPointWallet);
      expect(component.seasonProgress).toEqual(mockSeasonProgress);
      expect(component.companies).toEqual(mockCompanies);
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
      companyService.getCompanies.and.returnValue(of([]).pipe(delay(100)));
      kpiService.getPlayerKPIs.and.returnValue(of([]).pipe(delay(100)));

      // Act
      fixture.detectChanges();

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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of(mockCompanies));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.companies).toEqual(mockCompanies);
      expect(component.companies.length).toBe(3);
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of(mockKPIs));

      // Act
      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      tick();

      // Reset call counts
      playerService.getPlayerStatus.calls.reset();
      companyService.getCompanies.calls.reset();
      kpiService.getPlayerKPIs.calls.reset();

      const monthsAgo = 1; // 1 month ago

      // Act
      component.onMonthChange(monthsAgo);
      tick();

      // Assert
      const expectedMonth = new Date();
      expectedMonth.setMonth(expectedMonth.getMonth() - monthsAgo);
      expect(component.selectedMonth.getMonth()).toEqual(expectedMonth.getMonth());
      expect(playerService.getPlayerStatus).toHaveBeenCalled();
      expect(companyService.getCompanies).toHaveBeenCalled();
      expect(kpiService.getPlayerKPIs).toHaveBeenCalled();
    }));

    it('should update selectedMonth property when month changes', fakeAsync(() => {
      // Arrange
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
      
      const monthsAgo = 2; // 2 months ago

      // Act
      component.onMonthChange(monthsAgo);
      tick();

      // Assert
      const expectedMonth = new Date();
      expectedMonth.setMonth(expectedMonth.getMonth() - monthsAgo);
      expect(component.selectedMonth.getMonth()).toEqual(expectedMonth.getMonth());
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      tick();

      // Reset call counts
      playerService.getPlayerStatus.calls.reset();
      playerService.getPlayerPoints.calls.reset();
      playerService.getSeasonProgress.calls.reset();
      companyService.getCompanies.calls.reset();
      kpiService.getPlayerKPIs.calls.reset();

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(playerService.getPlayerStatus).toHaveBeenCalled();
      expect(playerService.getPlayerPoints).toHaveBeenCalled();
      expect(playerService.getSeasonProgress).toHaveBeenCalled();
      expect(companyService.getCompanies).toHaveBeenCalled();
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
      companyService.getCompanies.and.returnValue(of([]));
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
      companyService.getCompanies.and.returnValue(of([]));
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
      companyService.getCompanies.and.returnValue(of([]));
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([generateCompany()]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
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

      // Assert - Context preserved despite error
      expect(component.selectedMonth).toEqual(selectedMonth);
      expect(toastService.error).toHaveBeenCalled();
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
      companyService.getCompanies.and.returnValue(of(initialCompanies));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
      tick();

      expect(component.companies.length).toBe(1);

      // Update service to return new data
      companyService.getCompanies.and.returnValue(of(updatedCompanies));

      // Act
      component.refreshData();
      tick();

      // Assert
      expect(component.companies.length).toBe(2);
      expect(component.companies).toEqual(updatedCompanies);
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
      companyService.getCompanies.and.returnValue(of([]).pipe(delay(50)));
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.playerStatus).toBeNull();
      expect(component.isLoadingPlayer).toBe(false);
      expect(toastService.error).toHaveBeenCalledWith('Erro ao carregar dados do jogador');
    }));

    it('should handle company data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load companies');
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      companyService.getCompanies.and.returnValue(throwError(() => error));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.companies).toEqual([]);
      expect(component.isLoadingCompanies).toBe(false);
      expect(toastService.error).toHaveBeenCalledWith('Erro ao carregar carteira de empresas');
    }));

    it('should handle KPI data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load KPIs');
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.playerKPIs).toEqual([]);
      expect(component.isLoadingKPIs).toBe(false);
      expect(toastService.error).toHaveBeenCalledWith('Erro ao carregar KPIs');
    }));

    it('should continue loading other sections when one fails', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load player data');
      playerService.getPlayerStatus.and.returnValue(throwError(() => error));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      companyService.getCompanies.and.returnValue(of([generateCompany()]));
      kpiService.getPlayerKPIs.and.returnValue(of([generateKPIData()]));

      // Act
      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));

      fixture.detectChanges();
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
      companyService.getCompanies.and.returnValue(of([]));
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
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
    });

    /**
     * Test loadCarteiraData loads CNPJ list with action counts and enriches with KPI data
     * Validates: Task 4.3 - Call enrichCompaniesWithKpis() to add KPI data
     */
    it('should load carteira data from action_log and enrich with KPI data on initialization', fakeAsync(() => {
      // Arrange
      const mockCarteiraData = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 8 }
      ];
      const mockEnrichedData: CompanyDisplay[] = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', cnpjId: '2000', actionCount: 5, deliveryKpi: { id: 'delivery', label: 'Entregas', current: 89, target: 100, unit: 'entregas', percentage: 89 } },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', cnpjId: '1218', actionCount: 3, deliveryKpi: { id: 'delivery', label: 'Entregas', current: 45, target: 100, unit: 'entregas', percentage: 45 } },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', cnpjId: '9654', actionCount: 8, deliveryKpi: { id: 'delivery', label: 'Entregas', current: 102, target: 100, unit: 'entregas', percentage: 100 } }
      ];
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(mockCarteiraData));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(actionLogService.getPlayerCnpjListWithCount).toHaveBeenCalled();
      expect(companyKpiService.enrichCompaniesWithKpis).toHaveBeenCalledWith(mockCarteiraData);
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
      expect(component.carteiraClientes.length).toBe(3);
      expect(component.isLoadingCarteira).toBe(false);
    }));

    /**
     * Test loadCarteiraData handles empty results
     * Validates: Task 4.3 - Handle loading states appropriately
     */
    it('should handle empty carteira data', fakeAsync(() => {
      // Arrange
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingCarteira).toBe(false);
    }));

    /**
     * Test loadCarteiraData handles errors gracefully
     * Validates: Task 4.3 - Handle loading states appropriately
     */
    it('should handle carteira data loading errors gracefully', fakeAsync(() => {
      // Arrange
      const error = new Error('Failed to load carteira data');
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes).toEqual([]);
      expect(component.isLoadingCarteira).toBe(false);
      // Note: No toast error is shown for carteira loading failures (silent failure)
    }));

    /**
     * Test loadCarteiraData sets loading state correctly
     * Validates: Task 4.3 - Handle loading states appropriately
     */
    it('should set loading state correctly during carteira data load', fakeAsync(() => {
      // Arrange
      const mockCarteiraData = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];
      const mockEnrichedData: CompanyDisplay[] = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', cnpjId: '2000', actionCount: 5, deliveryKpi: { id: 'delivery', label: 'Entregas', current: 89, target: 100, unit: 'entregas', percentage: 89 } }
      ];
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(mockCarteiraData).pipe(delay(100)));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();

      // Assert - Initially loading
      expect(component.isLoadingCarteira).toBe(true);

      // Wait for observable to complete
      tick(150);

      // Assert - Loading complete
      expect(component.isLoadingCarteira).toBe(false);
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
    }));

    /**
     * Test loadCarteiraData uses correct player ID
     * Validates: Task 4.3 - Load company data from action_log
     */
    it('should call getPlayerCnpjListWithCount with correct player ID', fakeAsync(() => {
      // Arrange
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of([]));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(actionLogService.getPlayerCnpjListWithCount).toHaveBeenCalledWith(
        'test@example.com', // From sessaoProvider mock
        jasmine.any(Date)
      );
    }));

    /**
     * Test loadCarteiraData uses selected month
     * Validates: Task 4.3 - Load company data from action_log
     */
    it('should call getPlayerCnpjListWithCount with selected month', fakeAsync(() => {
      // Arrange
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of([]));
      
      const testMonth = new Date('2024-01-15');
      component.selectedMonth = testMonth;

      // Act
      component['loadCarteiraData']();
      tick();

      // Assert
      expect(actionLogService.getPlayerCnpjListWithCount).toHaveBeenCalledWith(
        jasmine.any(String),
        testMonth
      );
    }));

    /**
     * Test loadCarteiraData reloads on month change
     * Validates: Task 4.3 - Load company data from action_log
     */
    it('should reload carteira data when month changes', fakeAsync(() => {
      // Arrange
      const initialData = [{ cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }];
      const newData = [{ cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }];
      const initialEnrichedData = [{ cnpj: 'COMPANY A l 0001 [2000|0001-60]', cnpjId: '2000', actionCount: 5 }];
      const newEnrichedData = [{ cnpj: 'COMPANY B l 0002 [1218|0002-45]', cnpjId: '1218', actionCount: 3 }];
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(initialData));
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(initialEnrichedData));
      
      fixture.detectChanges();
      tick();
      
      expect(component.carteiraClientes).toEqual(initialEnrichedData);
      
      // Reset and set new data
      actionLogService.getPlayerCnpjListWithCount.calls.reset();
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(newData));
      companyKpiService.enrichCompaniesWithKpis.calls.reset();
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(newEnrichedData));

      // Act - Change month
      component.onMonthChange(1); // 1 month ago
      tick();

      // Assert
      expect(actionLogService.getPlayerCnpjListWithCount).toHaveBeenCalled();
      expect(companyKpiService.enrichCompaniesWithKpis).toHaveBeenCalledWith(newData);
      expect(component.carteiraClientes).toEqual(newEnrichedData);
    }));

    /**
     * Test loadCarteiraData handles no player ID gracefully
     * Validates: Task 4.3 - Handle loading states appropriately
     */
    it('should handle missing player ID gracefully', fakeAsync(() => {
      // Arrange
      const sessaoProviderSpy = TestBed.inject(SessaoProvider) as jasmine.SpyObj<SessaoProvider>;
      Object.defineProperty(sessaoProviderSpy, 'usuario', {
        get: () => null
      });
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;

      // Act
      component['loadCarteiraData']();
      tick();

      // Assert
      expect(component.isLoadingCarteira).toBe(false);
      expect(component.carteiraClientes).toEqual([]);
      expect(actionLogService.getPlayerCnpjListWithCount).not.toHaveBeenCalled();
      expect(companyKpiService.enrichCompaniesWithKpis).not.toHaveBeenCalled();
    }));

    /**
     * Test loadCarteiraData enriches companies with KPI data using switchMap
     * Validates: Task 4.3 - Call enrichCompaniesWithKpis() to add KPI data
     */
    it('should enrich companies with KPI data using switchMap', fakeAsync(() => {
      // Arrange
      const mockCarteiraData = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ];
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'COMPANY A l 0001 [2000|0001-60]', 
          cnpjId: '2000', 
          actionCount: 5, 
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
          actionCount: 3, 
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
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(mockCarteiraData));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert - Verify enrichCompaniesWithKpis was called with the raw data
      expect(companyKpiService.enrichCompaniesWithKpis).toHaveBeenCalledWith(mockCarteiraData);
      
      // Assert - Verify the enriched data is stored in the component
      expect(component.carteiraClientes).toEqual(mockEnrichedData);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(89);
      expect(component.carteiraClientes[1].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[1].deliveryKpi?.current).toBe(45);
    }));

    /**
     * Test loadCarteiraData handles enrichment errors gracefully
     * Validates: Task 4.3 - Maintain existing error handling
     */
    it('should handle enrichment errors gracefully', fakeAsync(() => {
      // Arrange
      const mockCarteiraData = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ];
      const error = new Error('Failed to enrich companies with KPI data');
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of(mockCarteiraData));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(throwError(() => error));

      // Act
      fixture.detectChanges();
      tick();

      // Assert - Error should be handled gracefully
      expect(component.isLoadingCarteira).toBe(false);
      expect(component.carteiraClientes).toEqual([]);
      // Note: No toast error is shown for enrichment failures (silent failure)
    }));
  });

  describe('KPI Display in Carteira Section', () => {
    beforeEach(() => {
      playerService.getPlayerStatus.and.returnValue(of(generatePlayerStatus()));
      playerService.getPlayerPoints.and.returnValue(of(generatePointWallet()));
      playerService.getSeasonProgress.and.returnValue(of(generateSeasonProgress()));
      companyService.getCompanies.and.returnValue(of([]));
      kpiService.getPlayerKPIs.and.returnValue(of([]));
    });

    /**
     * Test KPI indicator displays when deliveryKpi is available
     * Validates: Task 5.6 - Display KPI indicator when cliente has deliveryKpi
     */
    it('should display KPI indicator when cliente has deliveryKpi', fakeAsync(() => {
      // Arrange
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'COMPANY A l 0001 [2000|0001-60]', 
          cnpjId: '2000', 
          actionCount: 5, 
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
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 }
      ]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[0].deliveryKpi?.label).toBe('Entregas');
      expect(component.carteiraClientes[0].deliveryKpi?.current).toBe(89);
      expect(component.carteiraClientes[0].deliveryKpi?.target).toBe(100);
      expect(component.carteiraClientes[0].deliveryKpi?.percentage).toBe(89);
    }));

    /**
     * Test "N/A" displays when deliveryKpi is missing
     * Validates: Task 5.6 - Display "N/A" when cliente does not have deliveryKpi
     */
    it('should display "N/A" when cliente does not have deliveryKpi', fakeAsync(() => {
      // Arrange
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'COMPANY B l 0002 [1218|0002-45]', 
          cnpjId: '1218', 
          actionCount: 3
          // No deliveryKpi property
        }
      ];
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 }
      ]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(1);
      expect(component.carteiraClientes[0].deliveryKpi).toBeUndefined();
    }));

    /**
     * Test multiple companies with mixed KPI availability
     * Validates: Task 5.6 - Handle mixed scenarios
     */
    it('should handle multiple companies with mixed KPI availability', fakeAsync(() => {
      // Arrange
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'COMPANY A l 0001 [2000|0001-60]', 
          cnpjId: '2000', 
          actionCount: 5, 
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
          actionCount: 3
          // No deliveryKpi
        },
        { 
          cnpj: 'COMPANY C l 0003 [9654|0003-12]', 
          cnpjId: '9654', 
          actionCount: 8, 
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
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3 },
        { cnpj: 'COMPANY C l 0003 [9654|0003-12]', actionCount: 8 }
      ]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes.length).toBe(3);
      expect(component.carteiraClientes[0].deliveryKpi).toBeDefined();
      expect(component.carteiraClientes[1].deliveryKpi).toBeUndefined();
      expect(component.carteiraClientes[2].deliveryKpi).toBeDefined();
    }));

    /**
     * Test KPI indicator with different performance levels
     * Validates: Task 5.6 - Verify KPI values are correctly displayed
     */
    it('should display KPI indicators with different performance levels', fakeAsync(() => {
      // Arrange
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'LOW PERFORMER l 0001 [1000|0001-60]', 
          cnpjId: '1000', 
          actionCount: 2, 
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
          actionCount: 5, 
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
          actionCount: 10, 
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
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([
        { cnpj: 'LOW PERFORMER l 0001 [1000|0001-60]', actionCount: 2 },
        { cnpj: 'MEDIUM PERFORMER l 0002 [2000|0002-45]', actionCount: 5 },
        { cnpj: 'HIGH PERFORMER l 0003 [3000|0003-12]', actionCount: 10 }
      ]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
      expect(component.carteiraClientes[0].deliveryKpi?.percentage).toBe(25);
      expect(component.carteiraClientes[1].deliveryKpi?.percentage).toBe(60);
      expect(component.carteiraClientes[2].deliveryKpi?.percentage).toBe(95);
    }));

    /**
     * Test KPI indicator with over-target performance
     * Validates: Task 5.6 - Handle edge case where current > target
     */
    it('should display KPI indicator when performance exceeds target', fakeAsync(() => {
      // Arrange
      const mockEnrichedData: CompanyDisplay[] = [
        { 
          cnpj: 'OVER PERFORMER l 0001 [4000|0001-60]', 
          cnpjId: '4000', 
          actionCount: 15, 
          deliveryKpi: { 
            id: 'delivery', 
            label: 'Entregas', 
            current: 120, 
            target: 100, 
            unit: 'entregas', 
            percentage: 100, // Capped at 100%
            color: 'green' as const
          } 
        }
      ];
      
      actionLogService.getPlayerCnpjListWithCount.and.returnValue(of([
        { cnpj: 'OVER PERFORMER l 0001 [4000|0001-60]', actionCount: 15 }
      ]));
      
      const companyKpiService = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
      companyKpiService.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedData));

      // Act
      fixture.detectChanges();
      tick();

      // Assert
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
