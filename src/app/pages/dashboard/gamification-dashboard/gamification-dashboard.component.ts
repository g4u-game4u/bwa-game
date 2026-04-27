import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject, of, forkJoin, from } from 'rxjs';
import { takeUntil, switchMap, map, catchError } from 'rxjs/operators';

import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { 
  PlayerStatus, 
  PointWallet, 
  SeasonProgress, 
  Company, 
  KPIData,
  ActivityMetrics,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { CompanyDisplay, CarteiraSupabaseKpiRow } from '@services/company-kpi.service';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';
import { ModalSeasonFaqComponent } from '@modals/modal-season-faq/modal-season-faq.component';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';

@Component({
  selector: 'app-gamification-dashboard',
  templateUrl: './gamification-dashboard.component.html',
  styleUrls: ['./gamification-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamificationDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private monthChange$ = new Subject<void>(); // Cancels in-flight month-dependent requests
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
  
  // Carteira: empresas do jogador (player + cnpj_performance) + hook gamificação para KPIs
  carteiraClientes: CompanyDisplay[] = [];
  isLoadingCarteira = true;
  cnpjNameMap = new Map<string, string>(); // Map of empid → clean empresa name from empid_cnpj__c

  // Clientes from cnpj_resp (empids) - Carteira tab
  cnpjRespIds: string[] = [];
  isLoadingClientes = true;
  
  // Status map from empid_cnpj__c (cnpj → status string like "Ativa")
  cnpjStatusMap = new Map<string, string>();
  // CNPJ number map from empid_cnpj__c (empid → actual CNPJ number)
  cnpjNumberMap = new Map<string, string>();
  
  // Clientes from cnpj (empids) - Participação tab
  participacaoClientes: CompanyDisplay[] = [];
  isLoadingParticipacao = true;
  
  /** Mantido para sync de KPI; UI sem abas — sempre visão participação. */
  clientesActiveTab: 'carteira' | 'participacao' = 'participacao';
  
  // Month selection
  selectedMonth: Date | undefined = new Date();
  
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
    private cacheManagerService: CacheManagerService,
    private route: ActivatedRoute,
    private router: Router,
    private ngbModal: NgbModal
  ) {
    // Start measuring render time
    this.endRenderMeasurement = this.performanceMonitor.measureRenderTime('GamificationDashboardComponent');
  }
  
  /**
   * Get current player ID from query params or use 'me' for Funifier API
   * 
   * Priority:
   * 1. Query parameter 'playerId' (when viewing another player's dashboard)
   * 2. 'me' for current authenticated user (uses faster player/me endpoint)
   * 
   * NOTE: We always use 'me' for the current user to leverage `/auth/user`
   * (sem GET …/player/…/status) no fluxo de dados do jogador.
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
    
    // Track if initial load has been done
    let initialLoadDone = false;
    
    // Listen for query param changes (when viewing different players)
    // This subscription emits immediately with current params, so we use it for initial load too
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const playerId = params['playerId'];
        if (initialLoadDone) {
          // Only reload if params changed after initial load
          console.log('📊 Player ID changed via query params:', playerId);
          this.loadDashboardData();
        } else {
          // First emission - do initial load
          console.log('🎮 Initial load with playerId:', playerId || '(none)');
          initialLoadDone = true;
          this.loadDashboardData();
        }
      });
    
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
    this.monthChange$.next();
    this.monthChange$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  /**
   * Load all dashboard data asynchronously
   * All data loads in parallel to avoid blocking the UI
   */
  loadDashboardData(): void {
    // Force fresh data on every dashboard load
    this.cacheManagerService.clearAllCaches();

    // Set refresh time immediately
    this.lastRefreshTime = new Date();
    
    // Load all data in parallel - UI will update as data arrives
    // This allows the page to render immediately while data loads
    this.loadPlayerData();
    this.loadCompanyData();
    this.loadClientesData();
    this.loadParticipacaoData();
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
    
    // Game4U: pontos da carteira vêm de `/game/stats` (action_stats.done). Sem Game4U: action_log × constante.
    console.log('📊 Starting point wallet...');
    forkJoin({
      wallet: this.playerService.getPlayerPoints(playerId, this.selectedMonth).pipe(
        catchError(err => {
          console.error('📊 Point wallet status error:', err);
          return of({ moedas: 0, bloqueados: 0, desbloqueados: 0 } as PointWallet);
        })
      ),
      pontosActionLog: this.actionLogService.getPontosForMonth(playerId, this.selectedMonth).pipe(
        catchError(err => {
          console.error('📊 Pontos action_log error:', err);
          return of(0);
        })
      )
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ wallet, pontosActionLog }) => {
          const fromStats = this.playerService.usesGame4uWalletFromStats();
          const desbloqueados = fromStats
            ? wallet.desbloqueados
            : Math.floor(Number(pontosActionLog) || 0);
          this.pointWallet = {
            ...wallet,
            desbloqueados
          };
          console.log('📊 Point wallet merged:', { bloqueados: wallet.bloqueados, desbloqueados, moedas: wallet.moedas, fromStats });
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load point wallet:', error);
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
   * - Tarefas finalizadas: Game4U = count `action_stats.done` (mesma chamada que `delivery_stats.total`);
   *   Funifier = action_log.
   * - `deliveryStatsTotal`: Game4U `/game/stats.delivery_stats.total` quando existir.
   */
  private loadSeasonProgressDetails(): void {
    const playerId = this.getPlayerId();
    if (!playerId) {
      return;
    }

    this.actionLogService
      .getSeasonProgressSidebarDetails(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ tarefasFinalizadas, deliveryStatsTotal }) => {
          console.log('📊 Season sidebar:', { tarefasFinalizadas, deliveryStatsTotal });
          if (this.seasonProgress) {
            const base = { ...this.seasonProgress, tarefasFinalizadas };
            if (deliveryStatsTotal !== undefined) {
              (base as SeasonProgress).deliveryStatsTotal = deliveryStatsTotal;
            } else {
              delete (base as SeasonProgress & { deliveryStatsTotal?: number }).deliveryStatsTotal;
            }
            this.seasonProgress = base;
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load season sidebar details:', err);
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
   * Carteira: empresas via `CompanyService` (sem Supabase), GET gamificação e cruzamento EmpID/CNPJ.
   */
  private loadClientesData(): void {
    this.isLoadingClientes = true;
    this.cnpjRespIds = [];
    this.carteiraClientes = [];
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();
    if (!playerId) {
      this.isLoadingClientes = false;
      this.syncClientesKpiWithTabs();
      this.cdr.markForCheck();
      return;
    }

    from(this.companyKpiService.fetchGamificacaoMapsAsync())
      .pipe(
        switchMap(maps =>
          this.companyService.getCompanies(playerId).pipe(
            map(companies => ({ maps, companies }))
          )
        ),
        map(({ maps, companies }) => {
          const cnpjs = companies.map(c => c.cnpj).filter(c => !!c && String(c).trim().length > 0);
          console.log('📊 Carteira CNPJs (player companies):', cnpjs.length);
          this.cnpjRespIds = cnpjs;

          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              clientes: cnpjs.length
            };
          }

          companies.forEach((c: Company) => {
            const key = (c.cnpj || '').trim();
            if (!key) return;
            this.cnpjNameMap.set(key, c.name || key);
            this.cnpjNumberMap.set(key, key);
          });

          if (cnpjs.length === 0) {
            return [] as CompanyDisplay[];
          }

          const carteiraRows: CarteiraSupabaseKpiRow[] = companies
            .filter(c => !!c.cnpj && String(c.cnpj).trim().length > 0)
            .map(c => ({
              cnpj: c.cnpj,
              empId: c.id
            }));

          return this.companyKpiService.enrichCarteiraRowsWithMaps(carteiraRows, maps);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes: CompanyDisplay[]) => {
          console.log('📊 Clientes enriched:', enrichedClientes);
          enrichedClientes.forEach(c => {
            const status = this.cnpjStatusMap.get(c.cnpj);
            if (status) c.status = status;
          });
          this.carteiraClientes = enrichedClientes;
          this.isLoadingClientes = false;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('📊 Failed to load clientes:', err);
          this.carteiraClientes = [];
          this.isLoadingClientes = false;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Clientes atendidos: CNPJs únicos com ações no mês do filtro (Funifier: action_log por data da ação;
   * Game4U: user-actions cuja competência em `delivery_id` cai nesse mês).
   * Enriquecimento de nome/status (empid_cnpj__c) + KPIs (cnpj__c / gamificação).
   */
  private loadParticipacaoData(): void {
    this.isLoadingParticipacao = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();
    if (!playerId) {
      this.isLoadingParticipacao = false;
      this.cdr.markForCheck();
      return;
    }

    this.actionLogService
      .getPlayerCnpjListWithCount(playerId, this.selectedMonth)
      .pipe(
        switchMap(items => {
          console.log('📊 Participação CNPJs (action_log):', items.length);
          const empids = items.map(i => i.cnpj).filter((c): c is string => !!c && String(c).trim().length > 0);
          const actionCountByCnpj = new Map(items.map(i => [i.cnpj, i.actionCount]));
          const deliveryTitleByKey = new Map<string, string>();
          for (const i of items) {
            const t = i.delivery_title?.trim();
            if (t) {
              deliveryTitleByKey.set(i.cnpj, t);
            }
          }

          if (empids.length === 0) {
            return of([] as CompanyDisplay[]);
          }

          return this.cnpjLookupService.enrichCnpjListFull(empids).pipe(
            switchMap(cnpjInfo => {
              cnpjInfo.forEach((info, key) => {
                this.cnpjNameMap.set(key, info.empresa);
                if (info.status) {
                  this.cnpjStatusMap.set(key, info.status);
                }
                if (info.cnpj) {
                  this.cnpjNumberMap.set(key, info.cnpj);
                }
              });
              return this.companyKpiService.enrichFromCnpjResp(empids).pipe(
                map(clientes =>
                  clientes.map(c => ({
                    ...c,
                    actionCount: actionCountByCnpj.get(c.cnpj) ?? c.actionCount,
                    delivery_title: deliveryTitleByKey.get(c.cnpj) ?? c.delivery_title
                  }))
                )
              );
            })
          );
        }),
        takeUntil(this.destroy$),
        takeUntil(this.monthChange$)
      )
      .subscribe({
        next: (enrichedClientes: CompanyDisplay[]) => {
          console.log('📊 Participação enriched:', enrichedClientes);
          // Attach status from the status map
          enrichedClientes.forEach(c => {
            const status = this.cnpjStatusMap.get(c.cnpj);
            if (status) c.status = status;
          });
          this.participacaoClientes = enrichedClientes;
          this.isLoadingParticipacao = false;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('📊 Failed to load participação:', err);
          this.participacaoClientes = [];
          this.isLoadingParticipacao = false;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Load KPI data
   */
  /**
   * Keeps the "numero-empresas" KPI in sync with the client list for the active Clientes tab
   * once that tab's data has finished loading (avoids overwriting API values while loading).
   */
  private syncClientesKpiWithTabs(): void {
    const tabLoading =
      this.clientesActiveTab === 'participacao' ? this.isLoadingParticipacao : this.isLoadingClientes;
    if (!tabLoading) {
      const idxEmpresas = this.playerKPIs.findIndex(k => k.id === 'numero-empresas');
      if (idxEmpresas !== -1) {
        const count =
          this.clientesActiveTab === 'participacao'
            ? this.participacaoClientes.length
            : this.carteiraClientes.length;

        const kpi = this.playerKPIs[idxEmpresas];
        const superTarget = kpi.superTarget ?? Math.ceil((kpi.target || 100) * 1.5);
        const updated: KPIData = {
          ...kpi,
          current: count,
          percentage: Math.min((count / superTarget) * 100, 100)
        };
        this.playerKPIs = this.playerKPIs.map((k, i) => (i === idxEmpresas ? updated : k));
      }
    }

    // Média da carteira: não depende da aba ativa, só do fim do load da carteira.
    this.syncEntregasPrazoKpiFromCarteira();
  }

  /**
   * KPI "entregas-prazo": média da % de entregas no prazo só das empresas da carteira (com dado válido).
   */
  private syncEntregasPrazoKpiFromCarteira(): void {
    const idx = this.playerKPIs.findIndex(k => k.id === 'entregas-prazo');
    if (idx === -1 || this.isLoadingClientes) {
      return;
    }

    const base = this.playerKPIs[idx];
    const values = this.carteiraClientes
      .map(c => this.getListaEntregaPercent(c))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (values.length === 0) {
      const updated: KPIData = {
        ...base,
        current: 0,
        percentage: 0,
        color: 'pink',
        isMissing: true
      };
      this.playerKPIs = this.playerKPIs.map((k, i) => (i === idx ? updated : k));
      if (this.seasonProgress) {
        this.updateMetasFromKPIs(this.playerKPIs);
      }
      return;
    }

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const target = base.target;
    const superTarget = base.superTarget ?? 100;
    const updated: KPIData = {
      ...base,
      current: Math.round(avg * 100) / 100,
      isMissing: false,
      percentage: Math.min(avg, 100),
      color: this.kpiService.getKPIColorByGoals(avg, target, superTarget)
    };
    this.playerKPIs = this.playerKPIs.map((k, i) => (i === idx ? updated : k));
    if (this.seasonProgress) {
      this.updateMetasFromKPIs(this.playerKPIs);
    }
  }

  private loadKPIData(): void {
    this.isLoadingKPIs = true;
    
    const playerId = this.getPlayerId();
    
    // Pass selectedMonth and actionLogService to getPlayerKPIs
    this.kpiService.getPlayerKPIs(playerId, this.selectedMonth, this.actionLogService)
      .pipe(takeUntil(this.destroy$), takeUntil(this.monthChange$))
      .subscribe({
        next: (kpis) => {
          console.log('📊 KPIs loaded:', kpis, `(${kpis?.length || 0} KPIs)`);
          this.playerKPIs = kpis || [];
          this.syncClientesKpiWithTabs();
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
    console.log('📊 loadProgressData called with selectedMonth:', this.selectedMonth?.toISOString() || 'undefined (toda temporada)');
    
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
      .pipe(takeUntil(this.destroy$), takeUntil(this.monthChange$))
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

    // Monthly points breakdown removed - bloqueados/desbloqueados no longer used
  }
  
  /**
   * Handle month change event from c4u-seletor-mes
   * @param monthsAgo - Number of months ago (0 = current month)
   */
  onMonthChange(monthsAgo: number): void {
    console.log('📊 onMonthChange called with monthsAgo:', monthsAgo);
    console.warn('⚠️ MONTH CHANGE:', monthsAgo); // Use warn so it's visible even with filters
    // Handle "Toda temporada" (-1) — undefined means no month filtering (season-wide)
    if (monthsAgo === -1) {
      this.selectedMonth = undefined;
      console.warn('⚠️ selectedMonth set to undefined (Toda temporada)');
      this.announceToScreenReader('Filtro alterado para toda temporada');
    } else {
      const date = new Date();
      date.setDate(1); // Set to 1st to avoid month rollover (e.g. March 30 → setMonth(1) = March 2)
      date.setMonth(date.getMonth() - monthsAgo);
      this.selectedMonth = date;
      console.warn('⚠️ selectedMonth set to:', date.toISOString());
      const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      this.announceToScreenReader(`Mês alterado para ${monthName}`);
    }

    // Reload month-scoped data: KPIs, progress metrics, participação, stats Game4U (`start`/`end` do mês).
    // Carteira de empresas (lista `companies`) e clientes permanecem.
    this.loadMonthDependentData();
  }

  /**
   * Load only data that depends on the selected month (KPIs, progress, participação via action_log).
   * Com Game4U, pontos/tarefas do cartão de temporada seguem o mês; sem Game4U, action_log.
   */
  private loadMonthDependentData(): void {
    // Cancel any in-flight month-dependent requests
    this.monthChange$.next();

    // Clear stale data immediately to prevent mismatched display
    this.activityMetrics = null;
    this.processMetrics = null;
    this.playerKPIs = [];

    // Show loading states immediately
    this.isLoadingKPIs = true;
    this.isLoadingProgress = true;
    this.isLoadingParticipacao = true;
    this.cdr.markForCheck();

    this.loadKPIData();
    this.loadProgressData();
    this.loadParticipacaoData();
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
    const companyName = this.getClienteAtendidoDisplayName(company);
    this.announceToScreenReader(`Abrindo detalhes de ${companyName}`);
  }

  /**
   * Handle company carteira detail modal close
   */
  onCompanyCarteiraDetailModalClosed(): void {
    const companyName = this.selectedCarteiraCompany
      ? this.getClienteAtendidoDisplayName(this.selectedCarteiraCompany)
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
   * Identificador Funifier para action_log: alinha a `getPlayerId()` (incl. query `playerId`) e evita divergência da lista Participação.
   */
  get actionLogUserIdForModals(): string {
    const id = this.getPlayerId();
    if (id === 'me') {
      const u = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
      return ((u?._id || u?.email || '') as string) || 'me';
    }
    return id;
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
   * Abre o modal de perguntas frequentes da temporada / painel.
   */
  abrirModalFaq(): void {
    this.ngbModal.open(ModalSeasonFaqComponent, { size: 'lg', scrollable: true });
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

  /** Sidebar recolhida: entregas no prazo só como % (média carteira). */
  kpiSidebarValue(kpi: KPIData): string {
    if (kpi.id === 'entregas-prazo' && kpi.unit === '%') {
      const n = Math.round(kpi.current * 100) / 100;
      const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
      return `${text}%`;
    }
    return `${this.roundValue(kpi.current)}${kpi.unit || ''}`;
  }

  kpiSidebarTitle(kpi: KPIData): string {
    if (kpi.id === 'entregas-prazo') {
      return `${kpi.label}: ${this.kpiSidebarValue(kpi)} (meta ${kpi.target}${kpi.unit || '%'})`;
    }
    return `${kpi.label}: ${this.roundValue(kpi.current)} / ${this.roundValue(kpi.target)}${kpi.unit ? ' ' + kpi.unit : ''}`;
  }

  /**
   * For "Clientes na Carteira", use seasonProgress.clientes (action_log count)
   * to compare against KPI target in circular progress.
   */
  getKpiCurrentValue(kpi: KPIData): number {
    if (kpi.id === 'numero-empresas') {
      return this.seasonProgress?.clientes ?? kpi.current;
    }
    return kpi.current;
  }

  /**
   * KPIs exibidos na barra lateral recolhida (sem "Clientes na Carteira", alinhado ao painel principal).
   */
  get enabledKPIs(): KPIData[] {
    return this.playerKPIs.filter(k => k.id !== 'numero-empresas');
  }

  /**
   * Circular “Pontos no mês”: com Game4U e `action_stats`, atingido = done.total_points;
   * meta = pending.total_points + done.total_points. Sem esses campos: fallback em `activityMetrics`.
   */
  get monthlyPointsProgressData(): { current: number; target: number } {
    const donePts = this.activityMetrics?.pontosDone;
    const allPts = this.activityMetrics?.pontosTodosStatus;
    if (donePts !== undefined && allPts !== undefined) {
      const current = Math.floor(donePts);
      const target = Math.max(Math.floor(allPts), 1);
      return { current, target };
    }
    const current = Math.floor(this.activityMetrics?.pontos ?? 0);
    const pendingTasks =
      (this.processMetrics?.pendentes ?? 0) + (this.processMetrics?.incompletas ?? 0);
    const target =
      pendingTasks > 0
        ? pendingTasks * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG
        : Math.max(current, 1);
    return { current, target };
  }

  get monthlyPointsGoalColor(): 'red' | 'yellow' | 'green' | 'pink' {
    const { current, target } = this.monthlyPointsProgressData;
    const superGoal = Math.ceil(target * 1.5);
    return this.kpiService.getKPIColorByGoals(current, target, superGoal);
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
    // Show current value instead of achievement percentage
    const current = Math.round(kpi.current);
    const unit = kpi.unit || '%';
    return `${current}${unit}`;
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

  /** Linha “Clientes atendidos” (Game4U): preferir título da entrega ao id. */
  getClienteAtendidoDisplayName(cliente: CompanyDisplay): string {
    const t = cliente.delivery_title?.trim();
    if (t) {
      return t;
    }
    return this.getCompanyDisplayName(cliente.cnpj) || cliente.cnpj;
  }

  /**
   * % entregas no prazo na lista (vem da API como `porcEntregas` → `entrega` / `deliveryKpi.current`).
   */
  getListaEntregaPercent(cliente: CompanyDisplay): number | null {
    if (cliente.entrega !== undefined && cliente.entrega !== null && Number.isFinite(Number(cliente.entrega))) {
      return Number(cliente.entrega);
    }
    const k = cliente.deliveryKpi?.current;
    if (k !== undefined && k !== null && Number.isFinite(Number(k))) {
      return Number(k);
    }
    return null;
  }

  /**
   * Get company status (Ativa/Inativa) from the status map
   */
  getCompanyStatus(cnpj: string): string {
    return this.cnpjStatusMap.get(cnpj) || '';
  }

  /**
   * Build hover tooltip text for a company showing _id, cnpj and status from empid_cnpj__c
   */
  getCompanyTooltip(empid: string): string {
    const name = this.cnpjNameMap.get(empid) || '';
    const cnpjNumber = this.cnpjNumberMap.get(empid) || '';
    const status = this.cnpjStatusMap.get(empid) || '';
    const parts = [`ID: ${empid}`];
    if (cnpjNumber) parts.push(`CNPJ: ${cnpjNumber}`);
    if (status) parts.push(`Status: ${status}`);
    return parts.join(' | ');
  }

  getClienteAtendidoTooltip(cliente: CompanyDisplay): string {
    const base = this.getCompanyTooltip(cliente.cnpj);
    const t = cliente.delivery_title?.trim();
    if (t) {
      return `${t} | ${base}`;
    }
    return base;
  }

  /**
   * Check if a company is active based on empid_cnpj__c status
   */
  isCompanyActive(cnpj: string): boolean {
    const status = this.cnpjStatusMap.get(cnpj);
    return status?.toLowerCase() === 'ativa';
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
