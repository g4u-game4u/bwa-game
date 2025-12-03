import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { 
  PlayerStatus, 
  PointWallet, 
  SeasonProgress, 
  Company, 
  KPIData,
  ActivityMetrics,
  MacroMetrics
} from '@model/gamification-dashboard.model';

@Component({
  selector: 'app-gamification-dashboard',
  templateUrl: './gamification-dashboard.component.html',
  styleUrls: ['./gamification-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamificationDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private endRenderMeasurement: (() => void) | null = null;
  
  // Responsive properties
  isMobile = false;
  isTablet = false;
  isDesktop = true;
  sidebarCollapsed = false;
  
  // Breakpoint constants
  private readonly MOBILE_BREAKPOINT = 768;
  private readonly TABLET_BREAKPOINT = 1024;
  
  @HostListener('window:resize')
  onResize(): void {
    this.checkResponsiveBreakpoints();
  }
  
  // Loading states
  isLoadingPlayer = true;
  isLoadingCompanies = true;
  isLoadingKPIs = true;
  isLoadingProgress = true;
  
  // Player data
  playerStatus: PlayerStatus | null = null;
  pointWallet: PointWallet | null = null;
  seasonProgress: SeasonProgress | null = null;
  
  // KPI data
  playerKPIs: KPIData[] = [];
  
  // Activity and Macro data
  activityMetrics: ActivityMetrics | null = null;
  macroMetrics: MacroMetrics | null = null;
  
  // Company data
  companies: Company[] = [];
  selectedCompany: Company | null = null;
  
  // Month selection
  selectedMonth: Date = new Date();
  
  // Modal state
  isCompanyModalOpen = false;
  
  // Refresh state
  lastRefreshTime: Date | null = null;
  
  // Season dates (TODO: Get from season service or API)
  private readonly seasonDates = {
    start: new Date('2023-04-01'),
    end: new Date('2023-09-30')
  };
  
  // Accessibility properties
  screenReaderAnnouncement = '';
  private focusedElementBeforeModal: HTMLElement | null = null;
  
  constructor(
    private playerService: PlayerService,
    private companyService: CompanyService,
    private kpiService: KPIService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private performanceMonitor: PerformanceMonitorService,
    private actionLogService: ActionLogService,
    private sessaoProvider: SessaoProvider
  ) {
    // Start measuring render time
    this.endRenderMeasurement = this.performanceMonitor.measureRenderTime('GamificationDashboardComponent');
  }
  
  /**
   * Get current player ID from session or use 'me' for Funifier API
   */
  private getPlayerId(): string {
    // Funifier API supports 'me' as a special identifier for the current authenticated user
    // This is the preferred approach as it doesn't require knowing the player ID upfront
    return 'me';
  }
  
  ngOnInit(): void {
    console.log('🎮 GamificationDashboardComponent ngOnInit STARTED');
    this.checkResponsiveBreakpoints();
    console.log('🎮 About to call loadDashboardData...');
    this.loadDashboardData();
    console.log('🎮 loadDashboardData called');
    this.announceToScreenReader('Painel de gamificação carregado');
    this.performanceMonitor.trackChangeDetection('GamificationDashboardComponent');
  }

  ngAfterViewInit(): void {
    // End render measurement
    if (this.endRenderMeasurement) {
      this.endRenderMeasurement();
    }

    // Log performance report in development mode
    if (!this.isProduction()) {
      setTimeout(() => {
        this.performanceMonitor.logPerformanceReport();
      }, 1000);
    }
  }

  private isProduction(): boolean {
    return typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  }
  
  /**
   * Announce message to screen readers
   */
  private announceToScreenReader(message: string): void {
    this.screenReaderAnnouncement = message;
    // Clear the announcement after a short delay to allow for re-announcements
    setTimeout(() => {
      this.screenReaderAnnouncement = '';
    }, 1000);
  }
  
  /**
   * Check and update responsive breakpoints
   */
  private checkResponsiveBreakpoints(): void {
    const width = window.innerWidth;
    this.isMobile = width < this.MOBILE_BREAKPOINT;
    this.isTablet = width >= this.MOBILE_BREAKPOINT && width < this.TABLET_BREAKPOINT;
    this.isDesktop = width >= this.TABLET_BREAKPOINT;
    this.cdr.markForCheck();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  /**
   * Load all dashboard data
   */
  loadDashboardData(): void {
    this.loadPlayerData();
    this.loadCompanyData();
    this.loadKPIData();
    this.loadProgressData();
    this.lastRefreshTime = new Date();
  }
  
  /**
   * Load player status, points, and season progress
   */
  private loadPlayerData(): void {
    this.isLoadingPlayer = true;
    this.cdr.markForCheck();
    
    const playerId = this.getPlayerId();
    
    // Load player status
    console.log('📊 Loading player data for:', playerId);
    console.log('📊 Token available:', !!this.sessaoProvider.token);
    console.log('📊 Token value:', this.sessaoProvider.token?.substring(0, 20) + '...');
    
    // Safety timeout to prevent infinite loading state
    const loadingTimeout = setTimeout(() => {
      if (this.isLoadingPlayer) {
        console.warn('📊 Loading timeout reached, forcing loading state to false');
        this.isLoadingPlayer = false;
        this.cdr.markForCheck();
      }
    }, 20000); // 20 second timeout
    
    this.playerService.getPlayerStatus(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          console.log('📊 Player status loaded:', status);
          clearTimeout(loadingTimeout);
          this.playerStatus = status;
          this.isLoadingPlayer = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load player status:', error);
          clearTimeout(loadingTimeout);
          this.toastService.error('Erro ao carregar dados do jogador');
          this.isLoadingPlayer = false;
          this.cdr.markForCheck();
        },
        complete: () => {
          console.log('📊 Player status request completed');
          clearTimeout(loadingTimeout);
        }
      });
    
    // Load point wallet
    console.log('📊 Starting point wallet request...');
    this.playerService.getPlayerPoints(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (points) => {
          console.log('📊 Point wallet loaded:', points);
          this.pointWallet = points;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load point wallet:', error);
          // Set default values on error so UI doesn't stay stuck
          this.pointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 };
          this.cdr.markForCheck();
        },
        complete: () => {
          console.log('📊 Point wallet request completed');
        }
      });
    
    // Load season progress
    console.log('📊 Starting season progress request...');
    this.playerService.getSeasonProgress(playerId, this.seasonDates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          console.log('📊 Season progress loaded:', progress);
          this.seasonProgress = progress;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load season progress:', error);
          // Set default values on error so UI doesn't stay stuck
          this.seasonProgress = {
            metas: { current: 0, target: 0 },
            clientes: 0,
            tarefasFinalizadas: 0,
            seasonDates: this.seasonDates
          };
          this.cdr.markForCheck();
        },
        complete: () => {
          console.log('📊 Season progress request completed');
        }
      });
  }
  
  /**
   * Load company portfolio data
   */
  private loadCompanyData(): void {
    this.isLoadingCompanies = true;
    
    const playerId = this.getPlayerId();
    
    this.companyService.getCompanies(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (companies) => {
          console.log('📊 Companies loaded:', companies);
          this.companies = companies;
          this.isLoadingCompanies = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load companies:', error);
          this.toastService.error('Erro ao carregar carteira de empresas');
          this.isLoadingCompanies = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Load KPI data
   */
  private loadKPIData(): void {
    this.isLoadingKPIs = true;
    
    const playerId = this.getPlayerId();
    
    this.kpiService.getPlayerKPIs(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (kpis) => {
          console.log('📊 KPIs loaded:', kpis);
          this.playerKPIs = kpis;
          this.isLoadingKPIs = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load KPIs:', error);
          this.toastService.error('Erro ao carregar KPIs');
          this.isLoadingKPIs = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Load activity and macro progress data from action_log
   */
  private loadProgressData(): void {
    this.isLoadingProgress = true;
    
    // Get player email/id for action log query
    // Funifier uses email as the player ID
    const usuario = this.sessaoProvider.usuario as any;
    const playerId = usuario?._id || usuario?.email || '';
    
    if (!playerId) {
      console.warn('📊 No player ID available for progress data');
      // Use default values if no player ID
      this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
      this.macroMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
      this.isLoadingProgress = false;
      this.cdr.markForCheck();
      return;
    }

    this.actionLogService.getProgressMetrics(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          console.log('📊 Progress metrics loaded:', metrics);
          this.activityMetrics = metrics.activity;
          this.macroMetrics = metrics.macro;
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load progress metrics:', error);
          // Use default values on error
          this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
          this.macroMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Handle month change event from c4u-seletor-mes
   * @param monthsAgo - Number of months ago (0 = current month)
   */
  onMonthChange(monthsAgo: number): void {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    this.selectedMonth = date;
    const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    this.announceToScreenReader(`Mês alterado para ${monthName}`);
    this.loadDashboardData();
  }
  
  /**
   * Handle company selection from table
   */
  onCompanySelected(company: Company): void {
    this.selectedCompany = company;
    this.isCompanyModalOpen = true;
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    this.announceToScreenReader(`Abrindo detalhes de ${company.name}`);
  }
  
  /**
   * Handle company modal close
   */
  onCompanyModalClosed(): void {
    const companyName = this.selectedCompany?.name || 'empresa';
    this.isCompanyModalOpen = false;
    this.selectedCompany = null;
    this.announceToScreenReader(`Modal de ${companyName} fechado`);
    
    // Restore focus to the element that was focused before the modal opened
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }
  
  /**
   * Manual refresh mechanism
   */
  refreshData(): void {
    this.toastService.alert('Atualizando dados...');
    this.announceToScreenReader('Atualizando dados do painel');
    this.loadDashboardData();
  }
  
  /**
   * Track by function for KPI list
   */
  trackByKpiId(_index: number, kpi: KPIData): string {
    return kpi.id;
  }
  
  /**
   * Check if any section is loading
   */
  get isLoading(): boolean {
    return this.isLoadingPlayer || 
           this.isLoadingCompanies || 
           this.isLoadingKPIs || 
           this.isLoadingProgress;
  }
  
  /**
   * Get formatted last refresh time
   */
  get formattedRefreshTime(): string {
    if (!this.lastRefreshTime) return '';
    
    const now = new Date();
    const diff = now.getTime() - this.lastRefreshTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Agora mesmo';
    if (minutes === 1) return 'Há 1 minuto';
    return `Há ${minutes} minutos`;
  }
}
