import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject, of, forkJoin, from, firstValueFrom } from 'rxjs';
import { takeUntil, switchMap, map, catchError, take, tap, finalize } from 'rxjs/operators';

import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { SeasonDatesService } from '@services/season-dates.service';
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
import {
  extractGamificacaoEmpIdFromDeliveryKey,
  extractEmpIdPrefixFromDeliveryIdFirstSegment
} from '@services/gamificacao-delivery-empid.util';

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

  /** Menu lateral: snapshot Game4U (carteira + totais temporada) ainda em curso. */
  sidebarGame4uSnapshotPending = false;
  /** Menu lateral Funifier: carteira de pontos a carregar. */
  sidebarWalletLoadPending = false;
  /** Menu lateral Funifier: `getSeasonProgressSidebarDetails` em curso. */
  sidebarSeasonDetailsPending = false;
  
  // Player data
  playerStatus: PlayerStatus | null = null;
  pointWallet: PointWallet | null = null;
  seasonProgress: SeasonProgress | null = null;

  /**
   * Reticências nos valores da carteira (pontos / moedas).
   * Funifier: alinhar ao «Progresso da temporada» — enquanto `getSeasonProgressSidebarDetails` corre,
   * a carteira também fica em pending (evita números “prontos” com temporada ainda a carregar).
   */
  get sidebarWalletPending(): boolean {
    if (this.playerService.usesGame4uWalletFromStats()) {
      return this.sidebarGame4uSnapshotPending;
    }
    return this.sidebarWalletLoadPending || this.sidebarSeasonDetailsPending;
  }

  /** Placeholder para exibir a carteira com reticências antes do primeiro snapshot da API. */
  readonly emptyPointWallet: PointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 };

  /** Reticências em «Clientes atendidos» e «Tarefas finalizadas» (e processos, se existir). */
  get sidebarSeasonStatsPending(): boolean {
    if (this.playerService.usesGame4uWalletFromStats()) {
      return this.sidebarGame4uSnapshotPending;
    }
    return this.sidebarSeasonDetailsPending;
  }

  get sessionPlayerName(): string {
    const u = this.sessaoProvider.usuario as
      | { full_name?: string; name?: string; email?: string }
      | null
      | undefined;
    const fullName = (u?.full_name || '').trim();
    if (fullName) return fullName;
    const name = (u?.name || '').trim();
    if (name) return name;
    const email = (u?.email || '').trim();
    if (email) return email;
    return '';
  }
  
  // KPI data
  playerKPIs: KPIData[] = [];
  /** Placeholders visuais enquanto `getPlayerKPIs` não retorna (cartões com reticências animadas). */
  readonly kpiLoadingSlots: readonly number[] = [0, 1];
  
  // Activity and Process data
  activityMetrics: ActivityMetrics | null = null;
  processMetrics: ProcessMetrics | null = null;
  monthlyPointsBreakdown: { bloqueados: number; desbloqueados: number } | null = null;
  /** Meta do circular de pontos (`GET /game/reports/goal/month/summary`). */
  monthlyPointsGoalTarget: number | null = null;
  isLoadingMonthlyGoal = false;
  
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
  /** true enquanto GET /gamificação + cruzamento (enrichFromCnpjResp) ainda não aplicaram porcEntregas na lista. */
  isLoadingParticipacaoKpi = false;
  /** Contador do título: Game4U `deliveries_count` de `/game/reports/finished/summary` (mês selecionado). */
  clientesAtendidosThisMonthCount: number | null = null;
  isLoadingClientesAtendidosCount = false;
  isLoadingParticipacaoMore = false;
  participacaoHasMore = false;
  private participacaoNextOffset = 0;
  private participacaoTotal?: number;
  private readonly participacaoPageLimit = 30;
  private useParticipacaoReportsPagination = false;
  /** Invalida merges de KPI em voo quando o mês muda ou um novo load de participação começa. */
  private participacaoKpiLoadGen = 0;
  
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

  /** Intervalo da campanha ativa (GET /campaign via {@link SeasonDatesService}). */
  private seasonDates: { start: Date; end: Date } = (() => {
    const y = new Date().getFullYear();
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 999)
    };
  })();

  /** Ajusta `selectedMonth` à campanha só na primeira carga do painel. */
  private initialSeasonMonthApplied = false;

  // Accessibility properties
  screenReaderAnnouncement = '';
  private focusedElementBeforeModal: HTMLElement | null = null;
  
  constructor(
    private playerService: PlayerService,
    private kpiService: KPIService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private performanceMonitor: PerformanceMonitorService,
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
    private sessaoProvider: SessaoProvider,
    private cacheManagerService: CacheManagerService,
    private seasonDatesService: SeasonDatesService,
    private route: ActivatedRoute,
    private router: Router,
    private ngbModal: NgbModal
  ) {
    // Start measuring render time
    this.endRenderMeasurement = this.performanceMonitor.measureRenderTime('GamificationDashboardComponent');
  }
  
  /**
   * Identificador do jogador para action_log, empresas e agregados Funifier (email / `_id` / query).
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
    
    
    return 'me';
  }

  ngOnInit(): void {
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
          this.loadDashboardData();
        } else {
          // First emission - do initial load
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
   * Load all dashboard data asynchronously.
   * Game4U: dados agregados vêm de `GET /game/reports/*` (ex.: `finished/summary`, `goal/month/summary`, `user-actions`);
   * não se usa `GET /game/stats` nem `GET /game/actions` neste painel.
   */
  loadDashboardData(): void {
    // Force fresh data on every dashboard load
    this.cacheManagerService.clearAllCaches();

    // Set refresh time immediately
    this.lastRefreshTime = new Date();
    // GET `/gamificacao` em paralelo (não esperar datas da temporada); enrich reutiliza o snapshot.
    this.companyKpiService.prefetchGamificacaoSnapshot();

    from(this.seasonDatesService.getSeasonDates()).pipe(
      take(1),
      takeUntil(this.destroy$),
      catchError(() => of(this.buildFallbackSeasonDates()))
    ).subscribe(dates => {
      this.seasonDates = dates;
      if (!this.initialSeasonMonthApplied) {
        this.applyInitialSelectedMonthWithinSeason();
        this.initialSeasonMonthApplied = true;
      }
      this.loadPlayerData();
      this.loadCompanyData();
      this.loadClientesData();
      this.loadParticipacaoData();
      this.loadKPIData();
      this.loadProgressData();
    });
  }

  private buildFallbackSeasonDates(): { start: Date; end: Date } {
    const y = new Date().getFullYear();
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 999)
    };
  }

  /** Primeiro dia do mês corrente, limitado ao intervalo da campanha. */
  private applyInitialSelectedMonthWithinSeason(): void {
    const now = new Date();
    let m = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const s = new Date(
      this.seasonDates.start.getFullYear(),
      this.seasonDates.start.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const endCap = new Date(
      this.seasonDates.end.getFullYear(),
      this.seasonDates.end.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    if (m.getTime() < s.getTime()) {
      m = new Date(s);
    }
    if (m.getTime() > endCap.getTime()) {
      m = new Date(endCap);
    }
    this.selectedMonth = m;
  }
  
  /**
   * Load player status, points, and season progress
   */
  private loadPlayerData(): void {
    this.isLoadingPlayer = true;
    this.cdr.markForCheck();
    
    const playerId = this.getPlayerId();
    
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
          this.isLoadingPlayer = false;
          this.cdr.markForCheck();
        },
        complete: () => {
          console.log('📊 Player status request completed');
          clearTimeout(loadingTimeout);
        }
      });
    
    // Game4U: `GET /game/reports/finished/summary` (temporada) alimenta carteira + sidebar (sem `/game/stats`/`/game/actions`).
    const usesGame4uWallet = this.playerService.usesGame4uWalletFromStats();
    if (usesGame4uWallet) {
      this.sidebarGame4uSnapshotPending = true;
      this.cdr.markForCheck();
      this.actionLogService
        // Carteira/season sidebar devem refletir a campanha inteira (start/end de /campaign),
        // não o mês do filtro do painel.
        .getMonthlyGame4uPlayerDashboardData(playerId, undefined)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ({ wallet, sidebar }) => {
            this.sidebarGame4uSnapshotPending = false;
            this.pointWallet = {
              ...wallet,
              desbloqueados: wallet.desbloqueados
            };
            if (this.seasonProgress) {
              const base = { ...this.seasonProgress, tarefasFinalizadas: sidebar.tarefasFinalizadas };
              if (sidebar.deliveryStatsTotal !== undefined) {
                (base as SeasonProgress).deliveryStatsTotal = sidebar.deliveryStatsTotal;
              } else {
                delete (base as SeasonProgress & { deliveryStatsTotal?: number }).deliveryStatsTotal;
              }
              this.seasonProgress = base;
            }
            this.cdr.markForCheck();
          },
          error: (error: unknown) => {
            console.error('📊 Failed to load Game4U dashboard snapshot:', error);
            this.sidebarGame4uSnapshotPending = false;
            this.pointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 };
            this.cdr.markForCheck();
          },
          complete: () => {
          }
        });
    } else {
      this.sidebarWalletLoadPending = true;
      this.cdr.markForCheck();
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
            this.sidebarWalletLoadPending = false;
            const desbloqueados = Math.floor(Number(pontosActionLog) || 0);
            this.pointWallet = {
              ...wallet,
              desbloqueados
            };
            this.cdr.markForCheck();
          },
          error: (error) => {
            console.error('📊 Failed to load point wallet:', error);
            this.sidebarWalletLoadPending = false;
            this.pointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 };
            this.cdr.markForCheck();
          },
          complete: () => {
            console.log('📊 Point wallet request completed');
          }
        });
    }
    
    // Load season progress (basic data from player status)
    this.playerService.getSeasonProgress(playerId, this.seasonDates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          this.seasonProgress = progress;
          this.cdr.markForCheck();
          if (!this.playerService.usesGame4uWalletFromStats()) {
            this.loadSeasonProgressDetails();
          }
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
   * - `deliveryStatsTotal`: Game4U `deliveries_count` no relatório `finished/summary` quando existir.
   */
  private loadSeasonProgressDetails(): void {
    const playerId = this.getPlayerId();
    if (!playerId) {
      return;
    }

    this.sidebarSeasonDetailsPending = true;
    this.cdr.markForCheck();
    this.actionLogService
      .getSeasonProgressSidebarDetails(playerId, this.selectedMonth)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.sidebarSeasonDetailsPending = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ tarefasFinalizadas, deliveryStatsTotal }) => {
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
   * Lista legada `companies` (cnpj_performance) removida; mantém estado vazio.
   */
  private loadCompanyData(): void {
    this.companies = [];
    this.isLoadingCompanies = false;
    this.cdr.markForCheck();
  }

  /**
   * Carteira: `playerService.getPlayerCnpjResp` + nomes (`enrichCnpjListFull`) + GET gamificação e cruzamento EmpID/CNPJ.
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

    this.playerService
      .getPlayerCnpjResp(playerId)
      .pipe(
        switchMap(empids => {
          const ids = empids.map(e => String(e).trim()).filter(Boolean);
          this.cnpjRespIds = ids;

          if (ids.length === 0) {
            if (this.seasonProgress) {
              this.seasonProgress = { ...this.seasonProgress, clientes: 0 };
            }
            return of([] as CompanyDisplay[]);
          }

          return this.cnpjLookupService.enrichCnpjListFull(ids).pipe(
            tap(info => {
              info.forEach((detail, key) => {
                this.cnpjNameMap.set(key, detail.empresa);
                if (detail.status) {
                  this.cnpjStatusMap.set(key, detail.status);
                }
                if (detail.cnpj) {
                  this.cnpjNumberMap.set(key, detail.cnpj);
                }
              });
            }),
            switchMap(() =>
              from(this.companyKpiService.fetchGamificacaoMapsAsync()).pipe(
                map(maps => {
                  if (this.seasonProgress) {
                    this.seasonProgress = { ...this.seasonProgress, clientes: ids.length };
                  }
                  const carteiraRows: CarteiraSupabaseKpiRow[] = ids.map(id => ({
                    cnpj: id,
                    empId: id
                  }));
                  return this.companyKpiService.enrichCarteiraRowsWithMaps(carteiraRows, maps);
                })
              )
            )
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes: CompanyDisplay[]) => {
          enrichedClientes.forEach(c => {
            const status = this.cnpjStatusMap.get(c.cnpj);
            if (status) {
              c.status = status;
            }
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
   * Lista base (nome/status/contagens) primeiro; `porcEntregas` só após GET gamificação + cruzamento — ver
   * {@link applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync}.
   */
  private loadParticipacaoData(): void {
    this.isLoadingParticipacao = true;
    this.isLoadingParticipacaoKpi = false;
    this.isLoadingParticipacaoMore = false;
    this.participacaoHasMore = false;
    this.participacaoNextOffset = 0;
    this.participacaoTotal = undefined;
    this.useParticipacaoReportsPagination = false;
    const loadGen = ++this.participacaoKpiLoadGen;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();
    if (!playerId) {
      this.isLoadingParticipacao = false;
      this.participacaoClientes = [];
      this.cdr.markForCheck();
      return;
    }

    this.loadParticipacaoFirstPageOrFallback(playerId, loadGen);
  }

  get showParticipacaoLoadMoreButton(): boolean {
    return (
      this.useParticipacaoReportsPagination &&
      !this.isLoadingParticipacao &&
      !this.isLoadingParticipacaoMore &&
      this.participacaoHasMore &&
      this.participacaoClientes.length > 0
    );
  }

  loadMoreParticipacao(): void {
    if (
      !this.useParticipacaoReportsPagination ||
      this.isLoadingParticipacao ||
      this.isLoadingParticipacaoMore ||
      !this.participacaoHasMore
    ) {
      return;
    }
    const playerId = this.getPlayerId();
    if (!playerId) {
      return;
    }
    this.isLoadingParticipacaoMore = true;
    const loadGen = this.participacaoKpiLoadGen;
    this.cdr.markForCheck();

    this.actionLogService
      .getPlayerFinishedDeliveriesParticipacaoPage(
        playerId,
        this.selectedMonth,
        this.participacaoNextOffset,
        this.participacaoPageLimit
      )
      .pipe(takeUntil(this.destroy$), takeUntil(this.monthChange$))
      .subscribe({
        next: async page => {
          try {
            const appended = (page.items || []).map(i => ({
              cnpj: i.cnpj,
              cnpjId: i.cnpj,
              actionCount: i.actionCount ?? 0,
              processCount: 0,
              delivery_title: i.delivery_title,
              ...(i.deliveryId?.trim() ? { deliveryId: i.deliveryId.trim() } : {}),
              loadTasksViaGameReports: true
            })) as CompanyDisplay[];

            const merged = this.dedupeParticipacaoClientes([...this.participacaoClientes, ...appended]);
            this.participacaoClientes = merged;

            const received = page.items?.length ?? 0;
            const total = page.total;
            if (typeof total === 'number' && Number.isFinite(total)) {
              this.participacaoTotal = total;
            }
            this.participacaoNextOffset += received;
            const fullPage = received >= this.participacaoPageLimit;
            const knownTotal = this.participacaoTotal;
            this.participacaoHasMore =
              fullPage && (knownTotal == null || this.participacaoNextOffset < knownTotal);

            this.isLoadingParticipacaoKpi = merged.length > 0;
            this.syncClientesKpiWithTabs();
            this.cdr.markForCheck();

            if (merged.length > 0) {
              await this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(merged, loadGen);
            }
          } catch (err) {
            console.error('📊 Falha ao aplicar KPI após carregar mais participação:', err);
          } finally {
            this.isLoadingParticipacaoMore = false;
            this.cdr.markForCheck();
          }
        },
        error: err => {
          console.error('📊 Failed to load more participação:', err);
          this.isLoadingParticipacaoMore = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadParticipacaoFirstPageOrFallback(playerId: string, loadGen: number): void {
    const pageLimit = this.participacaoPageLimit;
    this.actionLogService
      .getPlayerFinishedDeliveriesParticipacaoPage(playerId, this.selectedMonth, 0, pageLimit)
      .pipe(
        switchMap(page => {
          if (page.items?.length) {
            this.useParticipacaoReportsPagination = true;
            const baseClientes: CompanyDisplay[] = page.items.map(i => ({
              cnpj: i.cnpj,
              cnpjId: i.cnpj,
              actionCount: i.actionCount ?? 0,
              processCount: 0,
              delivery_title: i.delivery_title,
              ...(i.deliveryId?.trim() ? { deliveryId: i.deliveryId.trim() } : {}),
              loadTasksViaGameReports: true
            }));
            const received = page.items.length;
            if (typeof page.total === 'number' && Number.isFinite(page.total)) {
              this.participacaoTotal = page.total;
            }
            this.participacaoNextOffset = received;
            const fullPage = received >= pageLimit;
            const knownTotal = this.participacaoTotal;
            this.participacaoHasMore = fullPage && (knownTotal == null || this.participacaoNextOffset < knownTotal);
            return of({ empids: [] as string[], baseClientes, skipKpi: false as const });
          }
          // Fallback: comportamento legado (sem paginação / backend sem suporte)
          return this.actionLogService.getPlayerCnpjListWithCount(playerId, this.selectedMonth).pipe(
            switchMap(items => {
              const empids = items.map(i => i.cnpj).filter((c): c is string => !!c && String(c).trim().length > 0);
              const actionCountByCnpj = new Map(items.map(i => [i.cnpj, i.actionCount]));
              const deliveryTitleByKey = new Map<string, string>();
              const deliveryIdByCnpj = new Map<string, string>();
              const deliveryExtraCnpjByKey = new Map<string, string>();
              for (const i of items) {
                const t = i.delivery_title?.trim();
                if (t) {
                  deliveryTitleByKey.set(i.cnpj, t);
                }
                const d = i.deliveryId?.trim();
                if (d) {
                  deliveryIdByCnpj.set(i.cnpj, d);
                }
                const ec = i.delivery_extra_cnpj?.trim();
                if (ec) {
                  deliveryExtraCnpjByKey.set(i.cnpj, ec);
                }
              }

              if (empids.length === 0) {
                return of({
                  empids: [] as string[],
                  baseClientes: [] as CompanyDisplay[],
                  skipKpi: true as const
                });
              }

              return this.cnpjLookupService.enrichCnpjListFull(empids).pipe(
                map(cnpjInfo => {
                  cnpjInfo.forEach((info, key) => {
                    this.cnpjNameMap.set(key, info.empresa);
                    if (info.status) {
                      this.cnpjStatusMap.set(key, info.status);
                    }
                    if (info.cnpj) {
                      this.cnpjNumberMap.set(key, info.cnpj);
                    }
                  });
                  const baseClientes = this.buildParticipacaoBaseClientes(
                    empids,
                    actionCountByCnpj,
                    deliveryTitleByKey,
                    deliveryIdByCnpj,
                    deliveryExtraCnpjByKey
                  );
                  return { empids, baseClientes, skipKpi: false as const };
                })
              );
            })
          );
        }),
        takeUntil(this.destroy$),
        takeUntil(this.monthChange$)
      )
      .subscribe({
        next: ({ baseClientes, skipKpi }) => {
          const uniqueBase = this.dedupeParticipacaoClientes(baseClientes);
          uniqueBase.forEach(c => {
            const status = this.cnpjStatusMap.get(c.cnpj);
            if (status) {
              c.status = status;
            }
          });
          this.participacaoClientes = uniqueBase;
          this.isLoadingParticipacao = false;
          this.isLoadingParticipacaoKpi = !skipKpi && uniqueBase.length > 0;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();

          if (!skipKpi && uniqueBase.length > 0) {
            void this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(uniqueBase, loadGen).catch(
              (err: unknown) => {
                console.error('📊 Falha ao aplicar KPI de entregas (gamificação):', err);
              }
            );
          }
        },
        error: (err: Error) => {
          console.error('📊 Failed to load participação:', err);
          this.participacaoClientes = [];
          this.isLoadingParticipacao = false;
          this.isLoadingParticipacaoKpi = false;
          this.isLoadingParticipacaoMore = false;
          this.participacaoHasMore = false;
          this.syncClientesKpiWithTabs();
          this.cdr.markForCheck();
        }
      });
  }

  private buildParticipacaoBaseClientes(
    empids: string[],
    actionCountByCnpj: Map<string, number>,
    deliveryTitleByKey: Map<string, string>,
    deliveryIdByCnpj: Map<string, string>,
    deliveryExtraCnpjByKey: Map<string, string>
  ): CompanyDisplay[] {
    return empids.map(key => {
      const k = String(key).trim();
      const row: CompanyDisplay = {
        cnpj: k,
        cnpjId: k,
        actionCount: actionCountByCnpj.get(k) ?? 0,
        processCount: 0
      };
      const t = deliveryTitleByKey.get(k)?.trim();
      if (t) {
        row.delivery_title = t;
      }
      const d = deliveryIdByCnpj.get(k)?.trim();
      if (d) {
        row.deliveryId = d;
      }
      const ec = deliveryExtraCnpjByKey.get(k)?.trim();
      if (ec) {
        row.delivery_extra_cnpj = ec;
      }
      return row;
    });
  }

  /**
   * Um cliente distinto: EmpID (prefixo de `delivery_id`), senão CNPJ 14 dígitos, senão chave da linha.
   * Evita repetir a mesma empresa quando o back devolve várias entregas/competências do mesmo EmpID.
   */
  private participacaoClienteDistinctKey(c: CompanyDisplay): string {
    const did = c.deliveryId?.trim();
    if (did) {
      const emp =
        extractGamificacaoEmpIdFromDeliveryKey(did) ?? extractEmpIdPrefixFromDeliveryIdFirstSegment(did);
      if (emp) {
        return `emp:${emp}`;
      }
    }
    const digits =
      String(c.cnpjNumber ?? '')
        .replace(/\D/g, '')
        .trim() ||
      String(c.delivery_extra_cnpj ?? '')
        .replace(/\D/g, '')
        .trim() ||
      String(this.cnpjNumberMap.get(c.cnpj) ?? '')
        .replace(/\D/g, '')
        .trim();
    if (digits.length === 14) {
      return `cnpj:${digits}`;
    }
    return `row:${String(c.cnpj || '').trim()}`;
  }

  private mergeParticipacaoClienteRows(keep: CompanyDisplay, add: CompanyDisplay): CompanyDisplay {
    return {
      ...keep,
      actionCount: (keep.actionCount ?? 0) + (add.actionCount ?? 0),
      processCount: Math.max(keep.processCount ?? 0, add.processCount ?? 0),
      delivery_title: keep.delivery_title?.trim() || add.delivery_title?.trim() || keep.delivery_title,
      deliveryId: keep.deliveryId?.trim() || add.deliveryId?.trim() || keep.deliveryId,
      delivery_extra_cnpj: keep.delivery_extra_cnpj?.trim() || add.delivery_extra_cnpj?.trim() || keep.delivery_extra_cnpj,
      cnpjNumber: keep.cnpjNumber || add.cnpjNumber,
      loadTasksViaGameReports: keep.loadTasksViaGameReports ?? add.loadTasksViaGameReports,
      porcEntregas: keep.porcEntregas ?? add.porcEntregas,
      entrega: keep.entrega ?? add.entrega,
      deliveryKpi: keep.deliveryKpi ?? add.deliveryKpi,
      classificacao: keep.classificacao ?? add.classificacao,
      gamificacaoEmpIdUsado: keep.gamificacaoEmpIdUsado ?? add.gamificacaoEmpIdUsado
    };
  }

  /** Lista «Clientes atendidos»: uma linha por empresa (EmpID/CNPJ), somando contagens. */
  private dedupeParticipacaoClientes(rows: CompanyDisplay[]): CompanyDisplay[] {
    if (rows.length <= 1) {
      return rows;
    }
    const byKey = new Map<string, CompanyDisplay>();
    for (const c of rows) {
      const key = this.participacaoClienteDistinctKey(c);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...c });
      } else {
        byKey.set(key, this.mergeParticipacaoClienteRows(prev, c));
      }
    }
    return Array.from(byKey.values());
  }

  /**
   * Aguarda o GET da API de gamificação e o cruzamento EmpID/CNPJ/`delivery_id` em
   * {@link CompanyKpiService.enrichFromParticipacaoRowKeys}; só então aplica `porcEntregas` (entrega / deliveryKpi)
   * na lista já montada.
   */
  private async applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(
    baseClientes: CompanyDisplay[],
    loadGen: number
  ): Promise<void> {
    if (baseClientes.length === 0) {
      if (loadGen === this.participacaoKpiLoadGen) {
        this.isLoadingParticipacaoKpi = false;
        this.syncClientesKpiWithTabs();
        this.cdr.markForCheck();
      }
      return;
    }

    const participacaoGamificacaoRows = baseClientes.map(b => ({
      participationKey: b.cnpj,
      deliveryId: b.deliveryId,
      deliveryTitle: b.delivery_title
    }));

    try {
      const kpiRows = await firstValueFrom(
        this.companyKpiService.enrichFromParticipacaoRowKeys(participacaoGamificacaoRows).pipe(take(1))
      );
      if (loadGen !== this.participacaoKpiLoadGen) {
        return;
      }

      const merged = baseClientes.map((base, i) => {
        const k = kpiRows[i];
        if (!k) {
          return { ...base };
        }
        const cnpjNum = k.cnpjNumber ?? base.cnpjNumber;
        return {
          ...base,
          processCount: k.processCount,
          classificacao: k.classificacao,
          entrega: k.entrega,
          porcEntregas: k.porcEntregas,
          deliveryKpi: k.deliveryKpi,
          ...(cnpjNum ? { cnpjNumber: cnpjNum } : {}),
          ...(k.gamificacaoEmpIdUsado ? { gamificacaoEmpIdUsado: k.gamificacaoEmpIdUsado } : {})
        };
      });
      merged.forEach(c => {
        const status = this.cnpjStatusMap.get(c.cnpj);
        if (status) {
          c.status = status;
        }
      });
      this.participacaoClientes = this.dedupeParticipacaoClientes(merged);
      /** Antes do sync: `syncEntregasPrazoKpiFromParticipacao` ignora enquanto `isLoadingParticipacaoKpi` é true. */
      this.isLoadingParticipacaoKpi = false;
      this.syncClientesKpiWithTabs();
      this.cdr.markForCheck();
    } catch (err: unknown) {
      console.error('📊 Erro ao enriquecer participação com gamificação:', err);
      if (loadGen === this.participacaoKpiLoadGen) {
        this.participacaoClientes = baseClientes.map(b => ({ ...b }));
        this.isLoadingParticipacaoKpi = false;
        this.syncClientesKpiWithTabs();
        this.cdr.markForCheck();
      }
    } finally {
      if (loadGen === this.participacaoKpiLoadGen) {
        this.isLoadingParticipacaoKpi = false;
        this.cdr.markForCheck();
      }
    }
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

    // Média de % entregas no prazo: mesma base da lista «Clientes atendidos este mês» (participação + gamificação).
    this.syncEntregasPrazoKpiFromParticipacao();
  }

  /**
   * KPI "entregas-prazo": média das % (`porcEntregas`) dos clientes atendidos no mês/período do filtro,
   * alinhada à lista de participação (só após gamificação quando aplicável).
   */
  private syncEntregasPrazoKpiFromParticipacao(): void {
    const idx = this.playerKPIs.findIndex(k => k.id === 'entregas-prazo');
    if (idx === -1 || this.isLoadingParticipacao || this.isLoadingParticipacaoKpi) {
      return;
    }

    const base = this.playerKPIs[idx];
    const avg = this.getEntregasPrazoPercentFromParticipacao();

    if (avg === null) {
      const updated: KPIData = {
        ...base,
        current: 0,
        percentage: 0,
        color: 'gray',
        isMissing: true
      };
      this.playerKPIs = this.playerKPIs.map((k, i) => (i === idx ? updated : k));
      if (this.seasonProgress) {
        this.updateMetasFromKPIs(this.playerKPIs);
      }
      return;
    }

    const target = base.target;
    const superTarget = base.superTarget ?? 100;
    const updated: KPIData = {
      ...base,
      current: avg,
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
          // Usar `playerKPIs` após sync (média «entregas no prazo» vem da participação + `/gamificacao`).
          if (kpis !== null && kpis !== undefined) {
            this.updateMetasFromKPIs(this.playerKPIs);
          } else {
            console.log('📊 KPIs is null/undefined, skipping metas update to preserve existing values');
          }
          
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load KPIs:', error);
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
    const metasAchieved = kpis
      ? kpis.filter(kpi => this.getKpiCurrentValue(kpi) >= kpi.target).length
      : 0;
    
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
    this.isLoadingMonthlyGoal = true;
    this.monthlyPointsGoalTarget = null;
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
      this.isLoadingMonthlyGoal = false;
      this.cdr.markForCheck();
      return;
    }

    const month = this.selectedMonth;
    const goal$ =
      month != null && this.playerService.usesGame4uWalletFromStats()
        ? this.actionLogService.getMonthlyPointsGoalTarget(playerId, month)
        : of(null);

    forkJoin({
      metrics: this.actionLogService.getProgressMetrics(playerId, month, {
        gamificationDashboardReportsOnly: true
      }),
      goalPoints: goal$
    })
      .pipe(takeUntil(this.destroy$), takeUntil(this.monthChange$))
      .subscribe({
        next: ({ metrics, goalPoints }) => {
          this.activityMetrics = metrics.activity;
          this.processMetrics = metrics.processo;
          const g = goalPoints != null ? Math.floor(Number(goalPoints) || 0) : 0;
          this.monthlyPointsGoalTarget = g > 0 ? g : null;
          this.isLoadingProgress = false;
          this.isLoadingMonthlyGoal = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('📊 Failed to load progress metrics:', error);
          // Use default values on error
          this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
          this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
          this.monthlyPointsGoalTarget = null;
          this.isLoadingProgress = false;
          this.isLoadingMonthlyGoal = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Handle month change event from c4u-seletor-mes
   * @param monthsAgo - Number of months ago (0 = current month)
   */
  onMonthChange(monthsAgo: number): void {
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
    this.monthlyPointsGoalTarget = null;
    this.playerKPIs = [];

    // Show loading states immediately
    this.isLoadingKPIs = true;
    this.isLoadingProgress = true;
    this.isLoadingMonthlyGoal = true;
    this.isLoadingParticipacao = true;
    this.isLoadingParticipacaoKpi = false;
    this.isLoadingClientesAtendidosCount = true;
    this.cdr.markForCheck();

    this.companyKpiService.prefetchGamificacaoSnapshot();
    this.loadKPIData();
    this.loadProgressData();
    this.loadClientesAtendidosCountFromFinishedSummary();
    this.loadParticipacaoData();
  }

  private loadClientesAtendidosCountFromFinishedSummary(): void {
    const month = this.selectedMonth;
    if (month == null) {
      this.clientesAtendidosThisMonthCount = null;
      this.isLoadingClientesAtendidosCount = false;
      this.cdr.markForCheck();
      return;
    }

    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    if (!playerId) {
      this.clientesAtendidosThisMonthCount = null;
      this.isLoadingClientesAtendidosCount = false;
      this.cdr.markForCheck();
      return;
    }

    this.isLoadingClientesAtendidosCount = true;
    this.cdr.markForCheck();
    this.actionLogService
      .getSeasonProgressSidebarDetails(playerId, month)
      .pipe(takeUntil(this.destroy$), takeUntil(this.monthChange$))
      .subscribe({
        next: ({ deliveryStatsTotal }) => {
          this.clientesAtendidosThisMonthCount =
            typeof deliveryStatsTotal === 'number' && Number.isFinite(deliveryStatsTotal)
              ? Math.floor(deliveryStatsTotal)
              : null;
          this.isLoadingClientesAtendidosCount = false;
          this.cdr.markForCheck();
        },
        error: err => {
          console.error('📊 Failed to load clientes atendidos count (finished/summary):', err);
          this.clientesAtendidosThisMonthCount = null;
          this.isLoadingClientesAtendidosCount = false;
          this.cdr.markForCheck();
        }
      });
  }

  retryClientesAtendidosThisMonth(): void {
    // Recarrega contador (finished/summary) + lista (finished/deliveries / fallback)
    this.loadClientesAtendidosCountFromFinishedSummary();
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
    const companyName = this.getClienteAtendidoListTitle(company);
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
      case 'atividades-pendentes':
        this.progressModalType = 'atividades-pendentes';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de tarefas pendentes');
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

  /** Sidebar recolhida: entregas no prazo como % (média dos clientes atendidos no mês). */
  kpiSidebarValue(kpi: KPIData): string {
    if (kpi.id === 'entregas-prazo' && kpi.unit === '%') {
      const n = Math.round(this.getKpiCurrentValue(kpi) * 100) / 100;
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
   * For "Entregas no Prazo", use média de `porcEntregas` na lista «Clientes atendidos» quando disponível
   * (GET `/gamificacao` + cruzamento); senão perfil (`extra.entrega`).
   */
  getKpiCurrentValue(kpi: KPIData): number {
    if (kpi.id === 'numero-empresas') {
      return this.seasonProgress?.clientes ?? kpi.current;
    }
    if (kpi.id === 'entregas-prazo') {
      const fromParticipacao = this.getEntregasPrazoPercentFromParticipacao();
      if (fromParticipacao !== null) {
        return fromParticipacao;
      }
    }
    return kpi.current;
  }

  /**
   * Média dos percentuais (`porcEntregas` / espelhos) na lista de participação do mês,
   * após o enriquecimento com gamificação. `null` quando não há clientes ou nenhum valor válido.
   */
  getEntregasPrazoPercentFromParticipacao(): number | null {
    if (this.isLoadingParticipacao || this.participacaoClientes.length === 0) {
      return null;
    }
    if (this.isLoadingParticipacaoKpi) {
      return null;
    }
    const values = this.participacaoClientes
      .map(c => this.getListaEntregaPercent(c))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (values.length === 0) {
      return null;
    }
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  /** Circular «Entregas no Prazo»: aguarda cruzamento gamificação quando há clientes no mês. */
  isEntregasPrazoCircularPending(kpi: KPIData): boolean {
    return (
      kpi.id === 'entregas-prazo' &&
      !this.isLoadingParticipacao &&
      this.participacaoClientes.length > 0 &&
      this.isLoadingParticipacaoKpi
    );
  }

  /**
   * `isMissing` do anel: para entregas, deriva da lista (porcEntregas) em vez de só do perfil.
   */
  getKpiCircularIsMissing(kpi: KPIData): boolean {
    if (kpi.id !== 'entregas-prazo') {
      return !!kpi.isMissing;
    }
    if (this.isLoadingParticipacao || this.participacaoClientes.length === 0) {
      return !!kpi.isMissing;
    }
    if (this.isLoadingParticipacaoKpi) {
      return false;
    }
    return this.getEntregasPrazoPercentFromParticipacao() === null;
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
    const current =
      donePts !== undefined ? Math.floor(donePts) : Math.floor(this.activityMetrics?.pontos ?? 0);

    if (this.monthlyPointsGoalTarget != null && this.monthlyPointsGoalTarget > 0) {
      return { current, target: Math.max(this.monthlyPointsGoalTarget, 1) };
    }

    if (donePts !== undefined && allPts !== undefined) {
      const target = Math.max(Math.floor(allPts), 1);
      return { current, target };
    }
    const pendingTasks =
      (this.processMetrics?.pendentes ?? 0) + (this.processMetrics?.incompletas ?? 0);
    const target =
      pendingTasks > 0
        ? pendingTasks * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG
        : Math.max(current, 1);
    return { current, target };
  }

  get monthlyPointsGoalColor(): 'red' | 'yellow' | 'green' | 'gray' {
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

  /** Linha “Clientes atendidos” (Game4U): preferir título da entrega ao id; anexar `extra.cnpj` se existir. */
  getClienteAtendidoDisplayName(cliente: CompanyDisplay): string {
    const t = cliente.delivery_title?.trim();
    const ec = cliente.delivery_extra_cnpj?.trim();
    const base = t || this.getCompanyDisplayName(cliente.cnpj) || cliente.cnpj;
    if (ec) {
      return t ? `${t} · ${ec}` : `${base} · ${ec}`;
    }
    return base;
  }

  /** Lista: mesmo texto que {@link getClienteAtendidoDisplayName} + CNPJ da empresa (lookup) ao lado, se ainda não estiver visível. */
  getClienteAtendidoListTitle(cliente: CompanyDisplay): string {
    const base = this.getClienteAtendidoDisplayName(cliente);
    const digits =
      String(cliente.cnpjNumber ?? '')
        .replace(/\D/g, '')
        .trim() ||
      String(this.cnpjNumberMap.get(cliente.cnpj) ?? '')
        .replace(/\D/g, '')
        .trim();
    if (digits.length !== 14) {
      return base;
    }
    const formatted = this.formatCnpjBr14(digits);
    const baseDigits = base.replace(/\D/g, '');
    if (baseDigits.includes(digits)) {
      return base;
    }
    return `${base} · ${formatted}`;
  }

  /** Máscara brasileira para CNPJ (14 dígitos). */
  private formatCnpjBr14(digits14: string): string {
    const d = digits14.replace(/\D/g, '');
    if (d.length !== 14) {
      return digits14;
    }
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  /**
   * % entregas no prazo na lista — prioriza `porcEntregas` do GET `/gamificacao`; fallback `entrega` / `deliveryKpi`.
   */
  getListaEntregaPercent(cliente: CompanyDisplay): number | null {
    const p = cliente.porcEntregas;
    if (p !== undefined && p !== null && Number.isFinite(Number(p))) {
      return Number(p);
    }
    if (cliente.entrega !== undefined && cliente.entrega !== null && Number.isFinite(Number(cliente.entrega))) {
      return Number(cliente.entrega);
    }
    const k = cliente.deliveryKpi?.current;
    if (k !== undefined && k !== null && Number.isFinite(Number(k))) {
      return Number(k);
    }
    return null;
  }

  /** Classes para o % de entregas no prazo na lista «Clientes atendidos»: verde >90%, vermelho caso contrário; n/a permanece neutro. */
  listaEntregaPrazoClasses(cliente: CompanyDisplay): Record<string, boolean> {
    const v = this.getListaEntregaPercent(cliente);
    const na = v === null;
    const good = !na && v > 90;
    const below = !na && !good;
    return {
      'carteira-entrega': true,
      'carteira-entrega--na': na,
      'carteira-entrega--good': good,
      'carteira-entrega--below': below
    };
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
    const ec = cliente.delivery_extra_cnpj?.trim();
    const titleParts = [t, ec].filter(Boolean).join(' · ');
    if (titleParts) {
      return `${titleParts} | ${base}`;
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
      const current = this.getKpiCurrentValue(kpi);
      const percent = superGoal > 0 ? (current / superGoal) * 100 : 0;
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
    const snack = this.toastService.action('Deseja sair do sistema?', 'Sair', {
      duration: 8000,
      panelClass: ['snackbar-warning']
    });

    snack
      .onAction()
      .pipe(take(1))
      .subscribe(() => {
        this.announceToScreenReader('Saindo do sistema...');
        void this.sessaoProvider.logout();
      });
  }
}
