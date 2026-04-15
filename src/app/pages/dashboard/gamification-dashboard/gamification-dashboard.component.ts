import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { takeUntil, switchMap, map } from 'rxjs/operators';

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
import { GoalsReceitaBackendService } from '@services/goals-receita-backend.service';
import { UserActionDashboardService } from '@services/user-action-dashboard.service';
import {
  PlayerStatus,
  PlayerMetadata,
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
import {
  looksLikeEmail,
  pickSessionEmailForGameApi,
  pickTeamIdFromUserProfile,
  resolveTeamDisplayNameForPlayerSidebar
} from '@utils/game4u-user-id.util';
import { FUNIFIER_HTTP_DISABLED } from '@app/config/funifier-requests-disabled';
import { TemporadaService } from '@services/temporada.service';
import { TIPO_CONSULTA_COLABORADOR } from '../dashboard.component';

@Component({
  selector: 'app-gamification-dashboard',
  templateUrl: './gamification-dashboard.component.html',
  styleUrls: ['./gamification-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamificationDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private endRenderMeasurement: (() => void) | null = null;
  /** Time Financeiro na base Game4U (substitui o id legado Funifier). */
  private static readonly FINANCE_TEAM_ID = '6';
  private static readonly VALOR_CONCEDIDO_KPI_ID = 'valor-concedido';
  /**
   * `injectFinanceBillingKpi` pode disparar-se em paralelo (ex.: `loadKPIData` + `loadPlayerDataFromGame4u`).
   * Só a última conclusão deve acrescentar o circular; as outras ignoram-se após os awaits.
   */
  private financeBillingKpiLoadGeneration = 0;
  
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
    private goalsReceitaBackendService: GoalsReceitaBackendService,
    private userActionDashboard: UserActionDashboardService,
    private temporadaService: TemporadaService,
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
   * 1. Query `playerId` (e-mail ou id interno) ou `playerEmail` quando `playerId` é UUID (gestores / links externos)
   * 2. Utilizador da sessão
   * 3. 'me' como último recurso
   */
  getPlayerId(): string {
    const qp = this.route.snapshot.queryParams;
    const playerIdParam = qp['playerId'];
    const playerEmailParam = qp['playerEmail'];

    if (playerIdParam && typeof playerIdParam === 'string') {
      const trimmed = playerIdParam.trim();
      if (looksLikeEmail(trimmed)) {
        return trimmed;
      }
      if (
        playerEmailParam &&
        typeof playerEmailParam === 'string' &&
        looksLikeEmail(playerEmailParam.trim())
      ) {
        return playerEmailParam.trim();
      }
      return trimmed;
    }

    const usuario = this.sessaoProvider.usuario;
    if (usuario) {
      // E-mail real primeiro: Funifier + GET `/game/actions?user=` esperam e-mail, não UUID em `_id`.
      const gameEmail = pickSessionEmailForGameApi(usuario, this.sessaoProvider.token ?? null);
      if (gameEmail) {
        return gameEmail;
      }
      const sessionPlayerId =
        usuario._id ||
        usuario.email ||
        (usuario as { id?: string }).id;
      if (sessionPlayerId && typeof sessionPlayerId === 'string') {
        return sessionPlayerId;
      }
      if (sessionPlayerId != null) {
        return String(sessionPlayerId);
      }
    }

    return 'me';
  }
  
  ngOnInit(): void {
    this.checkResponsiveBreakpoints();
    
    // Listen for query param changes (when viewing different players)
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['playerId'] || params['playerEmail']) {
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

    if (FUNIFIER_HTTP_DISABLED) {
      void this.loadPlayerDataFromGame4u(playerId);
      return;
    }

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
          this.maybeInjectFinanceBillingKpiForPlayer(this.getPlayerId());
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
   * Com Funifier desligado, `player/{id}/status` não existe — nome e metadados vêm da sessão;
   * carteira Bloqueados/Desbloqueados na temporada soma GET `/game/actions` (DONE / DELIVERED);
   * nível do cartão pode ainda vir de GET `/game/stats`.
   */
  private async loadPlayerDataFromGame4u(playerId: string): Promise<void> {
    const loadingTimeout = setTimeout(() => {
      if (this.isLoadingPlayer) {
        console.warn('📊 Loading timeout reached, forcing loading state to false');
        this.isLoadingPlayer = false;
        this.cdr.markForCheck();
      }
    }, 20000);

    const u = this.sessaoProvider.usuario;
    const token = this.sessaoProvider.token ?? null;
    const email = pickSessionEmailForGameApi(u, token);
    const statsUser = looksLikeEmail(playerId) ? playerId.trim() : email;
    const displayName = String(
      (u as { full_name?: string; name?: string })?.full_name ||
        (u as { full_name?: string; name?: string })?.name ||
        email ||
        playerId ||
        'Jogador'
    ).trim();

    this.playerStatus = {
      _id: statsUser || playerId,
      name: displayName,
      email: statsUser || email || playerId,
      level: 0,
      seasonLevel: 0,
      levelName: '',
      percentCompleted: 0,
      metadata: this.buildPlayerMetadataFromSession(),
      created: Date.now(),
      updated: Date.now()
    };
    this.pointWallet = { bloqueados: 0, desbloqueados: 0, moedas: 0 };

    const range = SEASON_GAME_ACTION_RANGE;
    try {
      const items = await firstValueFrom(
        this.userActionDashboard.getActionsForPlayerDateRange(playerId, range.start, range.end)
      );
      const wallet = this.userActionDashboard.getSeasonPointWalletDoneDelivered(
        items,
        range.start,
        range.end
      );
      this.pointWallet = { bloqueados: wallet.bloqueados, desbloqueados: wallet.desbloqueados, moedas: 0 };

      const teamFromActions = this.userActionDashboard.pickPrimaryTeamNameFromActions(
        items,
        range.start,
        range.end
      );
      if (
        teamFromActions &&
        this.playerStatus &&
        !String(this.playerStatus.metadata?.time || '').trim()
      ) {
        this.playerStatus = {
          ...this.playerStatus,
          metadata: { ...this.playerStatus.metadata, time: teamFromActions }
        };
      }
    } catch (e) {
      console.error('📊 Game4U /game/actions (carteira temporada / time):', e);
    }

    if (statsUser) {
      try {
        const seasonIso = {
          start: range.start.toISOString(),
          end: range.end.toISOString()
        };
        const dash = await this.temporadaService.getDadosTemporadaDashboard(
          statsUser,
          TIPO_CONSULTA_COLABORADOR,
          seasonIso
        );
        const nivel = Math.floor(Number(dash.nivel?.nivelAtual) || 0);
        this.playerStatus.seasonLevel = nivel;
        this.playerStatus.level = nivel;
      } catch (e) {
        console.error('📊 Game4U /game/stats (nível jogador):', e);
      }
    }

    clearTimeout(loadingTimeout);
    this.isLoadingPlayer = false;
    this.seasonProgress = {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 0,
      seasonDates: { ...this.seasonDates }
    };
    this.maybeInjectFinanceBillingKpiForPlayer(playerId);
    this.cdr.markForCheck();
    this.loadSeasonProgressDetails();
  }

  private buildPlayerMetadataFromSession(): PlayerMetadata {
    const u = this.sessaoProvider.usuario as
      | { teams?: unknown; extra?: Record<string, unknown> }
      | null
      | undefined;
    const teams = u?.teams;
    const first = Array.isArray(teams) && teams.length > 0 ? teams[0] : undefined;
    const extra = u?.extra && typeof u.extra === 'object' ? u.extra : {};
    const time = resolveTeamDisplayNameForPlayerSidebar(
      first,
      extra as Record<string, unknown>,
      u as Record<string, unknown> | null | undefined
    );
    return {
      ...extra,
      area: typeof extra['area'] === 'string' ? extra['area'] : '',
      time,
      squad: typeof extra['squad'] === 'string' ? extra['squad'] : ''
    };
  }

  /**
   * Load additional season progress details:
   * - Metas: count of KPIs above target from metric_targets__c
   * - Clientes: count of unique CNPJs from action_log aggregate
   * - Tarefas finalizadas: count of actions from action_log
   */
  private loadSeasonProgressDetails(): void {
    const playerId = this.getPlayerId();
    if (!playerId || playerId === 'me') {
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

    const playerId = this.getPlayerId();
    if (!playerId || playerId === 'me') {
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
          const vcId = GamificationDashboardComponent.VALOR_CONCEDIDO_KPI_ID;
          const baseKpis = (kpis || []).filter(k => k.id !== vcId);
          this.playerKPIs = baseKpis;
          this.isLoadingKPIs = false;
          
          // Metas do cartão "Progresso da Temporada": loadSeasonProgressDetails (intervalo fixo).

          this.cdr.markForCheck();

          // Metas coletivas do financeiro: reavalia após KPIs (evita corrida com `loadPlayerDataFromGame4u`).
          this.maybeInjectFinanceBillingKpiForPlayer(playerId);
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
   * Id do time Financeiro (`6`), nome com "financeiro", ou `metadata.time` (ex.: `/game/actions`).
   * Critério alinhado ao `isSelectedFinanceTeam` do painel de gestão de equipa.
   */
  private isFinanceTeamMember(): boolean {
    const fid = GamificationDashboardComponent.FINANCE_TEAM_ID;
    const labelIsFinance = (s: string): boolean => s.trim().toLowerCase().includes('financeiro');

    const tid = pickTeamIdFromUserProfile(this.sessaoProvider.usuario);
    if (tid != null && String(tid).trim() === fid) {
      return true;
    }

    const u = this.sessaoProvider.usuario as Record<string, unknown> | null | undefined;
    if (u) {
      const rootTid = u['team_id'] ?? u['teamId'];
      if (rootTid != null && String(rootTid).trim() === fid) {
        return true;
      }

      const teams = u['teams'];
      if (Array.isArray(teams)) {
        for (const t of teams) {
          if (t != null && (typeof t === 'string' || typeof t === 'number')) {
            const sid = String(t).trim();
            if (sid === fid) {
              return true;
            }
            if (typeof t === 'string' && labelIsFinance(t)) {
              return true;
            }
          } else if (t && typeof t === 'object') {
            const o = t as Record<string, unknown>;
            const id = o['_id'] ?? o['id'] ?? o['team_id'];
            if (id != null && String(id).trim() === fid) {
              return true;
            }
            for (const k of ['name', 'team_name', 'label', 'title']) {
              const v = o[k];
              if (typeof v === 'string' && labelIsFinance(v)) {
                return true;
              }
            }
          }
        }
      }
      const extra = u['extra'];
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        const ex = extra as Record<string, unknown>;
        const exTid = ex['team_id'] ?? ex['teamId'];
        if (exTid != null && String(exTid).trim() === fid) {
          return true;
        }
        for (const k of ['team_name', 'teamName']) {
          const v = ex[k];
          if (typeof v === 'string' && labelIsFinance(v)) {
            return true;
          }
        }
      }
      for (const k of ['team_name', 'teamName']) {
        const v = u[k];
        if (typeof v === 'string' && labelIsFinance(v)) {
          return true;
        }
      }
    }

    const timeMeta = String(this.playerStatus?.metadata?.time || '').toLowerCase();
    if (timeMeta.includes('financeiro')) {
      return true;
    }

    return false;
  }

  private maybeInjectFinanceBillingKpiForPlayer(playerId: string): void {
    if (!playerId || playerId === 'me') {
      return;
    }
    if (!this.isFinanceTeamMember()) {
      return;
    }
    this.injectFinanceBillingKpi(playerId);
  }

  private injectFinanceBillingKpi(playerId: string): void {
    void playerId;
    this.playerKPIs = this.playerKPIs.filter(
      k => k.id !== GamificationDashboardComponent.VALOR_CONCEDIDO_KPI_ID
    );
    void this.loadFinanceBillingKpiLikeTeamManagement();
  }

  /**
   * Mesma montagem que o team-management dashboard: goals/logs → fallback Omie.
   */
  private async loadFinanceBillingKpiLikeTeamManagement(): Promise<void> {
    const gen = ++this.financeBillingKpiLoadGeneration;
    const vcId = GamificationDashboardComponent.VALOR_CONCEDIDO_KPI_ID;
    this.playerKPIs = this.playerKPIs.filter(k => k.id !== vcId);
    try {
      const billingGoal = await this.systemParamsService.getParam<number>(
        'financeiro_monthly_billing_goal' as any
      );
      const paramTarget =
        typeof billingGoal === 'number' && billingGoal > 0 ? billingGoal : 0;

      const goalsKpi = await this.goalsReceitaBackendService.tryGetReceitaConcedidaKpi(
        this.selectedMonth
      );

      let safeCurrentBilling = 0;
      let targetBilling = 0;
      let kpiPercent = 0;
      let animateProgressFromPercent: number | undefined;
      let progressEvolutionLabel: string | undefined;

      if (goalsKpi != null) {
        safeCurrentBilling = goalsKpi.current;
        targetBilling = goalsKpi.target > 0 ? goalsKpi.target : paramTarget;
        kpiPercent = Math.min(100, goalsKpi.percent);
        progressEvolutionLabel = goalsKpi.progressEvolutionLabel;
        if (
          goalsKpi.previousRingPercent != null &&
          goalsKpi.previousRingPercent !== kpiPercent
        ) {
          animateProgressFromPercent = goalsKpi.previousRingPercent;
        }
      } else {
        const teamIdForOmie =
          pickTeamIdFromUserProfile(this.sessaoProvider.usuario) ||
          GamificationDashboardComponent.FINANCE_TEAM_ID;
        const currentBilling = await firstValueFrom(
          this.financeiroOmieRecebiveisService
            .getValorConcedidoFinanceiro(teamIdForOmie, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        );
        safeCurrentBilling =
          typeof currentBilling === 'number' && isFinite(currentBilling) ? currentBilling : 0;
        targetBilling = paramTarget;
        kpiPercent =
          targetBilling > 0 ? Math.round((safeCurrentBilling / targetBilling) * 100) : 0;
      }

      const superTargetBilling =
        targetBilling > 0 ? Math.ceil(targetBilling * 1.5) : undefined;

      if (gen !== this.financeBillingKpiLoadGeneration) {
        return;
      }

      this.playerKPIs = this.playerKPIs.filter(k => k.id !== vcId);

      const billingKpi: KPIData = {
        id: vcId,
        label: 'Valor concedido',
        current: safeCurrentBilling,
        target: targetBilling,
        superTarget: superTargetBilling,
        unit: 'R$',
        color:
          targetBilling > 0 && superTargetBilling != null
            ? this.getKPIColorByGoals(safeCurrentBilling, targetBilling, superTargetBilling)
            : 'red',
        percentage: Math.min(100, kpiPercent),
        ...(animateProgressFromPercent != null
          ? { animateProgressFromPercent, progressEvolutionLabel }
          : progressEvolutionLabel != null
            ? { progressEvolutionLabel }
            : {})
      };

      this.playerKPIs = [...this.playerKPIs, billingKpi];
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading finance billing KPI (player panel):', error);
    }
  }

  private getKPIColorByGoals(
    current: number,
    target: number,
    superTarget: number
  ): 'red' | 'yellow' | 'green' {
    if (current >= superTarget) {
      return 'green';
    }
    if (current >= target) {
      return 'yellow';
    }
    return 'red';
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

    const playerId = this.getPlayerId();
    if (!playerId || playerId === 'me') {
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
   * Chave do jogador para modais (carteira, lista de progresso): mesmo critério que {@link getPlayerId}
   * — e-mail para GET `/game/actions?user=`, não UUID em `_id`.
   */
  get currentPlayerId(): string {
    return this.getPlayerId();
  }

  /**
   * Id do time (Funifier) para o modal de entrega: GET `/game/team-actions` e todas as ações da delivery.
   */
  get carteiraModalTeamIdForDelivery(): string | null {
    return pickTeamIdFromUserProfile(this.sessaoProvider.usuario);
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
