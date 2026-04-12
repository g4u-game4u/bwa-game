import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, switchMap, finalize, map } from 'rxjs/operators';

import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { SystemParamsService } from '@services/system-params.service';
import { FinanceiroOmieRecebiveisService } from '@services/financeiro-omie-recebiveis.service';
import { BackendActionApiService } from '@services/backend-action-api.service';
import { UserActionDashboardService } from '@services/user-action-dashboard.service';
import { environment } from '../../../../environments/environment';
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
import { SEASON_GAME_ACTION_RANGE } from '@app/constants/season-action-range';
import { filterCompanyDisplaysByClienteSearch } from '@utils/cliente-carteira-search.util';

@Component({
  selector: 'app-gamification-dashboard',
  templateUrl: './gamification-dashboard.component.html',
  styleUrls: ['./gamification-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamificationDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private endRenderMeasurement: (() => void) | null = null;
  private static readonly FINANCE_TEAM_ID = 'Fouegv0';
  
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
  
  // Carteira: entregas do jogador (GET /user-action), enriquecidas com KPI quando há CNPJ no deal
  carteiraClientes: CompanyDisplay[] = [];
  /** Filtro local da lista Clientes (nome da entrega, CNPJ, delivery id, …). */
  carteiraClienteSearchTerm = '';
  isLoadingCarteira = true;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name
  
  // Month selection (temporada padrão mar–abr/2026; alinhado ao seletor — abril = mais recente)
  selectedMonth: Date = new Date(2026, 3, 1);
  
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

  /** Teste GET `/action` no backend (`backend_url_base`). */
  isActionApiLoading = false;
  
  /** Intervalo exibido e usado em GET `/game/actions?start&end` para o cartão de temporada (fixo mar–abr/2026). */
  private readonly seasonDates = SEASON_GAME_ACTION_RANGE;
  
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
    private cnpjLookupService: CnpjLookupService,
    private sessaoProvider: SessaoProvider,
    private systemParamsService: SystemParamsService,
    private financeiroOmieRecebiveisService: FinanceiroOmieRecebiveisService,
    private backendActionApiService: BackendActionApiService,
    private userActionDashboard: UserActionDashboardService,
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
      return playerIdParam;
    }
    
    // Try to get from current user session
    const usuario = this.sessaoProvider.usuario;
    if (usuario) {
      const sessionPlayerId = usuario._id || usuario.email;
      if (sessionPlayerId && typeof sessionPlayerId === 'string') {
        return sessionPlayerId;
      }
    }
    
    // Fallback to 'me' (current authenticated user)
    return 'me';
  }
  
  ngOnInit(): void {
    this.checkResponsiveBreakpoints();
    
    // Listen for query param changes (when viewing different players)
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const playerId = params['playerId'];
        if (playerId) {
          this.loadDashboardData();
        }
      });
    this.loadDashboardData();
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
          clearTimeout(loadingTimeout);
        }
      });
    
    // Load point wallet
    this.playerService.getPlayerPoints(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (points) => {
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
        }
      });
    
    // Load season progress (basic data from player status)
    this.playerService.getSeasonProgress(playerId, this.seasonDates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
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

    const range = SEASON_GAME_ACTION_RANGE;

    // Clientes na temporada: entregas distintas no intervalo fixo (GET `/game/actions?start&end`)
    this.userActionDashboard
      .getDeliveryCountInRange(playerId, range.start, range.end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (count: number) => {
          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              clientes: count
            };
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load clientes (entregas) count:', err);
        }
      });

    // Tarefas finalizadas na temporada: mesmo endpoint, intervalo fixo
    this.userActionDashboard
      .getActionsForPlayerDateRange(playerId, range.start, range.end)
      .pipe(
        map(items =>
          this.userActionDashboard.countFinalizadasInRange(items, range.start, range.end)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (count: number) => {
          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              tarefasFinalizadas: count
            };
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load tarefas finalizadas count:', err);
        }
      });

    // Metas do cartão de temporada: KPIs no intervalo fixo (não no mês do seletor)
    this.kpiService
      .getPlayerKPIsForDateRange(playerId, range.start, range.end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: kpis => {
          if (kpis != null) {
            this.updateMetasFromKPIs(kpis);
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load season metas KPIs:', err);
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
   * Carteira = lista de entregas (delivery) do jogador no mês, via GET /user-action.
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
    
    this.userActionDashboard
      .getCarteiraEnriched(playerId, this.selectedMonth)
      .pipe(
        switchMap(enrichedClientes => {
          const cnpjList = enrichedClientes.map(c => c.cnpj);
          if (cnpjList.length === 0) {
            return of(enrichedClientes);
          }
          return this.cnpjLookupService.enrichCnpjList(cnpjList).pipe(
            map(cnpjNames => {
              this.cnpjNameMap = cnpjNames;
              return enrichedClientes;
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes) => {
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
    
    this.kpiService.getPlayerKPIs(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (kpis) => {
          const baseKpis = kpis || [];
          this.playerKPIs = baseKpis;
          this.isLoadingKPIs = false;
          
          // Metas do cartão "Progresso da Temporada": loadSeasonProgressDetails (intervalo fixo).

          this.cdr.markForCheck();

          // Add billing KPI for Finance team members
          if (this.isFinanceTeamMember()) {
            this.injectFinanceBillingKpi(playerId);
          }
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

  private isFinanceTeamMember(): boolean {
    const teams = (this.sessaoProvider.usuario as any)?.teams;
    if (!teams || !Array.isArray(teams)) return false;
    return teams.some((t: any) => {
      if (typeof t === 'string') return t === GamificationDashboardComponent.FINANCE_TEAM_ID;
      if (t && typeof t === 'object') return t._id === GamificationDashboardComponent.FINANCE_TEAM_ID || t.id === GamificationDashboardComponent.FINANCE_TEAM_ID;
      return false;
    });
  }

  private injectFinanceBillingKpi(playerId: string): void {
    void playerId;
    // Sempre refetch Omie ao montar KPIs (evita KPI antigo após mudança de mês / recarga).
    this.playerKPIs = this.playerKPIs.filter(k => k.id !== 'valor-concedido');

    this.financeiroOmieRecebiveisService
      .getValorConcedidoFinanceiro(GamificationDashboardComponent.FINANCE_TEAM_ID, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (currentBilling) => {
          this.systemParamsService
            .getParam<number>('financeiro_monthly_billing_goal' as any)
            .then(goal => {
              const safeCurrent = typeof currentBilling === 'number' && isFinite(currentBilling) ? currentBilling : 0;
              const target = typeof goal === 'number' && goal > 0 ? goal : 0;
              const superTarget = target > 0 ? Math.ceil(target * 1.5) : undefined;

              const billingKpi: KPIData = {
                id: 'valor-concedido',
                label: 'Valor concedido',
                current: safeCurrent,
                target,
                superTarget,
                unit: 'R$',
                color: target > 0 && superTarget != null
                  ? (safeCurrent >= superTarget ? 'green' : safeCurrent >= target ? 'yellow' : 'red')
                  : 'red',
                percentage: target > 0 ? Math.round((safeCurrent / target) * 100) : 0
              };

              this.playerKPIs = [...this.playerKPIs, billingKpi];
              this.cdr.markForCheck();
            })
            .catch(() => {
              // Even without goal, we can still show the current billing.
              const safeCurrent = typeof currentBilling === 'number' && isFinite(currentBilling) ? currentBilling : 0;
              const billingKpi: KPIData = {
                id: 'valor-concedido',
                label: 'Valor concedido',
                current: safeCurrent,
                target: 0,
                unit: 'R$',
                color: 'red',
                percentage: 0
              };
              this.playerKPIs = [...this.playerKPIs, billingKpi];
              this.cdr.markForCheck();
            });
        },
        error: () => {
          // Silent failure: don't block KPI rendering.
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
  }
  
  /**
   * Atividades / pontos do mês: GET /user-action. Processos: continua no action_log.
   */
  private loadProgressData(): void {
    this.isLoadingProgress = true;
    
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
      console.warn('📊 No player ID available for progress data');
      this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
      this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
      this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
      this.isLoadingProgress = false;
      this.cdr.markForCheck();
      return;
    }

    forkJoin({
      items: this.userActionDashboard.getActions(playerId),
      processo: this.actionLogService.getProcessMetrics(playerId, this.selectedMonth)
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ items, processo }) => {
          this.activityMetrics = this.userActionDashboard.getActivityMetricsFromActions(
            items,
            this.selectedMonth
          );
          this.monthlyPointsBreakdown = this.userActionDashboard.getMonthlyPointsBreakdownFromActions(
            items,
            this.selectedMonth
          );
          this.processMetrics = processo;
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load progress metrics:', error);
          this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
          this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Handle month change event from c4u-seletor-mes (primeiro dia do mês).
   */
  onMonthChange(monthDate: Date): void {
    const d = monthDate instanceof Date ? monthDate : new Date(monthDate);
    this.selectedMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    this.carteiraClienteSearchTerm = '';
    const monthName = this.selectedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    this.announceToScreenReader(`Mês alterado para ${monthName}`);
    this.loadDashboardData();
  }

  get filteredCarteiraClientes(): CompanyDisplay[] {
    return filterCompanyDisplaysByClienteSearch(
      this.carteiraClientes,
      this.carteiraClienteSearchTerm,
      cnpj => this.getCompanyDisplayName(cnpj)
    );
  }

  onCarteiraClienteSearchInput(event: Event): void {
    this.carteiraClienteSearchTerm = (event.target as HTMLInputElement).value ?? '';
    this.cdr.markForCheck();
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
   * GET `{backend_url_base}/action` com header `client_id` (e Bearer via interceptor).
   */
  fetchBackendActions(): void {
    const base = environment.backend_url_base?.trim();
    if (!base) {
      this.toastService.error('Configure backend_url_base no ambiente.');
      return;
    }
    this.isActionApiLoading = true;
    this.cdr.markForCheck();
    this.backendActionApiService
      .getActions()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isActionApiLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (body) => {
          console.log('GET /action response', body);
          this.toastService.success('GET /action concluído com sucesso.');
        },
        error: (err: unknown) => {
          let msg = 'Erro ao chamar GET /action';
          if (err instanceof HttpErrorResponse) {
            if (typeof err.error === 'string' && err.error.trim()) {
              msg = err.error;
            } else if (err.error && typeof err.error === 'object' && 'message' in err.error) {
              const m = (err.error as { message?: string }).message;
              if (m) msg = m;
            } else if (err.message) {
              msg = err.message;
            }
          }
          this.toastService.error(msg);
        }
      });
  }

  /**
   * Manual refresh mechanism
   */
  refreshData(): void {
    this.toastService.alert('Atualizando dados...');
    this.announceToScreenReader('Atualizando dados do painel');
    this.playerService.clearCache();
    this.userActionDashboard.clearCache();
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
   * Get enabled KPIs (excluding commented/disabled ones)
   * Currently excludes 'numero-empresas' (Clientes na Carteira)
   */
  get enabledKPIs(): KPIData[] {
    return this.playerKPIs;
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
    return displayName || cnpj;
  }

  /** Texto do contador na lista de clientes: singular/plural com "sua(s)". */
  formatClienteTasksLabel(actionCount: number): string {
    const n = Math.round(Number(actionCount)) || 0;
    if (n === 1) {
      return '1 tarefa sua';
    }
    return `${n} tarefas suas`;
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
