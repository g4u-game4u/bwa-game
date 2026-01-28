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
      'getProgressMetrics'
    ]);
    actionLogServiceSpy.getProgressMetrics.and.returnValue(of({
      activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
      macro: { pendentes: 0, incompletas: 0, finalizadas: 0 }
    }));

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
        { provide: PerformanceMonitorService, useValue: performanceMonitorSpy },
        { provide: SessaoProvider, useValue: sessaoProviderSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    playerService = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    companyService = TestBed.inject(CompanyService) as jasmine.SpyObj<CompanyService>;
    kpiService = TestBed.inject(KPIService) as jasmine.SpyObj<KPIService>;
    toastService = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;

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
});
