import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { 
  PlayerStatus, 
  PointWallet, 
  SeasonProgress, 
  Company, 
  KPIData,
  ActivityMetrics,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { CompanyDisplay } from '@services/company-kpi.service';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';

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
  
  // Activity and Process data
  activityMetrics: ActivityMetrics | null = null;
  processMetrics: ProcessMetrics | null = null;
  monthlyPointsBreakdown: { bloqueados: number; desbloqueados: number } | null = null;
  
  // Company data
  companies: Company[] = [];
  selectedCompany: Company | null = null;
  
  // Carteira data from action_log (CNPJs with action counts and KPI data)
  carteiraClientes: CompanyDisplay[] = [];
  isLoadingCarteira = true;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name
  
  // Month selection
  selectedMonth: Date = new Date();
  
  // Modal state
  isCompanyModalOpen = false;
  
  // Progress list modal state
  isProgressModalOpen = false;
  progressModalType: ProgressListType = 'atividades';
  
  // Carteira modal state
  isCarteiraModalOpen = false;
  
  // Company carteira detail modal state
  isCompanyCarteiraDetailModalOpen = false;
  selectedCarteiraCompany: CompanyDisplay | null = null;
  
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
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
    private sessaoProvider: SessaoProvider,
    private route: ActivatedRoute,
    private router: Router
  ) {
    // Start measuring render time
    this.endRenderMeasurement = this.performanceMonitor.measureRenderTime('GamificationDashboardComponent');
  }
  
  /**
   * Get current player ID from query params, session, or use 'me' for Funifier API
   * 
   * Priority:
   * 1. Query parameter 'playerId' (when viewing another player's dashboard)
   * 2. Current user from session
   * 3. 'me' as fallback
   */
  getPlayerId(): string {
    // Check for playerId in query params (when viewing another player's dashboard)
    const playerIdParam = this.route.snapshot.queryParams['playerId'];
    if (playerIdParam && typeof playerIdParam === 'string') {
      console.log('📊 Using player ID from query params:', playerIdParam);
      return playerIdParam;
    }
    
    // Try to get from current user session
    const usuario = this.sessaoProvider.usuario;
    if (usuario) {
      const sessionPlayerId = usuario._id || usuario.email;
      if (sessionPlayerId && typeof sessionPlayerId === 'string') {
        console.log('📊 Using player ID from session:', sessionPlayerId);
        return sessionPlayerId;
      }
    }
    
    // Fallback to 'me' (current authenticated user)
    console.log('📊 Using default player ID: me');
    return 'me';
  }
  
  ngOnInit(): void {
    console.log('🎮 GamificationDashboardComponent ngOnInit STARTED');
    this.checkResponsiveBreakpoints();
    
    // Listen for query param changes (when viewing different players)
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const playerId = params['playerId'];
        if (playerId) {
          console.log('📊 Player ID changed via query params:', playerId);
          this.loadDashboardData();
        }
      });
    
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
   * Load all dashboard data asynchronously
   * All data loads in parallel to avoid blocking the UI
   */
  loadDashboardData(): void {
    // Set refresh time immediately
    this.lastRefreshTime = new Date();
    
    // Load all data in parallel - UI will update as data arrives
    // This allows the page to render immediately while data loads
    this.loadPlayerData();
    this.loadCompanyData();
    this.loadCarteiraData();
    this.loadKPIData();
    this.loadProgressData();
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
    
    // Load season progress (basic data from player status)
    console.log('📊 Starting season progress request...');
    this.playerService.getSeasonProgress(playerId, this.seasonDates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          console.log('📊 Season progress loaded:', progress);
          this.seasonProgress = progress;
          this.cdr.markForCheck();
          
          // Load additional data for season progress
          this.loadSeasonProgressDetails();
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
   * Load additional season progress details:
   * - Metas: count of KPIs above target from metric_targets__c
   * - Clientes: count of unique CNPJs from action_log aggregate
   * - Tarefas finalizadas: count of actions from action_log
   */
  private loadSeasonProgressDetails(): void {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
      return;
    }

    // Load clientes count from unique CNPJs in action_log
    this.actionLogService.getUniqueClientesCount(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (count: number) => {
          console.log('📊 Unique CNPJs (Clientes) count:', count);
          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              clientes: count
            };
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load clientes count:', err);
        }
      });
    
    // Load tarefas finalizadas from action_log
    this.actionLogService.getCompletedTasksCount(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (count: number) => {
          console.log('📊 Tarefas finalizadas count:', count);
          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              tarefasFinalizadas: count
            };
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load tarefas count:', err);
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
          
          // Note: clientes count is now loaded from action_log unique CNPJs
          // in loadSeasonProgressDetails(), not from companies.length
          
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
   * Load carteira data from action_log (CNPJs with action counts)
   * and enrich with KPI data from cnpj__c collection
   */
  private loadCarteiraData(): void {
    this.isLoadingCarteira = true;
    
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
      console.warn('📊 No player ID available for carteira data');
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
      return;
    }
    
    this.actionLogService.getPlayerCnpjListWithCount(playerId, this.selectedMonth)
      .pipe(
        switchMap(clientes => {
          console.log('📊 Carteira clientes loaded, enriching with KPI data:', clientes);
          
          // Extract all CNPJ strings for lookup
          const cnpjList = clientes.map(c => c.cnpj);
          
          // Enrich CNPJs with clean company names and KPI data in parallel
          return this.cnpjLookupService.enrichCnpjList(cnpjList).pipe(
            switchMap(cnpjNames => {
              // Store the CNPJ name map for display
              this.cnpjNameMap = cnpjNames;
              // Enrich companies with KPI data from cnpj__c collection
              return this.companyKpiService.enrichCompaniesWithKpis(clientes);
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes) => {
          console.log('📊 Carteira clientes enriched with KPI data:', enrichedClientes);
          console.log('📊 CNPJ name map:', this.cnpjNameMap);
          this.carteiraClientes = enrichedClientes;
          this.isLoadingCarteira = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load carteira data:', error);
          this.isLoadingCarteira = false;
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
    
    // Pass selectedMonth and actionLogService to getPlayerKPIs
    this.kpiService.getPlayerKPIs(playerId, this.selectedMonth, this.actionLogService)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (kpis) => {
          console.log('📊 KPIs loaded:', kpis, `(${kpis?.length || 0} KPIs)`);
          this.playerKPIs = kpis || [];
          this.isLoadingKPIs = false;
          
          // Always update metas if we have KPIs (even if empty, to show 0/0)
          // But preserve existing values if KPIs array is null/undefined (error case)
          if (kpis !== null && kpis !== undefined) {
            this.updateMetasFromKPIs(kpis);
          } else {
            console.log('📊 KPIs is null/undefined, skipping metas update to preserve existing values');
          }
          
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load KPIs:', error);
          this.toastService.error('Erro ao carregar KPIs');
          this.isLoadingKPIs = false;
          // Don't update metas on error - preserve existing values
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Update metas count based on KPIs that are above their target
   * Metas = count of KPIs where current >= target
   * Only updates if there are KPIs available, otherwise preserves existing values
   * This method assumes kpis array is not empty (checked before calling)
   */
  private updateMetasFromKPIs(kpis: KPIData[]): void {
    if (!this.seasonProgress) {
      console.warn('📊 updateMetasFromKPIs called but seasonProgress is null');
      return;
    }
    
    // Allow empty array - this means 0/0 (no KPIs available)
    const totalKPIs = kpis ? kpis.length : 0;
    const metasAchieved = kpis ? kpis.filter(kpi => kpi.current >= kpi.target).length : 0;
    
    // Update with KPI-based values
    // Note: metasAchieved can be 0 if no KPIs meet their target
    // totalKPIs can be 0 if no KPIs are available (should show 0/0)
    this.seasonProgress = {
      ...this.seasonProgress,
      metas: {
        current: metasAchieved,
        target: totalKPIs
      }
    };
    
    console.log('📊 Metas updated from KPIs:', this.seasonProgress.metas, `(${metasAchieved}/${totalKPIs})`, `from ${totalKPIs} KPIs`);
  }
  
  /**
   * Load activity and macro progress data from action_log
   */
  private loadProgressData(): void {
    this.isLoadingProgress = true;
    
    // Get player email/id for action log query
    // Funifier uses email as the player ID
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
      console.warn('📊 No player ID available for progress data');
      // Use default values if no player ID
      this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
      this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
      this.isLoadingProgress = false;
      this.cdr.markForCheck();
      return;
    }

    this.actionLogService.getProgressMetrics(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          console.log('📊 Progress metrics loaded:', metrics);
          this.activityMetrics = metrics.activity;
          this.processMetrics = metrics.processo;
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load progress metrics:', error);
          // Use default values on error
          this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
          this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        }
      });

    // Load monthly points breakdown
    this.actionLogService.getMonthlyPointsBreakdown(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (breakdown) => {
          console.log('📊 Monthly points breakdown loaded:', breakdown);
          this.monthlyPointsBreakdown = breakdown;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load monthly points breakdown:', error);
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
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
   * Handle company selection from carteira list
   */
  openCompanyDetailModal(company: CompanyDisplay): void {
    this.selectedCarteiraCompany = company;
    this.isCompanyCarteiraDetailModalOpen = true;
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    const companyName = this.getCompanyDisplayName(company.cnpj);
    this.announceToScreenReader(`Abrindo detalhes de ${companyName}`);
  }

  /**
   * Handle company carteira detail modal close
   */
  onCompanyCarteiraDetailModalClosed(): void {
    const companyName = this.selectedCarteiraCompany 
      ? this.getCompanyDisplayName(this.selectedCarteiraCompany.cnpj) 
      : 'empresa';
    this.isCompanyCarteiraDetailModalOpen = false;
    this.selectedCarteiraCompany = null;
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
   * Handle progress card click from c4u-activity-progress
   */
  onProgressCardClicked(cardType: ProgressCardType): void {
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    
    // Map card type to modal type
    switch (cardType) {
      case 'atividades-finalizadas':
        this.progressModalType = 'atividades';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de atividades finalizadas');
        break;
      case 'atividades-pontos':
        this.progressModalType = 'pontos';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de pontos');
        break;
      case 'processos-pendentes':
        this.progressModalType = 'processos-pendentes';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de processos pendentes');
        break;
      case 'processos-finalizados':
        this.progressModalType = 'processos-finalizados';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de processos finalizados');
        break;
    }
  }
  
  /**
   * Handle progress modal close
   */
  onProgressModalClosed(): void {
    this.isProgressModalOpen = false;
    this.announceToScreenReader('Modal de progresso fechado');
    
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }
  
  /**
   * Open carteira modal
   */
  openCarteiraModal(): void {
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    this.isCarteiraModalOpen = true;
    this.announceToScreenReader('Abrindo carteira de clientes');
  }
  
  /**
   * Handle carteira modal close
   */
  onCarteiraModalClosed(): void {
    this.isCarteiraModalOpen = false;
    this.announceToScreenReader('Modal de carteira fechado');
    
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }
  
  /**
   * Get current player ID for modals (email-based)
   */
  get currentPlayerId(): string {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    if (!usuario) {
      return '';
    }
    return (usuario._id || usuario.email || '') as string;
  }
  
  /**
   * Manual refresh mechanism
   */
  refreshData(): void {
    this.toastService.alert('Atualizando dados...');
    this.announceToScreenReader('Atualizando dados do painel');
    // Clear cache to force fresh data
    this.playerService.clearCache();
    this.loadDashboardData();
  }
  
  /**
   * Toggle sidebar collapsed state
   */
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.announceToScreenReader(this.sidebarCollapsed ? 'Menu recolhido' : 'Menu expandido');
  }
  
  /**
   * Track by function for KPI list
   */
  trackByKpiId(_index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /**
   * Round a number to remove decimal places
   */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /**
   * Format KPI value as integer with percentage symbol for compact display
   */
  /**
   * Format KPI value for display in company list
   * For percentage-based KPIs (unit === '%'), show the raw value directly
   * For other KPIs, show percentage of target achievement
   */
  formatKpiValue(kpi: KPIData): string {
    // For percentage KPIs (like "Entregas no Prazo"), show the raw value
    if (kpi.unit === '%') {
      return `${Math.round(kpi.current)}%`;
    }
    
    // For other KPIs, calculate percentage of target
    if (kpi.target === 0) {
      return '0%';
    }
    const percentage = Math.round((kpi.current / kpi.target) * 100);
    return `${percentage}%`;
  }

  /**
   * Get tooltip text showing current value vs target
   * Format: "75% de 80%" (valor alcançado de meta)
   */
  getKpiTooltip(kpi: KPIData): string {
    const current = Math.round(kpi.current);
    const target = Math.round(kpi.target);
    const unit = kpi.unit || '';
    return `${current}${unit} de ${target}${unit}`;
  }
  
  /**
   * Get clean company display name from CNPJ
   * Uses the enriched CNPJ name map from the lookup service
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    console.log('📊 getCompanyDisplayName called:', { cnpj, displayName, hasInMap: this.cnpjNameMap.has(cnpj), mapSize: this.cnpjNameMap.size });
    return displayName || cnpj;
  }
  
  /**
   * Calculate the average KPI percentage across all player KPIs based on super goals
   * Super goal = 100%, 0 = 0%. This is used for the level indicator in the sidebar
   */
  get kpiAveragePercent(): number {
    if (!this.playerKPIs || this.playerKPIs.length === 0) {
      return 0;
    }
    
    const totalPercent = this.playerKPIs.reduce((sum, kpi) => {
      // Calculate percentage based on super goal (super goal = 100%)
      const superGoal = kpi.superTarget || kpi.target;
      const percent = superGoal > 0 ? (kpi.current / superGoal) * 100 : 0;
      return sum + Math.min(100, percent); // Cap at 100%
    }, 0);
    
    return Math.round(totalPercent / this.playerKPIs.length);
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

  /**
   * Logout user and redirect to login page
   * Includes double confirmation to prevent accidental logout
   */
  logout(): void {
    // First confirmation
    const firstConfirm = window.confirm('Tem certeza que deseja sair do sistema?');
    if (!firstConfirm) {
      return;
    }
    
    // Second confirmation (double validation)
    const secondConfirm = window.confirm('Esta ação irá desconectar você do sistema. Deseja continuar?');
    if (!secondConfirm) {
      return;
    }
    
    // If both confirmations are accepted, proceed with logout
    this.announceToScreenReader('Saindo do sistema...');
    this.sessaoProvider.logout();
  }
}
