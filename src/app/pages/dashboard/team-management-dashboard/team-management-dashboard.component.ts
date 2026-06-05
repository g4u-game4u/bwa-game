import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Renderer2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject, of, firstValueFrom, lastValueFrom, Observable, forkJoin } from 'rxjs';
import { takeUntil, finalize, map, take, mergeMap, last } from 'rxjs/operators';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';
import { ModalTeamManagementFaqComponent } from '@modals/modal-team-management-faq/modal-team-management-faq.component';
import {
  extractGamificacaoEmpIdFromDeliveryKey,
  extractEmpIdPrefixFromDeliveryIdFirstSegment
} from '@services/gamificacao-delivery-empid.util';
import * as dayjs from 'dayjs';
import { trigger, transition, style, animate } from '@angular/animations';

// Services
import {
  TeamAggregateService,
  TeamSeasonPoints,
  TeamProgressMetrics,
  Collaborator,
  TeamFinishedDeliveriesPageResult
} from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { BwaTeamApiService } from '@services/bwa-team-api.service';
import { BackendApiService } from '@services/backend-api.service';
import { PlayerService } from '@services/player.service';
import {
  ActionLogService,
  SupervisionTeamDashboardCachedBundle,
  PlayerParticipacaoDeliveriesPageResult,
  PlayerParticipacaoDeliveryRow,
  TeamDailyFinishedStatsRow
} from '@services/action-log.service';
import {
  aggregateExecutiveTopProcessesFromUserActions,
  deliveryRowCountsAsOnTime,
  hasMoreFinishedDeliveriesCachedPage,
  isGame4uUserActionFinalizedStatus
} from '@services/game4u-game-mapper';
import { buildDashboardInsightsSnapshotFromUserActions } from '@services/dashboard-insights.service';
import { DashboardInsightsSnapshot } from '@model/dashboard-insights.model';
import {
  getManagementDashboardCachedRoleLabel,
  ManagementDashboardCachedRole
} from '@utils/management-dashboard-role';
import type {
  PlayerDashboardCachedParams,
  Game4uReportsFinishedDeliveryRow,
  Game4uUserActionModel
} from '@model/game4u-api.model';
import { UserProfileService } from '@services/user-profile.service';
import { UserProfile } from '@utils/user-profile';
import {
  aggregateDailyFinishedStatsByDay,
  aggregateDailyFinishedStatsByEmail,
  dailyMapsFromDayAggregate,
  formatGerenciaGroupLabel,
  ProductivitySegmentationMode,
  resolveProductivitySegmentationMode
} from '@utils/productivity-segmentation';
import { CompanyDisplay, CompanyKpiService } from '@services/company-kpi.service';
import { KPIData } from '@app/model/gamification-dashboard.model';
import { KPIService } from '@services/kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';

// Models
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { GoalMetric } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.component';
import { GraphDataPoint, ActivityMetrics, ProcessMetrics, ChartDataset, PointWallet, SeasonProgress } from '@app/model/gamification-dashboard.model';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';

/** Mínimo de entregas no mês para entrar na lista «precisam de atenção». */
const EXECUTIVE_ATTENTION_MIN_DELIVERIES = 3;
/** Abaixo deste % de entregas no prazo o jogador é elegível para atenção. */
const EXECUTIVE_ATTENTION_MAX_ON_TIME_PCT = 90;

/** Linha de ranking de jogador nos insights executivos (destaque / atenção). */
export interface ExecutiveInsightsPlayerRank {
  email: string;
  name: string;
  initials: string;
  tasksTotal: number;
  clientsCount: number;
  deliveriesCount: number;
  onTimeDeliveries: number;
  onTimeDeliveryPct: number | null;
  onTimePct: number | null;
}

/**
 * Team Management Dashboard Component
 * Main container for the management dashboard view
 * Accessible to users with session roles ADMIN or GESTOR, or management profiles (GESTAO, SUPERVISÃO, or DIREÇÃO via teams)
 * 
 * This component orchestrates all child components and manages the data flow
 * between team selection, collaborator filtering, month selection, and data display.
 * 
 * Features:
 * - Team and collaborator selection
 * - Month-based data filtering
 * - Tab switching between Goals and Productivity views
 * - Real-time data fetching from Funifier API
 * - Loading states and error handling
 * - Data refresh with cache clearing
 * 
 * Requirements: All
 */
@Component({
  selector: 'app-team-management-dashboard',
  templateUrl: './team-management-dashboard.component.html',
  styleUrls: ['./team-management-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class TeamManagementDashboardComponent implements OnInit, OnDestroy {
  /** Id sintético usado no seletor para o «Painel do Gerente / Diretor / C-Level». */
  static readonly MANAGEMENT_OVERVIEW_TEAM_ID = '__management_overview__';

  // State management
  selectedTeam: string = '';
  selectedTeamId: string = ''; // Funifier team ID (e.g., 'FkmdnFU')
  selectedCollaborator: string | null = null;
  /** Papel agregado do utilizador (GERENTE / DIRETOR / C_LEVEL) ou `null`. */
  managementRole: ManagementDashboardCachedRole | null = null;
  /** Vista corrente no «Painel do Gerente / Diretor / C-Level» (sem time selecionado). */
  isManagementOverview = false;
  // Initialize to February 2026 by default (similar to gamification-dashboard)
  // Calculate months ago from current date to February 2026
  selectedMonthsAgo: number = (() => {
    const now = dayjs();
    const feb2026 = dayjs('2026-02-01');
    // Calculate how many months ago February 2026 is from now
    // If we're in February 2026, monthsAgo = 0
    // If we're in March 2026, monthsAgo = 1 (one month ago)
    // If we're in January 2026, monthsAgo = -1, but we'll use 0 as minimum
    const monthsDiff = now.diff(feb2026, 'month', true); // Use true for fractional months
    return Math.max(0, Math.round(monthsDiff));
  })();
  selectedMonth: Date | undefined = new Date(2026, 1, 1); // February 2026 (month is 0-indexed: 1 = February)
  activeTab: 'goals' | 'productivity' = 'goals';

  /** Aba reativada: dados vêm do endpoint Game4U “team daily finished stats”. */
  productivityAnalysisTabEnabled = true;

  /** Mensagem do toast flutuante (anexado a `document.body` junto ao ponteiro). */
  readonly productivityTabDisabledToastMessage = 'Esta análise estará disponível em breve.';

  private productivityTabBodyToastEl: HTMLElement | null = null;
  
  // Loading states
  isLoading: boolean = false;
  isLoadingTeams: boolean = false;
  isLoadingCollaborators: boolean = false;
  isLoadingSidebar: boolean = false;
  isLoadingGoals: boolean = false;
  isLoadingProductivity: boolean = false;
  /** Loading específico do circular «Pontos no mês» (cache supervisão ou dashboard/cached). */
  isLoadingMonthlyPointsProgress = false;
  /** Estado agregado: usado para desabilitar ações globais (ex.: refresh) sem travar a tela inteira. */
  get isAnyLoading(): boolean {
    return (
      this.isLoadingTeams ||
      this.isLoadingCollaborators ||
      this.isLoadingSidebar ||
      this.isLoadingGoals ||
      this.isLoadingKPIs ||
      this.isLoadingCarteira ||
      this.isLoadingCarteiraMore ||
      this.isLoadingClientesAtendidosCount ||
      this.isLoadingParticipacaoKpi ||
      this.isLoadingProductivity ||
      this.isSavingMeta
    );
  }

  /** Loading overlay microcopy (rotate while loading). */
  loadingTitle: string = 'Carregando dados…';
  loadingSubtitle: string = 'Aquecendo a gamificação e somando pontos.';
  private loadingMessageTimer: number | null = null;
  private loadingMessageIdx = 0;
  private readonly loadingMessages: Array<{ title: string; subtitle: string }> = [
    { title: 'Carregando o painel…', subtitle: 'Somando pontos e alinhando metas.' },
    { title: 'Puxando dados do time…', subtitle: 'Conferindo entregas finalizadas e pendências.' },
    { title: 'Preparando o placar…', subtitle: 'Organizando clientes atendidos e KPIs.' },
    { title: 'Quase lá…', subtitle: 'Ajustando o filtro do mês e consolidando a equipe.' }
  ];
  
  // Error states
  hasError: boolean = false;
  errorMessage: string = '';
  hasSidebarError: boolean = false;
  sidebarErrorMessage: string = '';
  hasGoalsError: boolean = false;
  goalsErrorMessage: string = '';
  hasProductivityError: boolean = false;
  productivityErrorMessage: string = '';
  
  // Data
  teams: Team[] = [];
  collaborators: Collaborator[] = [];
  displayTeamName: string = ''; // Explicit property for team name display (for OnPush change detection)
  seasonPoints: TeamSeasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
  progressMetrics: TeamProgressMetrics = {
    processosIncompletos: 0,
    atividadesFinalizadas: 0,
    processosFinalizados: 0
  };
  seasonDates: { start: Date; end: Date } = { start: new Date(), end: new Date() };
  
  // Formatted data for gamification dashboard components
  teamPointWallet: PointWallet | null = null;
  teamSeasonProgress: SeasonProgress | null = null;
  teamKPIs: KPIData[] = [];
  isLoadingKPIs: boolean = false;
  /** Placeholders visuais enquanto KPIs não retornam (cartões em pending, igual ao painel individual). */
  readonly kpiLoadingSlots: readonly number[] = [0];
  goalMetrics: GoalMetric[] = [];
  graphData: GraphDataPoint[] = []; // Activities data
  graphDatasets: ChartDataset[] = []; // Multiple datasets for team members (one line per player) - Activities
  pointsGraphData: GraphDataPoint[] = []; // Points data
  pointsGraphDatasets: ChartDataset[] = []; // Multiple datasets for team members (one line per player) - Points
  selectedPeriod: number = 30;

  /** Seleção do seletor de período (0 = "mês atual"). */
  productivityPeriodSelection: number = 0;

  /** End date usado para construir colunas das tabelas (alinha com o request). */
  private productivityLastRangeEnd: dayjs.Dayjs = dayjs();

  // Productivity view modes (per-chart)
  productivityActivitiesDailyView: 'chart' | 'table' = 'table';
  productivityPointsDailyView: 'chart' | 'table' = 'table';
  productivityActivitiesByCollaboratorView: 'chart' | 'table' = 'table';
  productivityPointsByCollaboratorView: 'chart' | 'table' = 'table';

  // Table views (computed from chart datasets)
  productivityActivitiesDailyTable: {
    columns: Array<{ key: string; label: string; tooltip: string }>;
    rows: Array<{ memberName: string; values: number[] }>;
    maxValue: number;
  } = { columns: [], rows: [], maxValue: 0 };

  productivityPointsDailyTable: {
    columns: Array<{ key: string; label: string; tooltip: string }>;
    rows: Array<{ memberName: string; values: number[] }>;
    maxValue: number;
  } = { columns: [], rows: [], maxValue: 0 };

  productivityActivitiesByCollaboratorTable: Array<{ name: string; total: number; percent: number }> = [];
  productivityPointsByCollaboratorTable: Array<{ name: string; total: number; percent: number }> = [];
  
  // Bar charts data for collaborator comparison
  activitiesByCollaboratorGraphData: GraphDataPoint[] = [];
  activitiesByCollaboratorDatasets: ChartDataset[] = [];
  activitiesByCollaboratorLabels: string[] = [];
  pointsByCollaboratorGraphData: GraphDataPoint[] = [];
  pointsByCollaboratorDatasets: ChartDataset[] = [];
  pointsByCollaboratorLabels: string[] = [];
  
  // Team aggregated data from members
  teamTotalPoints: number = 0;
  teamAveragePoints: number = 0;
  teamTotalTasks: number = 0;
  teamTotalBlockedPoints: number = 0; // Sum of blocked points from all team members
  teamMemberIds: string[] = [];
  teamMembersData: any[] = []; // Store full player data from aggregate (includes extra.cnpj)
  
  // Activity and Process metrics for team
  teamActivityMetrics: ActivityMetrics = {
    pendentes: 0,
    emExecucao: 0,
    finalizadas: 0,
    pontos: 0
  };
  teamProcessMetrics: ProcessMetrics = {
    pendentes: 0,
    incompletas: 0,
    finalizadas: 0
  };

  /** Meta do circular «Pontos no mês» (`dashboard/cached` ou supervisão) quando um colaborador está selecionado. */
  monthlyPointsGoalTarget: number | null = null;
  
  // Company/Carteira data for team
  teamCarteiraClientes: CompanyDisplay[] = [];
  isLoadingCarteira: boolean = false;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name
  cnpjStatusMap = new Map<string, string>(); // Map of CNPJ → status (Ativa/Inativa)
  /** EmpID → CNPJ 14 dígitos (participação / gamificação), alinhado ao gamification-dashboard. */
  cnpjNumberMap = new Map<string, string>();

  /** `deliveries_count` do snapshot Game4U (reports) → «Clientes atendidos» no progresso da temporada (como no painel individual). */
  private teamSidebarDeliveryStatsTotal?: number;

  /** KPI % entregas no prazo por linha: carregamento após cruzamento gamificação. */
  isLoadingParticipacaoKpi = false;
  private participacaoKpiLoadGen = 0;

  clientesAtendidosThisMonthCount: number | null = null;
  isLoadingClientesAtendidosCount = false;

  // -----------------------------------------------------------------------------------------------
  // Executive insights (mini dashboard)
  // -----------------------------------------------------------------------------------------------
  /**
   * Top processos: agregado por título de `GET /game/reports/user-actions` (campo `title` / `action_title`).
   */
  executiveInsightsTopProcesses: Array<{
    deliveryTitle: string;
    tasksTotal: number;
    deliveriesCount: number;
    onTimePct: number | null;
    pct: number;
  }> = [];

  /** Destaque do mês: mais entregas no prazo (`deliveryRowCountsAsOnTime`). */
  executiveInsightsTopPlayers: ExecutiveInsightsPlayerRank[] = [];
  /** Menor volume de entregas no prazo — precisam de atenção. */
  executiveInsightsAttentionPlayers: ExecutiveInsightsPlayerRank[] = [];

  /** Total de tarefas DONE/DELIVERED agregadas no mês a partir das linhas RAW (não usa fallback ao supervision/dashboard). */
  executiveInsightsTotalTasks = 0;
  /** Tarefas no prazo (somatório das linhas com `on_time_pct` ponderado por `tasks_total`). */
  executiveInsightsOnTimeTasks = 0;
  /** Total de jogadores distintos com pelo menos uma entrega no mês (`user_email`). */
  executiveInsightsActivePlayers = 0;
  /** Média de tarefas por jogador ativo no mês. */
  executiveInsightsAvgTasksPerActivePlayer = 0;
  /** Média de clientes únicos por jogador ativo no mês. */
  executiveInsightsAvgClientsPerActivePlayer = 0;
  /** Total de processos / entregas distintas no mês (linhas com `tasks_total > 0`). */
  executiveInsightsTotalDeliveries = 0;
  /** Total de processos / títulos únicos no mês. */
  executiveInsightsDistinctProcesses = 0;
  /** % de tarefas no prazo (média ponderada das linhas com `on_time_pct`). */
  executiveInsightsOnTimePctOverall: number | null = null;

  readonly executiveSkeletonKpiSlots = [0, 1, 2, 3, 4];
  readonly executiveSkeletonProcessSlots = [0, 1, 2, 3];
  readonly executiveSkeletonPlayerBlocks = [0, 1];
  readonly executiveSkeletonPlayerSlots = [0, 1, 2];

  isLoadingExecutiveInsights = false;
  hasExecutiveInsightsData = false;
  hasExecutiveInsightsError = false;
  /** Prazos, multa, dia produtivo etc. (user-actions) dentro dos insights executivos. */
  executiveDashboardInsights: DashboardInsightsSnapshot | null = null;
  /** Indica se o ranking de jogadores deve ser exibido (oculto no drill-down de colaborador único). */
  showExecutiveInsightsPlayersRanking = false;
  /** Geração de carga (evita race conditions com troca de mês/colaborador/equipa). */
  private executiveInsightsLoadGen = 0;

  /** Cache de supervisão (`GET /game/reports/supervision/dashboard/cached`) indisponível para o mês. */
  teamSupervisionCacheMissing = false;
  /** `refreshed_at` do cache de supervisão (quando disponível). */
  teamDashboardRefreshedAt: Date | null = null;
  readonly dashboardSyncLabel = 'Sincronizado com Acessórias';
  /** Intervalos `season_*` / `month_*` em `params` do cache de supervisão. */
  teamDashboardCachedParams: PlayerDashboardCachedParams | null = null;
  /** % entregas no prazo no mês (`month_on_time_delivery_pct`), 0–100. */
  teamMonthOnTimeDeliveryPct: number | null = null;
  /** Bundle aplicado na vista equipa agregada (evita re-fetch na mesma carga). */
  private teamSupervisionBundle: SupervisionTeamDashboardCachedBundle | null = null;

  useParticipacaoReportsPagination = false;
  isLoadingCarteiraMore = false;
  participacaoHasMore = false;
  private participacaoNextOffset = 0;
  private participacaoTotal?: number;
  /** Quando definido, «Carregar mais» usa `finished/deliveries/cached` por email (drill-down colaborador). */
  private participacaoPagedPlayerId: string | null = null;
  private readonly participacaoPageLimit = 30;
  
  // Monthly points breakdown
  monthlyPointsBreakdown: { bloqueados: number; desbloqueados: number } | null = null;
  
  // Company detail modal state
  isCompanyCarteiraDetailModalOpen: boolean = false;
  selectedCarteiraCompany: CompanyDisplay | null = null;
  
  // Modal states
  isProgressModalOpen: boolean = false;
  progressModalType: ProgressListType = 'atividades';
  isCarteiraModalOpen: boolean = false;
  
  // Refresh tracking
  lastRefresh: Date = new Date();

  /** Placeholder para exibir a carteira com reticências antes dos dados chegarem. */
  readonly emptyPointWallet: PointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 };

  /** Placeholder para exibir o progresso da temporada com reticências antes dos dados chegarem. */
  get emptySeasonProgress(): SeasonProgress {
    return {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 0,
      seasonDates: this.seasonDates
    };
  }

  /** Reticências na carteira enquanto o menu lateral consolida dados. */
  get sidebarWalletPending(): boolean {
    return this.isLoadingSidebar;
  }

  /** Reticências em stats da temporada enquanto o menu lateral consolida dados. */
  get sidebarSeasonStatsPending(): boolean {
    return this.isLoadingSidebar;
  }
  
  // Accessibility properties
  screenReaderAnnouncement: string = '';
  private focusedElementBeforeModal: HTMLElement | null = null;
  
  // Sidebar collapse state
  sidebarCollapsed: boolean = false;

  /** Evita “piscar” loading do menu lateral ao trocar mês. */
  private sidebarLoadedOnce = false;

  /** Resposta de GET /team/:team_id (ApiProvider / BWA). */
  teamDetailApiResponse: any | null = null;
  
  // Meta configuration state
  metaConfig: {
    selectedCollaborator: string;
    targetValue: number | null;
  } = {
    selectedCollaborator: 'all',
    targetValue: null
  };
  isSavingMeta: boolean = false;
  metaSaveMessage: string = '';
  metaSaveSuccess: boolean = false;
  
  // Cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private teamAggregateService: TeamAggregateService,
    private graphDataProcessor: GraphDataProcessorService,
    private seasonDatesService: SeasonDatesService,
    private toastService: ToastService,
    private sessaoProvider: SessaoProvider,
    private bwaTeamApi: BwaTeamApiService,
    private cacheManagerService: CacheManagerService,
    private backendApi: BackendApiService,
    private playerService: PlayerService,
    private actionLogService: ActionLogService,
    private userProfileService: UserProfileService,
    private companyKpiService: CompanyKpiService,
    private kpiService: KPIService,
    private cnpjLookupService: CnpjLookupService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private ngbModal: NgbModal
  ) {}

  ngOnInit(): void {
    this.cacheManagerService.clearAllCaches();
    void this.bootstrapDashboard();
  }

  /** Garante sessão restaurada e arranca carregamento (evita HTTP sem token/interceptor). */
  private async bootstrapDashboard(): Promise<void> {
    try {
      await this.initializeDashboard();
    } catch (error) {
      console.error('❌ bootstrapDashboard:', error);
      this.cdr.markForCheck();
    }
  }

  /** Se há token mas ainda não há `usuario` (ex.: refresh), aguarda `sessao.init`. */
  private async ensureSessionReady(): Promise<void> {
    if (this.sessaoProvider.usuario) {
      return;
    }
    const token = this.sessaoProvider.token;
    if (!token) {
      console.warn('[TeamManagement] Sem token — pedidos à API BWA podem ser bloqueados pelo interceptor.');
      return;
    }
    const ok = await this.sessaoProvider.init(true);
    if (!ok) {
      console.warn('[TeamManagement] sessao.init falhou — utilizador pode ficar indefinido.');
    }
  }

  ngOnDestroy(): void {
    this.removeProductivityTabBodyToast();
    this.stopLoadingMessageRotation();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startLoadingMessageRotation(): void {
    this.stopLoadingMessageRotation();
    // seed immediately
    this.loadingMessageIdx = 0;
    const first = this.loadingMessages[0];
    if (first) {
      this.loadingTitle = first.title;
      this.loadingSubtitle = first.subtitle;
    }
    this.loadingMessageTimer = window.setInterval(() => {
      if (!this.isLoading) {
        this.stopLoadingMessageRotation();
        return;
      }
      this.loadingMessageIdx = (this.loadingMessageIdx + 1) % this.loadingMessages.length;
      const m = this.loadingMessages[this.loadingMessageIdx];
      this.loadingTitle = m.title;
      this.loadingSubtitle = m.subtitle;
      this.cdr.markForCheck();
    }, 1200);
  }

  private stopLoadingMessageRotation(): void {
    if (this.loadingMessageTimer != null) {
      window.clearInterval(this.loadingMessageTimer);
      this.loadingMessageTimer = null;
    }
  }

  /**
   * Initialize dashboard by loading user's team and season dates.
   * 
   * This method is called on component initialization and performs the following:
   * 1. Loads season dates from the SeasonDatesService
   * 2. Identifies the user's management team (GESTAO, SUPERVISÃO, or DIREÇÃO)
   * 3. Fetches team information from Funifier to get the team name
   * 4. Loads all data for the user's team
   * 
   * @private
   * @async
   * @returns Promise that resolves when initialization is complete
   * 
   * @example
   * // Called automatically in ngOnInit
   * await this.initializeDashboard();
   */
  private async initializeDashboard(): Promise<void> {
    try {
      console.log('🚀 Initializing team management dashboard...');

      await this.ensureSessionReady();

      console.log('📅 Season + 👥 teams em paralelo…');
      await Promise.all([this.loadSeasonDates(), this.loadAvailableTeams()]);
      console.log('✅ Season dates + teams:', this.teams.length);

      if (this.teams.length > 0) {
        const savedTeamId = localStorage.getItem('selectedTeamId');
        const hasManagementOverviewEntry = this.teams.some(
          t => t.id === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID
        );
        // Papel agregado (GERENTE/DIRETOR/C-LEVEL): **sempre** abrir no «Painel do …»,
        // ignorando `selectedTeamId` persistido — drill-down em equipa real é manual.
        const teamToSelect = hasManagementOverviewEntry
          ? TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID
          : savedTeamId && this.teams.some(t => t.id === savedTeamId)
            ? savedTeamId
            : this.teams[0].id;

        await this.onTeamChange(teamToSelect);
        console.log('✅ Initial team selected:', teamToSelect);
      } else {
        console.error('❌ No teams available for user');
      }
    } catch (error) {
      console.error('❌ Error initializing dashboard:', error);
      this.cdr.markForCheck();
    }
  }

  /**
   * Load season dates from SeasonDatesService.
   * 
   * Fetches the current season's start and end dates. If the service fails,
   * falls back to default dates (January 1 to December 31 of current year).
   * 
   * @private
   * @async
   * @returns Promise that resolves when season dates are loaded
   * 
   * @example
   * await this.loadSeasonDates();
   * console.log(this.seasonDates); // { start: Date, end: Date }
   */
  private async loadSeasonDates(): Promise<void> {
    try {
      const dates = await this.seasonDatesService.getSeasonDates();
      this.seasonDates = {
        start: (dates as any).start || (dates as any).dataInicio,
        end: (dates as any).end || (dates as any).dataFim
      };
    } catch (error) {
      console.error('Error loading season dates:', error);
      // Use default dates if service fails
      const now = new Date();
      this.seasonDates = {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear(), 11, 31)
      };
    }
  }

  /**
   * Get the management team ID that the current user belongs to.
   * 
   * Uses UserProfileService to get the user's own team ID based on their profile.
   * 
   * @private
   * @returns The team ID if user belongs to a management team, null otherwise
   * 
   * @example
   * const teamId = this.getUserManagementTeamId();
   * // Returns: 'FkmdnFU' or 'Fkmdmko' or null (DIRETOR returns null as they can see all)
   */
  private getUserManagementTeamId(): string | null {
    return this.userProfileService.getCurrentUserOwnTeamId();
  }

  /** Lista de referências de times na sessão (`teams` ou legado `extra.teams`). */
  private getUserTeamsRaw(): unknown[] {
    const u = this.sessaoProvider.usuario;
    if (!u) {
      return [];
    }
    const top = u.teams;
    if (Array.isArray(top) && top.length > 0) {
      return top;
    }
    const extraTeams = u.extra?.['teams'];
    if (Array.isArray(extraTeams) && extraTeams.length > 0) {
      return extraTeams;
    }
    return [];
  }

  /**
   * `team_id` numérico/string da API BWA (`GET /user`), usado em `GET /team/:team_id`.
   */
  private getBwaSessionTeamId(): string | null {
    const u = this.sessaoProvider.usuario as { team_id?: number | string } | null;
    if (!u || u.team_id == null) {
      return null;
    }
    const s = String(u.team_id).trim();
    return s !== '' ? s : null;
  }

  /** Utilizador autenticado (mesmo critério que o painel de gamificação individual). */
  private getPanelPlayerId(): string {
    const u = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    return String(u?._id || u?.email || '').trim();
  }

  /**
   * `team_id` nas queries Game4U do painel (= time selecionado, id da API BWA).
   * No «Painel do Gerente / Diretor / C-Level» (id sintético), não há `team_id`.
   */
  private getGame4uTeamScopeId(): string | undefined {
    const t = (this.selectedTeamId || '').trim();
    if (t === '' || t === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID) {
      return undefined;
    }
    return t;
  }

  /**
   * `team_id` em `GET /game/reports/*`: preferir id numérico da sessão BWA quando `selectedTeamId` for id Funifier/nome.
   */
  private getGame4uReportTeamId(): string | undefined {
    const sid = (this.selectedTeamId || '').trim();
    const bwa = this.getBwaSessionTeamId();
    if (sid && /^\d+$/.test(sid)) {
      return sid;
    }
    if (bwa != null) {
      const b = String(bwa).trim();
      if (b && /^\d+$/.test(b)) {
        return b;
      }
    }
    if (sid) {
      return sid;
    }
    return bwa != null ? String(bwa).trim() || undefined : undefined;
  }

  /**
   * Id numérico (bigint no Postgres) para query `team` em `/game/team-stats` e `/game/team-deliveries`.
   * Não usar {@link selectedTeam} (nome legível) — causa 400 «invalid input syntax for type bigint».
   */
  private pickGame4uNumericTeamIdFromRaw(team: Record<string, unknown> | null | undefined): string | undefined {
    if (!team || typeof team !== 'object') {
      return undefined;
    }
    const keys = [
      'game4u_team_id',
      'game_team_id',
      'g4u_team_id',
      'gameTeamId',
      'numeric_team_id',
      'team_numeric_id'
    ];
    for (const k of keys) {
      const v = team[k];
      if (v != null && /^\d+$/.test(String(v).trim())) {
        return String(v).trim();
      }
    }
    const id = team['_id'] ?? team['id'];
    if (id != null && /^\d+$/.test(String(id).trim())) {
      return String(id).trim();
    }
    return undefined;
  }

  /** Valor do parâmetro `team` nos endpoints Game4U que esperam id numérico da equipa no jogo. */
  private getGame4uTeamHttpParam(): string {
    const sel = this.teams.find(t => t.id === this.selectedTeamId) as
      | (Team & { game4uTeamId?: string })
      | undefined;
    const fromPicker = sel?.game4uTeamId?.trim();
    if (fromPicker && /^\d+$/.test(fromPicker)) {
      return fromPicker;
    }
    const detail = this.teamDetailApiResponse;
    const raw = (Array.isArray(detail) ? detail[0] : detail) as Record<string, unknown> | undefined;
    const fromDetail = this.pickGame4uNumericTeamIdFromRaw(raw);
    if (fromDetail) {
      return fromDetail;
    }
    const sid = (this.selectedTeamId || '').trim();
    if (/^\d+$/.test(sid)) {
      return sid;
    }
    const bwa = this.getBwaSessionTeamId();
    if (bwa != null && /^\d+$/.test(String(bwa).trim())) {
      return String(bwa).trim();
    }
    console.warn(
      '[Game4U] Defina na API BWA um campo numérico (ex.: game4u_team_id) em GET /team, ou use id de equipa só com dígitos. ' +
        'Enviar o nome da equipa ou um ObjectId em `team` falha no backend.'
    );
    return sid;
  }

  /**
   * Team id para GET /team/:team_id.
   * Prioriza `team_id` de `/user` (BWA); depois perfil Funifier; depois `teams` / `extra.teams`.
   */
  private getTeamIdForDetailEndpoint(): string | null {
    const bwaTeamId = this.getBwaSessionTeamId();
    if (bwaTeamId) {
      return bwaTeamId;
    }
    const own = this.userProfileService.getCurrentUserOwnTeamId();
    if (own) {
      return own;
    }
    const raw = this.getUserTeamsRaw();
    const ids = raw
      .map((team: unknown) => {
        if (typeof team === 'string') {
          return team;
        }
        if (team && typeof team === 'object' && '_id' in team && (team as { _id?: string })._id) {
          return (team as { _id: string })._id;
        }
        return null;
      })
      .filter((id): id is string => !!id);
    return ids.length > 0 ? ids[0] : null;
  }

  private pickTeamIdFromApiTeam(team: any): string | null {
    if (!team) {
      return null;
    }
    const id = team._id ?? team.id;
    return id != null && String(id).trim() !== '' ? String(id) : null;
  }

  /**
   * IDs de times derivados do perfil + sessão (para filtrar GET /team ou selector mínimo).
   */
  private computeAccessibleTeamIdsFromSession(profile: UserProfile, userTeams: unknown[]): string[] {
    let accessibleTeamIds = [...this.userProfileService.getAccessibleTeamIds()];

    if (accessibleTeamIds.length === 0 && userTeams.length > 0) {
      const userTeamIds = userTeams
        .map((team: unknown) => {
          if (typeof team === 'string') {
            return team;
          }
          if (team && typeof team === 'object' && team !== null && '_id' in team) {
            const id = (team as { _id?: string })._id;
            return id ?? null;
          }
          return null;
        })
        .filter((id): id is string => !!id);

      if (profile === UserProfile.GESTOR) {
        accessibleTeamIds = userTeamIds.filter((id) => id !== 'FkmdnFU');
      } else if (profile === UserProfile.SUPERVISOR) {
        accessibleTeamIds = userTeamIds.filter((id) => id !== 'Fkmdmko');
      } else {
        accessibleTeamIds = userTeamIds;
      }
    }

    if (accessibleTeamIds.length === 0) {
      const bwaTid = this.getBwaSessionTeamId();
      if (bwaTid) {
        accessibleTeamIds = [bwaTid];
      }
    }

    if (accessibleTeamIds.length === 0) {
      const ownTeamId = this.userProfileService.getCurrentUserOwnTeamId();
      if (ownTeamId) {
        accessibleTeamIds = [ownTeamId];
      }
    }

    return [...new Set(accessibleTeamIds.map((id) => String(id)))];
  }

  /** Junta várias respostas de GET /team/:id (sem duplicar por `_id`). */
  private mergeFetchedTeamDetails(results: Array<any | null>): any[] {
    const map = new Map<string, any>();
    for (const r of results) {
      if (r == null) {
        continue;
      }
      const rows = Array.isArray(r) ? r : [r];
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          continue;
        }
        const id = (row as { _id?: unknown; id?: unknown })._id ?? (row as { id?: unknown }).id;
        if (id == null || String(id).trim() === '') {
          continue;
        }
        map.set(String(id), row);
      }
    }
    return [...map.values()];
  }

  /** Identificadores do utilizador para cruzar com `leader` / `observers` na API BWA. */
  private getPanelUserIdentitySet(): Set<string> {
    const u = this.sessaoProvider.usuario as
      | { _id?: string; email?: string; user_id?: string; id?: string | number; uuid?: string }
      | null;
    const ids = new Set<string>();
    const add = (v: unknown) => {
      if (v == null) {
        return;
      }
      const s = String(v).trim();
      if (s !== '') {
        ids.add(s);
      }
    };
    add(u?._id);
    add(u?.email);
    add(u?.user_id);
    add(u?.id);
    add(u?.uuid);
    add(this.getPanelPlayerId());
    return ids;
  }

  private leaderOrObserverRefMatches(ref: unknown, identities: Set<string>): boolean {
    if (ref == null) {
      return false;
    }
    if (typeof ref === 'string' || typeof ref === 'number') {
      return identities.has(String(ref).trim());
    }
    if (typeof ref === 'object') {
      const o = ref as Record<string, unknown>;
      const cand = [o['_id'], o['id'], o['user_id'], o['email']];
      return cand.some((c) => c != null && identities.has(String(c).trim()));
    }
    return false;
  }

  /**
   * True se o utilizador atual for líder do time ou constar em `observers` (coluna BWA).
   */
  private isCurrentUserLeaderOrObserverOnTeam(team: Record<string, unknown>): boolean {
    const identities = this.getPanelUserIdentitySet();
    if (identities.size === 0) {
      return false;
    }
    const leaderKeys = [
      'leader',
      'leader_id',
      'leaderId',
      'gestor_id',
      'gestorId',
      'manager_id',
      'managerId',
      'gestor'
    ];
    for (const k of leaderKeys) {
      if (k in team && this.leaderOrObserverRefMatches(team[k], identities)) {
        return true;
      }
    }
    const obsRaw = team['observers'] ?? team['observer_ids'] ?? team['observerIds'];
    if (Array.isArray(obsRaw)) {
      for (const o of obsRaw) {
        if (this.leaderOrObserverRefMatches(o, identities)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Heurística BWA: equipa marcada como «célula» (sub-equipe dentro do time-pai).
   * Aceita `team_type`, `tipo`, flags `is_cell` / `celula` ou nome contendo «célula».
   */
  private isCellTeamRecord(team: Record<string, unknown>): boolean {
    const flags = ['is_cell', 'isCell', 'celula', 'cell', 'is_celula', 'isCelula'];
    for (const k of flags) {
      const v = team[k];
      if (v === true || v === 1 || v === '1') {
        return true;
      }
    }
    const typeKeys = ['team_type', 'teamType', 'tipo', 'type', 'kind'];
    for (const k of typeKeys) {
      const v = team[k];
      if (typeof v === 'string' && /celula|célula|cell/i.test(v.trim())) {
        return true;
      }
    }
    const extra = team['extra'];
    if (extra && typeof extra === 'object') {
      if (this.isCellTeamRecord(extra as Record<string, unknown>)) {
        return true;
      }
    }
    const name = String(team['name'] ?? team['nome'] ?? team['descricao'] ?? '').trim();
    return /célula|celula|\bcell\b/i.test(name);
  }

  /**
   * LIDER_CELULA: restringe o seletor à célula (equipa em que é líder/observer), não ao time-pai.
   */
  private filterAvailableTeamsForLiderCelula(
    availableTeams: Array<{ id: string; name: string; memberCount: number; game4uTeamId?: string }>,
    allTeams: any[]
  ): Array<{ id: string; name: string; memberCount: number; game4uTeamId?: string }> {
    const rawById = new Map<string, Record<string, unknown>>();
    for (const t of allTeams) {
      if (!t || typeof t !== 'object') {
        continue;
      }
      const id = (t as { _id?: unknown; id?: unknown })._id ?? (t as { id?: unknown }).id;
      if (id != null && String(id).trim() !== '') {
        rawById.set(String(id), t as Record<string, unknown>);
      }
    }

    const leaderTeams = availableTeams.filter(t => {
      const raw = rawById.get(t.id);
      return raw != null && this.isCurrentUserLeaderOrObserverOnTeam(raw);
    });
    if (leaderTeams.length > 0) {
      return leaderTeams;
    }

    const cellTagged = availableTeams.filter(t => {
      const raw = rawById.get(t.id);
      return raw != null && this.isCellTeamRecord(raw);
    });
    if (cellTagged.length > 0) {
      return cellTagged;
    }

    if (availableTeams.length === 2) {
      const withCounts = availableTeams.map(t => ({
        team: t,
        count: Math.max(0, Math.floor(Number(t.memberCount) || 0))
      }));
      withCounts.sort((a, b) => a.count - b.count);
      return [withCounts[0].team];
    }

    return availableTeams.length > 0 ? [availableTeams[0]] : [];
  }

  /** ADMIN na sessão (ROLES_LIST ou texto com "admin", case-insensitive). */
  private hasAdminSessionRole(): boolean {
    if (this.sessaoProvider.isAdmin()) {
      return true;
    }
    const roles = this.sessaoProvider.usuario?.roles;
    if (!Array.isArray(roles)) {
      return false;
    }
    return roles.some((r) => typeof r === 'string' && r.toLowerCase().includes('admin'));
  }

  /**
   * GESTOR: role na sessão, perfil por equipas, ou texto com "gestor" (case-insensitive).
   * Não usar quando {@link hasAdminSessionRole} já for true (prioridade ADMIN).
   */
  private hasGestorSessionOrProfile(): boolean {
    if (this.sessaoProvider.isGerente()) {
      return true;
    }
    if (this.userProfileService.getCurrentUserProfile() === UserProfile.GESTOR) {
      return true;
    }
    const roles = this.sessaoProvider.usuario?.roles;
    if (!Array.isArray(roles)) {
      return false;
    }
    return roles.some((r) => typeof r === 'string' && r.toLowerCase().includes('gestor'));
  }

  /**
   * Load all available teams from Funifier and filter by user profile.
   * 
   * Filtering logic based on profile:
   * - JOGADOR: No teams (should not reach here)
   * - SUPERVISOR: Only their own SUPERVISÃO team
   * - GESTOR: Their GESTAO team and potentially other teams they manage
   * - DIRETOR: All teams (no filtering)
   *
   * API BWA via {@link BwaTeamApiService} (`backend_url_base` + `/team`):
   * - ADMIN: apenas GET /team (lista)
   * - GESTOR: GET /team/{team_id} para cada time acessível (líder + observers na sessão / payload)
   * - Demais: lista + detalhe quando houver `team_id` (perfil, sessão ou 1.º da lista)
   * 
   * @private
   * @async
   * @returns Promise that resolves when teams are loaded
   */
  private async loadAvailableTeams(): Promise<void> {
    try {
      this.isLoadingTeams = true;
      
      const profile = this.userProfileService.getCurrentUserProfile();
      console.log('👤 User profile:', profile);
      
      // Debug: Log user's teams from session
      const userTeams = this.getUserTeamsRaw();
      console.log('👤 User teams from session:', userTeams);

      const isAdminRole = this.hasAdminSessionRole();
      const isGestorRole = this.hasGestorSessionOrProfile() && !isAdminRole;

      let allTeams: any[] = [];
      let teamDetailPayload: any | null = null;

      if (isAdminRole) {
        allTeams = await this.bwaTeamApi.fetchTeamList();
        this.teamDetailApiResponse = null;
        console.log('📊 ADMIN: apenas GET /team →', allTeams.length, 'times');
      } else if (isGestorRole) {
        // Preferir listar e filtrar por leader/observers quando possível (não depende de `observer_teams` em /auth/user)
        const listTeams = await this.bwaTeamApi.fetchTeamList();

        let detailIds = this.computeAccessibleTeamIdsFromSession(profile, userTeams);
        if (detailIds.length === 0) {
          const one = this.getTeamIdForDetailEndpoint();
          detailIds = one ? [one] : [];
        }

        if (listTeams.length > 0) {
          const idsFromSession = new Set(detailIds.map((id) => String(id)));
          allTeams = listTeams.filter((team: any) => {
            const teamId = team?._id ?? team?.id;
            if (teamId != null && idsFromSession.has(String(teamId))) {
              return true;
            }
            return this.isCurrentUserLeaderOrObserverOnTeam(team as Record<string, unknown>);
          });
          teamDetailPayload = allTeams.length > 0 ? allTeams[0] : null;
          console.log('📊 GESTOR: GET /team filtrado por leader/observers →', allTeams.length, 'times');
        } else if (detailIds.length > 0) {
          // Fallback: pedir detalhe por ids acessíveis vindos da sessão/perfil
          console.log('🔗 GESTOR: GET /team/:team_id para cada time acessível →', detailIds);
          const responses = await Promise.all(detailIds.map((id) => this.bwaTeamApi.fetchTeamDetail(id)));
          allTeams = this.mergeFetchedTeamDetails(responses);
          teamDetailPayload = allTeams.length > 0 ? allTeams[0] : null;
        } else {
          console.warn('⚠️ GESTOR: sem team_ids na sessão/perfil e sem lista de times — não é possível carregar times.');
          teamDetailPayload = null;
          allTeams = [];
        }

        this.teamDetailApiResponse = teamDetailPayload;
        if (allTeams.length > 0) {
          console.log('📊 GESTOR: times disponíveis (BWA):', allTeams.length);
        }
      } else {
        allTeams = await this.bwaTeamApi.fetchTeamList();

        const fromSessionOrProfile = this.getTeamIdForDetailEndpoint();
        const normalizedFromProfile =
          fromSessionOrProfile != null && String(fromSessionOrProfile).trim() !== ''
            ? String(fromSessionOrProfile).trim()
            : null;
        const detailTeamId =
          normalizedFromProfile ??
          (allTeams.length > 0 ? this.pickTeamIdFromApiTeam(allTeams[0]) : null);

        if (detailTeamId) {
          console.log('🔗 GET /team/:team_id →', detailTeamId);
          teamDetailPayload = await this.bwaTeamApi.fetchTeamDetail(detailTeamId);
        } else {
          console.warn('⚠️ Skipping GET /team/:team_id — no team_id (lista vazia e sem time na sessão).');
        }

        this.teamDetailApiResponse = teamDetailPayload;
        if (teamDetailPayload != null) {
          console.log('📊 GET /team/:team_id response:', detailTeamId, teamDetailPayload);
        }
      }

      console.log('📊 All teams (raw) para filtro:', allTeams.length, 'teams');
      
      let availableTeams: any[] = [];
      
      if (profile === UserProfile.DIRETOR) {
        // DIRETOR can see all teams
        availableTeams = allTeams.map((team: any) => {
          const g4u = this.pickGame4uNumericTeamIdFromRaw(team as Record<string, unknown>);
          return {
            id: team._id || team.id,
            name: team.name || team._id || team.id,
            memberCount: 0,
            ...(g4u ? { game4uTeamId: g4u } : {})
          };
        });
        console.log('✅ DIRETOR: Showing all teams:', availableTeams.length);
      } else {
        const accessibleTeamIds = this.computeAccessibleTeamIdsFromSession(profile, userTeams);
        console.log('👤 Accessible team IDs (perfil + sessão):', accessibleTeamIds);

        availableTeams = allTeams
          .filter((team: any) => {
            const teamId = team._id || team.id;
            if (teamId == null) {
              return false;
            }
            const idStr = String(teamId);
            if (accessibleTeamIds.includes(idStr)) {
              return true;
            }
            return (
              !isAdminRole && this.isCurrentUserLeaderOrObserverOnTeam(team as Record<string, unknown>)
            );
          })
          .map((team: any) => {
            const g4u = this.pickGame4uNumericTeamIdFromRaw(team as Record<string, unknown>);
            return {
              id: String(team._id || team.id),
              name: team.name || team._id || team.id,
              memberCount: 0,
              ...(g4u ? { game4uTeamId: g4u } : {})
            };
          });

        console.log('✅ Available teams for profile (intersect API):', profile, availableTeams.length);

        if (profile === UserProfile.LIDER_CELULA && availableTeams.length > 0) {
          const cellOnly = this.filterAvailableTeamsForLiderCelula(availableTeams, allTeams);
          if (cellOnly.length > 0) {
            availableTeams = cellOnly;
            console.log('✅ LIDER_CELULA: escopo reduzido à célula:', availableTeams.length);
          }
        }
      }

      // API devolveu times mas os ids da sessão não batem com _id (ex.: nomes legíveis vs Funifier)
      if (availableTeams.length === 0 && allTeams.length > 0) {
        console.warn(
          '[TeamManagement] Intersect vazio — a usar todos os times devolvidos pela API (acesso já validado no guard).'
        );
        availableTeams = allTeams
          .map((team: any) => {
            const rawId = team._id ?? team.id;
            if (rawId == null || String(rawId).trim() === '') {
              return null;
            }
            const g4u = this.pickGame4uNumericTeamIdFromRaw(team as Record<string, unknown>);
            return {
              id: String(rawId),
              name: String(team.name ?? team.nome ?? team.descricao ?? rawId),
              memberCount: 0,
              ...(g4u ? { game4uTeamId: g4u } : {})
            };
          })
          .filter(
            (t): t is { id: string; name: string; memberCount: number; game4uTeamId?: string } =>
              t !== null
          );
      }

      // API vazia ou GESTOR sem detalhe: selector mínimo só com ids da sessão/perfil
      if (availableTeams.length === 0) {
        const fallbackIds = this.computeAccessibleTeamIdsFromSession(profile, userTeams);
        if (fallbackIds.length > 0) {
          console.warn('[TeamManagement] A construir times só a partir da sessão/perfil:', fallbackIds);
          availableTeams = fallbackIds.map((id) => ({
            id,
            name: id,
            memberCount: 0
          }));
        }
      }

      this.managementRole = this.actionLogService.getManagementDashboardCachedRole();
      const hasManagementOverview =
        this.managementRole != null && this.playerService.usesGame4uWalletFromStats();
      if (hasManagementOverview) {
        const label = getManagementDashboardCachedRoleLabel(this.managementRole!);
        availableTeams = [
          {
            id: TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID,
            name: label,
            memberCount: 0
          },
          ...availableTeams
        ];
        console.log('✅ Painel agregado disponível:', label);
      }

      // Load member count for each team using aggregate queries
      const memberCountPromises = availableTeams.map(async (team) => {
        if (team.id === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID) {
          return team;
        }
        try {
          const aggregatePayload = [
            {
              $match: {
                teams: team.id
              }
            },
            {
              $count: 'total'
            }
          ];
          
          const result = await firstValueFrom(
            this.backendApi.post<any[]>(
              `/database/player/aggregate?strict=true`,
              aggregatePayload
            ).pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error(`Error loading member count for team ${team.id}:`, error);
            return [];
          });
          
          // Extract count from result
          const count = result && result.length > 0 && result[0].total ? result[0].total : 0;
          return { ...team, memberCount: count };
        } catch (error) {
          console.error(`Error processing member count for team ${team.id}:`, error);
          return { ...team, memberCount: 0 };
        }
      });
      
      // Wait for all member counts to be loaded
      const teamsWithCounts = await Promise.all(memberCountPromises);
      
      this.teams = teamsWithCounts;
      console.log('✅ Available teams loaded with member counts:', this.teams);
      
      this.isLoadingTeams = false;
    } catch (error) {
      console.error('Error in loadAvailableTeams:', error);
      this.teams = [];
      this.isLoadingTeams = false;
    }
  }

  /**
   * Load team members data (member IDs, points, tasks) from Funifier.
   * 
   * Uses POST aggregate query to /database/player/aggregate?strict=true
   * to filter players by team membership, then fetches status data and points for each member.
   * 
   * Points are calculated from action_log (escopo equipe + intervalo) × pontos por atividade (regra provisória).
   * Tasks are taken from extra.tarefas_finalizadas in player status.
   * Blocked points are taken from point_categories.locked_points in player status.
   * 
   * @private
   * @async
   * @param teamId - The Funifier team ID (e.g., 'FkmdnFU')
   * @returns Promise that resolves when team members data is loaded
   */
  private async loadTeamMembersData(teamId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      console.log('👥 Loading team members data for team:', teamId);
      
      // OPTIMIZED: Use single aggregate query on player_status to get all team members' data
      // This replaces individual player status requests with one batched request
      const aggregatePayload = [
        {
          $match: {
            teams: teamId
          }
        }
      ];
      
      // Fetch all player status data in batches using pagination
      const allPlayersStatus = await this.fetchAllPaginatedData<any>(
        '/database/player_status/aggregate?strict=true',
        aggregatePayload,
        100 // batch size
      );
      
      console.log('✅ Player status aggregate returned:', allPlayersStatus.length, 'players');
      
      // Store full player data from aggregate (includes extra.cnpj, name, email, point_categories, etc.)
      this.teamMembersData = allPlayersStatus;
      
      // Extract member IDs from aggregate result
      const memberIds = allPlayersStatus
        .map((player: any) => String(player._id))
        .filter((id: string) => id != null && id !== 'null' && id !== 'undefined');
      
      this.teamMemberIds = memberIds;
      console.log('✅ Team member IDs loaded via aggregate:', memberIds.length, 'members');
      
      if (memberIds.length === 0) {
        console.warn('⚠️ No members found in team');
        this.teamTotalPoints = 0;
        this.teamAveragePoints = 0;
        this.teamTotalTasks = 0;
        this.teamTotalBlockedPoints = 0;
        this.cdr.markForCheck();
        return;
      }
      
      // Process player status data directly from aggregate result
      // No need for individual requests - all data is already in allPlayersStatus
      let totalPoints = 0;
      let totalTasks = 0;
      let totalBlockedPoints = 0;
      let validMembers = 0;
      
      const actionCountByMember = await firstValueFrom(
        this.teamAggregateService
          .getTeamMemberActionLogCounts(teamId, dateRange.start, dateRange.end)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading per-member action_log counts:', error);
        return new Map<string, number>();
      });

      // Process each player's data from the aggregate result
      allPlayersStatus.forEach((status: any) => {
        const memberId = status._id;

        const actionCount = actionCountByMember.get(String(memberId)) || 0;
        const pointsForMonth = Math.floor(
          actionCount * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG
        );
        totalPoints += pointsForMonth;
        
        // Get tasks completed from extra.tarefas_finalizadas
        const tasks = status.extra?.tarefas_finalizadas || 0;
        totalTasks += tasks;
        
        // Get blocked points from status
        let blockedPoints = 0;
        if (status.point_categories?.locked_points) {
          if (typeof status.point_categories.locked_points === 'object' && status.point_categories.locked_points.total) {
            blockedPoints = status.point_categories.locked_points.total;
          } else if (typeof status.point_categories.locked_points === 'number') {
            blockedPoints = status.point_categories.locked_points;
          }
        } else if (status.point_wallet?.bloqueados) {
          blockedPoints = status.point_wallet.bloqueados;
        }
        totalBlockedPoints += blockedPoints;
        
        validMembers++;
        console.log(
          `📊 Member ${memberId}: ${pointsForMonth} points (action_log×${PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG}), ${tasks} tasks, ${blockedPoints} blocked points`
        );
      });
      
      // Calculate aggregated metrics (round down all values)
      this.teamTotalPoints = Math.floor(totalPoints);
      this.teamAveragePoints = validMembers > 0 ? Math.floor(totalPoints / validMembers) : 0;
      this.teamTotalTasks = Math.floor(totalTasks);
      this.teamTotalBlockedPoints = Math.floor(totalBlockedPoints);
      
      console.log('✅ Team aggregated data from members (OPTIMIZED):', {
        totalPoints: this.teamTotalPoints,
        averagePoints: this.teamAveragePoints,
        totalTasks: this.teamTotalTasks,
        totalBlockedPoints: this.teamTotalBlockedPoints,
        validMembers,
        selectedMonth: this.selectedMonth,
        apiCalls: 2 // Only 2 aggregate calls instead of N individual calls
      });
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadTeamMembersData:', error);
      this.teamTotalPoints = 0;
      this.teamAveragePoints = 0;
      this.teamTotalTasks = 0;
      this.teamTotalBlockedPoints = 0;
      this.cdr.markForCheck();
    }
  }

  /**
   * Fetch all data using pagination with Range header.
   * Automatically fetches all pages until complete.
   * 
   * @param endpoint - API endpoint
   * @param aggregatePayload - Aggregate pipeline array
   * @param batchSize - Number of items per batch
   * @returns Promise of all items
   */
  private async fetchAllPaginatedData<T>(
    endpoint: string,
    aggregatePayload: any[],
    batchSize: number = 100
  ): Promise<T[]> {
    const allResults: T[] = [];
    let startIndex = 0;
    let hasMore = true;
    
    while (hasMore) {
      const rangeHeader = `items=${startIndex}-${batchSize}`;
      console.log(`📦 Fetching batch: ${rangeHeader}`);
      
      try {
        const batchResults = await firstValueFrom(
          this.backendApi.post<T[]>(
            endpoint,
            aggregatePayload,
            { headers: { 'Range': rangeHeader } }
          ).pipe(takeUntil(this.destroy$))
        );
        
        if (batchResults && Array.isArray(batchResults)) {
          allResults.push(...batchResults);
          
          // If we got a full batch, there might be more
          if (batchResults.length === batchSize) {
            startIndex += batchSize;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Error fetching batch at index ${startIndex}:`, error);
        hasMore = false;
      }
    }
    
    console.log(`✅ Total items fetched: ${allResults.length}`);
    return allResults;
  }

  /**
   * Load all team data including sidebar metrics, collaborators, goals, and productivity.
   * 
   * This method orchestrates loading of all dashboard data by:
   * 1. Calculating the date range based on selected month
   * 2. Loading sidebar data (points and progress metrics) in parallel
   * 3. Loading collaborators list
   * 4. Loading goals data
   * 5. Loading productivity graph data
   * 6. Updating the last refresh timestamp
   * 
   * All data loading operations run in parallel using Promise.all for optimal performance.
   * 
   * @async
   * @returns Promise that resolves when all data is loaded
   * 
   * @example
   * // Called when team, collaborator, or month changes
   * await this.loadTeamData();
   * 
   * @see {@link loadSidebarData}
   * @see {@link loadCollaborators}
   * @see {@link loadGoalsData}
   * @see {@link loadProductivityData}
   */
  async loadTeamData(): Promise<void> {
    if (!this.selectedTeam || !this.selectedTeamId) {
      return;
    }
    
    try {
      // Sinaliza "refresh" por componente, sem overlay global
      // Sidebar é season-scoped; ao trocar mês, não queremos “piscar” loading se já houve 1ª carga.
      this.isLoadingSidebar = !this.sidebarLoadedOnce;
      this.isLoadingGoals = true;
      this.isLoadingCarteira = true;
      this.isLoadingKPIs = true;
      this.isLoadingCollaborators = true;
      this.isLoadingMonthlyPointsProgress = true;
      this.cdr.markForCheck();

      this.companyKpiService.prefetchGamificacaoSnapshot();

      // Month range: KPIs/carteira/metas; Season range: sidebar (pontos/temporada)
      const monthRange = this.calculateDateRange();
      const seasonRange = this.seasonDates;
      
      // If a collaborator is selected, load only that collaborator's data
      if (this.selectedCollaborator) {
        console.log('👤 Loading data for selected collaborator:', this.selectedCollaborator);
        await this.loadCollaboratorData(this.selectedCollaborator, monthRange);
      } else {
        // Otherwise, load team aggregated data
        console.log('👥 Loading team aggregated data');
        this.teamSupervisionBundle = null;
        if (this.playerService.usesGame4uWalletFromStats()) {
          await this.loadTeamDashboardFromCache();
        } else {
          this.teamSupervisionCacheMissing = false;
          this.teamDashboardRefreshedAt = null;
          this.teamDashboardCachedParams = null;
          this.teamMonthOnTimeDeliveryPct = null;
        }
        // First, reload team members data to recalculate points for the selected month
        // This is important when the month changes, as points need to be recalculated
        await this.loadTeamMembersData(this.selectedTeamId, monthRange);

        if (!this.playerService.usesGame4uWalletFromStats() && !this.teamSupervisionBundle) {
          await this.loadTeamActivityAndMacroData(monthRange);
        }
        
        // Load data in parallel, but KPIs need carteira data first
        await Promise.all([
          this.loadSidebarData(seasonRange),
          this.loadCollaborators(),
          this.loadGoalsData(monthRange),
          this.loadMonthlyPointsBreakdown()
        ]);

        // Productivity charts are loaded only when the user clicks the tab.
        if (this.activeTab === 'productivity') {
          await this.loadProductivityData(this.computeProductivityDateRange());
        }
        
        // Load carteira data first, then KPIs (which depend on carteira)
        await this.loadTeamCarteiraData(monthRange);
        await this.loadTeamKPIs();

        // Mini dashboard executivo (top processos / top performers / saúde do mês)
        // — alimentado pelo cache `finished/deliveries/cached` por team_id.
        void this.loadExecutiveInsights();
        this.warmProgressModalUserActionsCache();

        // Update formatted sidebar data after KPIs are loaded (includes metas calculation)
        this.updateFormattedSidebarData();
        
        // Update team name display after loading collaborators
        this.updateTeamNameDisplay();
      }
      
      this.lastRefresh = new Date();
    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      this.cdr.markForCheck();
    }
  }

  /**
   * Load data for a specific collaborator (instead of team aggregated data)
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when collaborator data is loaded
   */
  private async loadCollaboratorData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      console.log('👤 Loading data for collaborator:', collaboratorId);
      
      // Load collaborator-specific data in parallel
      const baseLoads: Array<Promise<void>> = [
        this.loadCollaboratorSidebarData(collaboratorId, dateRange),
        this.loadCollaborators(), // Still load collaborators list
        this.loadCollaboratorGoalsData(collaboratorId, dateRange),
        this.loadMonthlyPointsBreakdown(collaboratorId)
      ];

      // Productivity charts are loaded only when the user clicks the tab.
      if (this.activeTab === 'productivity') {
        baseLoads.push(this.loadCollaboratorProductivityData(collaboratorId, this.computeProductivityDateRange()));
      }

      await Promise.all(baseLoads);
      
      // Load carteira data first, then KPIs (which depend on carteira)
      await this.loadCollaboratorCarteiraData(collaboratorId, dateRange);
      await this.loadTeamKPIs(collaboratorId);

      // Mini dashboard executivo do colaborador (top processos / saúde no mês).
      void this.loadExecutiveInsights();
      this.warmProgressModalUserActionsCache();

      // Update formatted sidebar data after KPIs are loaded (includes metas calculation)
      this.updateFormattedSidebarData();
      
      // Update team name display after loading collaborators
      this.updateTeamNameDisplay();
      
      this.cdr.markForCheck();
      
      console.log('✅ Collaborator data loaded for:', collaboratorId);
    } catch (error) {
      console.error('Error loading collaborator data:', error);
    }
  }

  /**
   * Calculate date range based on selected month.
   * 
   * Uses the selectedMonthsAgo property to calculate the start and end dates.
   * Ensures data is pulled from 01/01/2026 onwards.
   * 
   * Logic:
   * - When February is selected (selectedMonthsAgo = 0, if current month is February):
   *   Includes both January and February (01/01/2026 to end of February)
   * - When January is selected (selectedMonthsAgo = 1, if current month is February):
   *   Returns only January (01/01/2026 to 31/01/2026)
   * - For other months: Returns only the selected month
   * 
   * Minimum date is always 01/01/2026.
   * 
   * @private
   * @returns Object containing start and end dates
   * 
   * @example
   * // February selected (current month)
   * this.selectedMonthsAgo = 0;
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2026-01-01), end: Date(2026-02-28) }
   * 
   * // January selected
   * this.selectedMonthsAgo = 1;
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2026-01-01), end: Date(2026-01-31) }
   */
  private calculateDateRange(): { start: Date; end: Date } {
    // Toda temporada: no date boundaries
    if (!this.selectedMonth) {
      return {
        start: new Date('2000-01-01T00:00:00.000Z'),
        end: new Date('2099-12-31T23:59:59.999Z')
      };
    }
    
    const now = dayjs();
    const targetMonth = now.subtract(this.selectedMonthsAgo, 'month');
    const seasonStartDate = dayjs('2026-01-01');
    
    // Check if the target month is January or February 2026
    const targetYear = targetMonth.year();
    const targetMonthNum = targetMonth.month(); // 0-indexed: 0 = January, 1 = February
    const isJanuary2026 = targetYear === 2026 && targetMonthNum === 0;
    const isFebruary2026 = targetYear === 2026 && targetMonthNum === 1;
    
    // If February 2026 is selected, include January as well
    if (isFebruary2026) {
      return {
        start: seasonStartDate.toDate(), // 01/01/2026
        end: targetMonth.endOf('month').toDate() // End of February 2026
      };
    }
    
    // If January 2026 is selected, return only January
    if (isJanuary2026) {
      return {
        start: seasonStartDate.toDate(), // 01/01/2026
        end: targetMonth.endOf('month').toDate() // 31/01/2026
      };
    }
    
    // For other months, return only the selected month
    // But ensure start date is not before season start
    const monthStart = targetMonth.startOf('month');
    const startDate = monthStart.isBefore(seasonStartDate) ? seasonStartDate : monthStart;
    
    return {
      start: startDate.toDate(),
      end: targetMonth.endOf('month').toDate()
    };
  }

  /**
   * Load sidebar data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when sidebar data is loaded
   */
  private async loadCollaboratorSidebarData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingSidebar = !this.sidebarLoadedOnce;
      this.isLoadingMonthlyPointsProgress = true;
      this.hasSidebarError = false;
      this.sidebarErrorMessage = '';
      this.monthlyPointsGoalTarget = null;
      this.teamSidebarDeliveryStatsTotal = undefined;
      
      console.log('📊 Loading sidebar data for collaborator:', collaboratorId);
      
      const emptyMetrics = {
        activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
        processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
      };

      let metrics = emptyMetrics;
      let snap: {
        wallet: { moedas: number; bloqueados: number; desbloqueados: number };
        sidebar: { tarefasFinalizadas: number; deliveryStatsTotal?: number };
      } | null = null;

      if (this.playerService.usesGame4uWalletFromStats()) {
        const bundle = await firstValueFrom(
          this.actionLogService
            .getGamificationDashboardCachedBundle(collaboratorId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error: unknown) => {
          console.error('Error loading collaborator dashboard/cached:', error);
          this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
          return null;
        });
        if (bundle) {
          metrics = { activity: bundle.activity, processo: bundle.processo };
          const g = Math.floor(Number(bundle.monthlyGoalTarget) || 0);
          this.monthlyPointsGoalTarget = g > 0 ? g : null;
          const pts = bundle.seasonWalletPoints;
          snap = {
            wallet: { moedas: 0, bloqueados: 0, desbloqueados: pts },
            sidebar: {
              tarefasFinalizadas: bundle.seasonTasksFinished,
              ...(bundle.seasonClientsTotal > 0
                ? { deliveryStatsTotal: bundle.seasonClientsTotal }
                : {})
            }
          };
        } else {
          metrics = emptyMetrics;
          this.monthlyPointsGoalTarget = null;
        }
      } else {
        metrics = await lastValueFrom(
          this.actionLogService
            .getProgressMetrics(collaboratorId, this.selectedMonth, {
              gamificationDashboardReportsOnly: true,
              teamId: this.getGame4uTeamScopeId()
            })
            .pipe(takeUntil(this.destroy$), last())
        ).catch((error: unknown) => {
          console.error('Error loading collaborator progress metrics:', error);
          this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Erro ao carregar métricas de progresso';
          return emptyMetrics;
        });
        this.monthlyPointsGoalTarget = null;
      }

      const blockedPoints = 0;

      if (snap) {
        const w = snap.wallet;
        this.seasonPoints = {
          total: Math.floor(w.desbloqueados + w.bloqueados),
          bloqueados: Math.floor(w.bloqueados),
          desbloqueados: Math.floor(w.desbloqueados)
        };
        const dc = snap.sidebar?.deliveryStatsTotal;
        if (typeof dc === 'number' && Number.isFinite(dc)) {
          this.teamSidebarDeliveryStatsTotal = Math.floor(dc);
        }
      } else {
        const totalPoints = metrics.activity.pontos;
        const unlockedPoints = Math.max(0, totalPoints - blockedPoints);
        this.seasonPoints = {
          total: Math.floor(totalPoints),
          bloqueados: Math.floor(blockedPoints),
          desbloqueados: Math.floor(unlockedPoints)
        };
      }

      this.progressMetrics = {
        processosIncompletos: Math.floor(metrics.processo.incompletas),
        atividadesFinalizadas: Math.floor(metrics.activity.finalizadas),
        processosFinalizados: Math.floor(metrics.processo.finalizadas)
      };

      const totalPointsForTotals = snap
        ? snap.wallet.desbloqueados + snap.wallet.bloqueados
        : metrics.activity.pontos;

      const actExt = metrics.activity as ActivityMetrics & {
        pontosDone?: number;
        pontosTodosStatus?: number;
      };
      this.teamActivityMetrics = {
        pendentes: actExt.pendentes,
        emExecucao: actExt.emExecucao,
        finalizadas: actExt.finalizadas,
        pontos: Math.floor(actExt.pontos),
        ...(typeof actExt.pontosDone === 'number' && typeof actExt.pontosTodosStatus === 'number'
          ? { pontosDone: actExt.pontosDone, pontosTodosStatus: actExt.pontosTodosStatus }
          : {})
      };

      this.teamProcessMetrics = {
        pendentes: metrics.processo.pendentes,
        incompletas: metrics.processo.incompletas,
        finalizadas: metrics.processo.finalizadas
      };

      this.teamTotalPoints = Math.floor(totalPointsForTotals);
      this.teamAveragePoints = Math.floor(totalPointsForTotals);
      this.teamTotalTasks = Math.floor(metrics.activity.finalizadas);
      this.teamTotalBlockedPoints = Math.floor(blockedPoints);

      this.updateFormattedSidebarData();

      this.isLoadingSidebar = false;
      this.sidebarLoadedOnce = true;
      this.isLoadingMonthlyPointsProgress = false;

      console.log('✅ Collaborator sidebar data loaded:', {
        points: this.seasonPoints,
        metrics: this.progressMetrics,
        collaboratorId
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadCollaboratorSidebarData:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
      this.isLoadingMonthlyPointsProgress = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Game4U: supervisão por equipa (GESTOR/SUPERVISOR ou drill-down do gestor numa equipa real)
   * ou gestão agregada (GERENTE/DIRETOR/C_LEVEL no «Painel do …», sem `team_id`).
   *
   * Sempre que houver um `team_id` selecionado, usa `supervision/dashboard/cached?team_id=` para
   * que a sidebar reflita os KPIs **daquela equipa**.
   */
  private async loadTeamDashboardFromCache(): Promise<void> {
    if (this.isManagementOverview) {
      await this.loadManagementOverviewFromCache();
      return;
    }
    await this.loadTeamSupervisionFromCache();
  }

  /**
   * `GET /game/reports/management/dashboard/cached/overview` — KPIs agregados do gestor.
   */
  private async loadManagementOverviewFromCache(): Promise<void> {
    const month = this.selectedMonth;
    this.teamSupervisionCacheMissing = false;
    this.teamDashboardRefreshedAt = null;
    this.teamDashboardCachedParams = null;
    this.teamMonthOnTimeDeliveryPct = null;
    this.teamSupervisionBundle = null;

    if (month == null) {
      return;
    }

    try {
      const bundle = await firstValueFrom(
        this.actionLogService
          .getManagementDashboardCachedBundle(month)
          .pipe(takeUntil(this.destroy$))
      );
      if (!bundle) {
        this.teamSupervisionCacheMissing = true;
        this.teamActivityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
        this.teamProcessMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
        this.monthlyPointsGoalTarget = null;
        this.clientesAtendidosThisMonthCount = null;
        return;
      }

      this.teamSupervisionBundle = bundle;
      this.applyTeamSupervisionBundle(bundle);
      const refreshed = bundle.refreshedAt ? new Date(bundle.refreshedAt) : null;
      this.teamDashboardRefreshedAt = refreshed && !Number.isNaN(refreshed.getTime()) ? refreshed : null;
      this.teamDashboardCachedParams = bundle.params;
      this.teamMonthOnTimeDeliveryPct = bundle.monthOnTimeDeliveryPct;
      this.teamSupervisionCacheMissing = false;
      this.isLoadingMonthlyPointsProgress = false;
    } catch (error) {
      console.error('Error loading management/dashboard/cached/overview:', error);
      this.teamSupervisionCacheMissing = month != null;
      this.teamMonthOnTimeDeliveryPct = null;
    }
  }

  /**
   * Carrega `GET /game/reports/supervision/dashboard/cached` e aplica métricas da vista equipa agregada.
   */
  private async loadTeamSupervisionFromCache(): Promise<void> {
    const scope = this.getGame4uTeamScopeId() ?? '';
    const month = this.selectedMonth;
    this.teamSupervisionCacheMissing = false;
    this.teamDashboardRefreshedAt = null;
    this.teamDashboardCachedParams = null;
    this.teamMonthOnTimeDeliveryPct = null;
    this.teamSupervisionBundle = null;

    if (!scope || month == null) {
      return;
    }

    try {
      const bundle = await firstValueFrom(
        this.actionLogService
          .getSupervisionTeamDashboardCachedBundle(scope, month)
          .pipe(takeUntil(this.destroy$))
      );
      if (!bundle) {
        this.teamSupervisionCacheMissing = true;
        this.teamActivityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
        this.teamProcessMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
        this.monthlyPointsGoalTarget = null;
        this.clientesAtendidosThisMonthCount = null;
        return;
      }

      this.teamSupervisionBundle = bundle;
      this.applyTeamSupervisionBundle(bundle);
      const refreshed = bundle.refreshedAt ? new Date(bundle.refreshedAt) : null;
      this.teamDashboardRefreshedAt = refreshed && !Number.isNaN(refreshed.getTime()) ? refreshed : null;
      this.teamDashboardCachedParams = bundle.params;
      this.teamMonthOnTimeDeliveryPct = bundle.monthOnTimeDeliveryPct;
      this.teamSupervisionCacheMissing = false;
      this.isLoadingMonthlyPointsProgress = false;
    } catch (error) {
      console.error('Error loading supervision/dashboard/cached:', error);
      this.teamSupervisionCacheMissing = month != null;
      this.teamMonthOnTimeDeliveryPct = null;
    }
  }

  private applyTeamSupervisionBundle(bundle: SupervisionTeamDashboardCachedBundle): void {
    this.teamActivityMetrics = {
      pendentes: bundle.activity.pendentes,
      emExecucao: bundle.activity.emExecucao,
      finalizadas: bundle.activity.finalizadas,
      pontos: Math.floor(bundle.activity.pontos),
      ...(bundle.activity.pontosDone !== undefined && bundle.activity.pontosTodosStatus !== undefined
        ? {
            pontosDone: bundle.activity.pontosDone,
            pontosTodosStatus: bundle.activity.pontosTodosStatus
          }
        : {})
    };
    this.teamProcessMetrics = {
      pendentes: bundle.processo.pendentes,
      incompletas: bundle.processo.incompletas,
      finalizadas: bundle.processo.finalizadas
    };
    const g = Math.floor(Number(bundle.monthlyGoalTarget) || 0);
    this.monthlyPointsGoalTarget = g > 0 ? g : null;
    if (this.selectedMonth != null) {
      this.clientesAtendidosThisMonthCount = bundle.monthClientsServed;
      this.isLoadingClientesAtendidosCount = false;
    }
    const pts = bundle.seasonWalletPoints;
    this.seasonPoints = {
      total: pts,
      bloqueados: 0,
      desbloqueados: pts
    };
    if (bundle.seasonClientsTotal > 0) {
      this.teamSidebarDeliveryStatsTotal = bundle.seasonClientsTotal;
    }
    this.progressMetrics = {
      processosIncompletos: Math.floor(bundle.processo.incompletas),
      atividadesFinalizadas: bundle.seasonTasksFinished,
      processosFinalizados: Math.floor(bundle.processo.finalizadas)
    };
  }

  /**
   * Load sidebar data (season points and progress metrics)
   */
  private async loadSidebarData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingSidebar = !this.sidebarLoadedOnce;
      this.hasSidebarError = false;
      this.sidebarErrorMessage = '';
      this.teamSidebarDeliveryStatsTotal = undefined;

      console.log('📊 Loading sidebar data for team:', this.selectedTeam);
      this.monthlyPointsGoalTarget = null;

      if (this.playerService.usesGame4uWalletFromStats()) {
        if (!this.selectedTeam) {
          this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Nenhuma equipa selecionada para dados Game4U';
          this.isLoadingSidebar = false;
          this.cdr.markForCheck();
          return;
        }
        if (this.teamSupervisionBundle) {
          this.applyTeamSupervisionBundle(this.teamSupervisionBundle);
        } else {
          this.teamSupervisionCacheMissing = this.selectedMonth != null;
          this.monthlyPointsGoalTarget = null;
          this.seasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
          this.progressMetrics = {
            processosIncompletos: 0,
            atividadesFinalizadas: 0,
            processosFinalizados: 0
          };
        }
      } else {
        const [points, metrics] = await Promise.all([
          firstValueFrom(
            this.teamAggregateService
              .getTeamSeasonPoints(this.getGame4uTeamHttpParam(), dateRange.start, dateRange.end)
              .pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error('Error loading season points:', error);
            this.hasSidebarError = true;
            this.sidebarErrorMessage = 'Erro ao carregar pontos da temporada';
            return { total: 0, bloqueados: 0, desbloqueados: 0 };
          }),
          firstValueFrom(
            this.teamAggregateService
              .getTeamProgressMetrics(this.getGame4uTeamHttpParam(), dateRange.start, dateRange.end)
              .pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error('Error loading progress metrics:', error);
            this.hasSidebarError = true;
            this.sidebarErrorMessage = 'Erro ao carregar métricas de progresso';
            return {
              processosIncompletos: 0,
              atividadesFinalizadas: 0,
              processosFinalizados: 0
            };
          })
        ]);

        const unlockedPoints = Math.max(0, this.teamTotalPoints - this.teamTotalBlockedPoints);

        this.seasonPoints = {
          total: Math.floor(this.teamTotalPoints),
          bloqueados: Math.floor(
            this.teamTotalBlockedPoints > 0 ? this.teamTotalBlockedPoints : points.bloqueados
          ),
          desbloqueados: Math.floor(unlockedPoints > 0 ? unlockedPoints : this.teamTotalPoints)
        };

        this.progressMetrics = {
          processosIncompletos: Math.floor(this.teamProcessMetrics.incompletas || metrics.processosIncompletos),
          atividadesFinalizadas: Math.floor(
            this.teamActivityMetrics.finalizadas || this.teamTotalTasks || metrics.atividadesFinalizadas
          ),
          processosFinalizados: Math.floor(this.teamProcessMetrics.finalizadas || metrics.processosFinalizados)
        };
      }

      this.updateFormattedSidebarData();

      this.isLoadingSidebar = false;
      this.sidebarLoadedOnce = true;

      console.log('✅ Sidebar data loaded:', {
        points: this.seasonPoints,
        metrics: this.progressMetrics,
        teamActivityMetrics: this.teamActivityMetrics,
        teamProcessMetrics: this.teamProcessMetrics
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadSidebarData:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
    }
  }

  /**
   * Membros do seletor: prioridade a `BwaTeamApiService.fetchTeamUsers` (`GET /team/{id}/users`).
   * Fallback: aggregate `player_status` / action_log (Funifier) como antes.
   */
  private mapBwaTeamUsersToCollaborators(raw: any[]): Collaborator[] {
    const out: Collaborator[] = [];
    for (const u of raw) {
      if (u == null || typeof u !== 'object') {
        continue;
      }
      if (u.deactivated_at != null && String(u.deactivated_at).trim() !== '') {
        continue;
      }
      const email = String(u.email ?? u.user_email ?? '').trim();
      const id = String(u._id ?? u.id ?? '').trim();
      const userId = email || id;
      if (!userId) {
        continue;
      }
      const nameRaw = u.name ?? u.full_name ?? u.fullName ?? userId;
      const name = String(nameRaw).trim() || userId;
      out.push({
        userId,
        name,
        email: email || userId
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    return out;
  }

  /**
   * Load collaborators for selected team
   *
   * 1) GET `/team/{id}/users` (BWA) — lista oficial para o gestor alternar colaboradores.
   * 2) Dados já carregados em `loadTeamMembersData`, ou aggregate Funifier, ou IDs.
   */
  private async loadCollaborators(): Promise<void> {
    try {
      this.isLoadingCollaborators = true;
      console.log('👥 Loading collaborators for team:', this.selectedTeam, 'id:', this.selectedTeamId);

      let list: Collaborator[] = [];
      if (this.selectedTeamId?.trim()) {
        const raw = await this.bwaTeamApi.fetchTeamUsers(this.selectedTeamId.trim());
        list = this.mapBwaTeamUsersToCollaborators(raw);
        if (list.length > 0) {
          this.collaborators = list;
          console.log('✅ Collaborators from GET /team/{id}/users:', this.collaborators.length);
        }
      }

      if (list.length === 0) {
        if (this.teamMembersData.length > 0) {
          this.collaborators = this.teamMembersData.map((playerStatus: any) => ({
            userId: playerStatus._id,
            name: playerStatus.name || playerStatus._id,
            email: playerStatus._id
          }));
          console.log(
            '✅ Collaborators from player_status aggregate:',
            this.collaborators.length
          );
        } else if (this.teamMemberIds.length === 0) {
          console.warn('⚠️ No member data available, trying action_log aggregate');
          const members = await firstValueFrom(
            this.teamAggregateService
              .getTeamMembers(this.selectedTeam)
              .pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error('Error loading collaborators:', error);
            return [];
          });
          this.collaborators = members;
        } else {
          this.collaborators = this.teamMemberIds.map(memberId => ({
            userId: memberId,
            name: memberId,
            email: memberId
          }));
          console.log('⚠️ Using fallback collaborator data from member IDs');
        }
      }

      // Validate current selection exists in the list
      if (this.selectedCollaborator) {
        const collaboratorExists = this.collaborators.find(c => c.userId === this.selectedCollaborator);
        if (!collaboratorExists) {
          console.warn('⚠️ Selected collaborator not found in list, resetting to team view');
          this.selectedCollaborator = null;
        }
      }

      this.isLoadingCollaborators = false;
      console.log('✅ Collaborators loaded:', this.collaborators.length);
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadCollaborators:', error);
      this.collaborators = [];
      this.isLoadingCollaborators = false;
    }
  }

  /**
   * Load goals data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when goals data is loaded
   */
  private async loadCollaboratorGoalsData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingGoals = true;
      this.hasGoalsError = false;
      this.goalsErrorMessage = '';
      
      console.log('📊 Loading goals data for collaborator:', collaboratorId);
      
      // Get progress metrics for the collaborator
      const metrics = await lastValueFrom(
        this.actionLogService
          .getProgressMetrics(collaboratorId, this.selectedMonth, {
            gamificationDashboardReportsOnly: true,
            teamId: this.getGame4uTeamScopeId()
          })
          .pipe(takeUntil(this.destroy$), last())
      ).catch((error) => {
        console.error('Error loading collaborator progress metrics for goals:', error);
        return {
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        };
      });
      
      // Create goal metrics from collaborator's progress metrics
      this.goalMetrics = [
        {
          id: 'processos-finalizados',
          label: 'Processos Finalizados',
          current: metrics.processo.finalizadas,
          target: 100, // TODO: Get from configuration
          unit: ''
        },
        {
          id: 'atividades-finalizadas',
          label: 'Atividades Finalizadas',
          current: metrics.activity.finalizadas,
          target: 500, // TODO: Get from configuration
          unit: ''
        }
      ];
      
      this.isLoadingGoals = false;
      console.log('✅ Collaborator goals data loaded:', this.goalMetrics);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator goals data:', error);
      this.goalMetrics = [];
      this.isLoadingGoals = false;
      this.hasGoalsError = true;
      this.goalsErrorMessage = 'Erro ao carregar dados de metas';
    }
  }

  /**
   * Load goals data
   */
  private async loadGoalsData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingGoals = true;
      this.hasGoalsError = false;
      this.goalsErrorMessage = '';
      
      // Create goal metrics from progress metrics
      // In a real implementation, you might have separate goal targets configured
      this.goalMetrics = [
        {
          id: 'processos-finalizados',
          label: 'Processos Finalizados',
          current: this.progressMetrics.processosFinalizados,
          target: 100, // TODO: Get from configuration
          unit: ''
        },
        {
          id: 'atividades-finalizadas',
          label: 'Atividades Finalizadas',
          current: this.progressMetrics.atividadesFinalizadas,
          target: 500, // TODO: Get from configuration
          unit: ''
        }
      ];
      
      this.isLoadingGoals = false;
    } catch (error) {
      console.error('Error loading goals data:', error);
      this.goalMetrics = [];
      this.isLoadingGoals = false;
      this.hasGoalsError = true;
      this.goalsErrorMessage = 'Erro ao carregar dados de metas';
    }
  }

  /**
   * Load productivity graph data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when productivity data is loaded
   */
  private async loadCollaboratorProductivityData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    if (!this.productivityAnalysisTabEnabled) {
      return;
    }
    try {
      this.isLoadingProductivity = true;
      this.hasProductivityError = false;
      this.productivityErrorMessage = '';
      
      console.log('📈 Loading productivity data for collaborator:', collaboratorId);
      
      // Get collaborator name for the label
      const collaborator = this.collaborators.find(c => c.userId === collaboratorId);
      const memberName = this.formatCollaboratorName(collaboratorId, collaborator?.name);
      
      const startDate = dayjs(dateRange.start).startOf('day');
      const endDate = dayjs(dateRange.end).endOf('day');
      
      const teamTid = this.getGame4uReportTeamId();
      const dailyRows = teamTid
        ? await firstValueFrom(
            this.actionLogService
              .getReportTeamDailyFinishedStats({
                team_id: teamTid,
                email: collaboratorId,
                start: startDate.toISOString(),
                end: endDate.toISOString()
              })
              .pipe(takeUntil(this.destroy$))
          )
        : [];

      // Convert to GraphDataPoint format (activities) + keep a points map
      const dataPoints: GraphDataPoint[] = [];
      const dataMap = new Map<string, number>();
      const pointsMap = new Map<string, number>();
      
      dailyRows.forEach((row: any) => {
        const dateStr = String(row?.day ?? '').trim();
        if (!dateStr) return;
        const count = Math.floor(Number(row?.tasksCount ?? 0) || 0);
        const pts = Math.floor(Number(row?.pointsSum ?? 0) || 0);
        dataMap.set(dateStr, count);
        pointsMap.set(dateStr, pts);
      });
      
      // Fill all dates in range
      let currentDate = startDate;
      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        dataPoints.push({
          date: currentDate.toDate(),
          value: dataMap.get(dateStr) || 0
        });
        currentDate = currentDate.add(1, 'day');
      }
      
      // Create a single dataset for the collaborator (activities)
      this.graphData = dataPoints;
      this.graphDatasets = [
        {
          label: memberName,
          data: dataPoints.map(p => p.value),
          borderColor: '#4F46E5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true
        }
      ];
      
      // Calculate totals for single collaborator bar charts
      const activitiesTotal = dataPoints.reduce((sum, point) => sum + point.value, 0);
      this.activitiesByCollaboratorGraphData = [{ date: new Date(), value: activitiesTotal }];
      this.activitiesByCollaboratorDatasets = [{
        label: 'Total de Atividades',
        data: [activitiesTotal],
        backgroundColor: ['rgba(79, 70, 229, 0.6)'],
        borderColor: ['rgba(79, 70, 229, 1)'],
        borderWidth: 1
      }];
      // For single collaborator, percentage is always 100%
      this.activitiesByCollaboratorLabels = [`${memberName} - ${activitiesTotal} (100%)`];
      
      // Load points data for the same period (prefer API points_sum; fallback = count × constante)
      await this.loadCollaboratorPointsData(startDate, endDate, memberName, dataMap, pointsMap);

      this.rebuildProductivityTables();
      
      this.isLoadingProductivity = false;
      console.log('✅ Collaborator productivity data loaded:', {
        dataPoints: dataPoints.length,
        totalActions: dataPoints.reduce((sum, p) => sum + p.value, 0)
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator productivity data:', error);
      this.graphData = [];
      this.graphDatasets = [];
      this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
      this.activitiesByCollaboratorGraphData = [];
      this.activitiesByCollaboratorDatasets = [];
      this.activitiesByCollaboratorLabels = [];
      this.pointsByCollaboratorGraphData = [];
      this.pointsByCollaboratorDatasets = [];
      this.pointsByCollaboratorLabels = [];
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
      this.isLoadingProductivity = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Pontos diários = atividades no action_log (já agregadas em dailyActivities) × constante (regra provisória).
   */
  private async loadCollaboratorPointsData(
    startDate: dayjs.Dayjs,
    endDate: dayjs.Dayjs,
    memberName: string,
    dailyActivities: Map<string, number>,
    dailyPoints?: Map<string, number>
  ): Promise<void> {
    try {
      const pointsDataPoints: GraphDataPoint[] = [];

      let currentDate = startDate;
      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        const count = dailyActivities.get(dateStr) || 0;
        const pointsFromApi = dailyPoints?.get(dateStr);
        pointsDataPoints.push({
          date: currentDate.toDate(),
          value:
            typeof pointsFromApi === 'number' && Number.isFinite(pointsFromApi)
              ? Math.floor(pointsFromApi)
              : Math.floor(count * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG)
        });
        currentDate = currentDate.add(1, 'day');
      }
      
      // Create a single dataset for the collaborator (points)
      this.pointsGraphData = pointsDataPoints;
      this.pointsGraphDatasets = [
        {
          label: memberName,
          data: pointsDataPoints.map(p => p.value),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true
        }
      ];
      
      // Calculate totals for single collaborator points bar chart
      const pointsTotal = Math.floor(pointsDataPoints.reduce((sum, point) => sum + point.value, 0));
      this.pointsByCollaboratorGraphData = [{ date: new Date(), value: pointsTotal }];
      this.pointsByCollaboratorDatasets = [{
        label: 'Total de Pontos',
        data: [pointsTotal],
        backgroundColor: ['rgba(16, 185, 129, 0.6)'],
        borderColor: ['rgba(16, 185, 129, 1)'],
        borderWidth: 1
      }];
      // For single collaborator, percentage is always 100%
      this.pointsByCollaboratorLabels = [`${memberName} - ${pointsTotal} (100%)`];
      
      console.log('✅ Collaborator points data loaded:', {
        dataPoints: pointsDataPoints.length,
        totalPoints: pointsDataPoints.reduce((sum, p) => sum + p.value, 0)
      });
    } catch (error) {
      console.error('Error loading collaborator points data:', error);
      this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
    }
  }

  /** Modo de agrupamento dos gráficos de produtividade conforme papel do utilizador. */
  private getProductivitySegmentationMode(): ProductivitySegmentationMode {
    return resolveProductivitySegmentationMode({
      isManagementOverview: this.isManagementOverview,
      managementRole: this.managementRole,
      userProfile: this.userProfileService.getCurrentUserProfile(),
      isLiderCelula: this.userProfileService.isLiderCelula(),
      isSupervisor: this.userProfileService.isSupervisor(),
      sessionIsGerente: !!this.sessaoProvider.isGerente()
    });
  }

  private clearProductivityCharts(): void {
    this.graphData = [];
    this.graphDatasets = [];
    this.pointsGraphData = [];
    this.pointsGraphDatasets = [];
    this.activitiesByCollaboratorGraphData = [];
    this.activitiesByCollaboratorDatasets = [];
    this.activitiesByCollaboratorLabels = [];
    this.pointsByCollaboratorGraphData = [];
    this.pointsByCollaboratorDatasets = [];
    this.pointsByCollaboratorLabels = [];
  }

  private async fetchTeamDailyFinishedStatsRows(
    teamId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<TeamDailyFinishedStatsRow[]> {
    const startDate = dayjs(dateRange.start).startOf('day');
    const endDate = dayjs(dateRange.end).endOf('day');
    return firstValueFrom(
      this.actionLogService
        .getReportTeamDailyFinishedStats({
          team_id: teamId,
          start: startDate.toISOString(),
          end: endDate.toISOString()
        })
        .pipe(takeUntil(this.destroy$))
    );
  }

  private resolveNumericTeamIdForStats(
    teamId: number | string | null | undefined,
    teamName?: string | null
  ): string | undefined {
    if (teamId != null) {
      const s = String(teamId).trim();
      if (s !== '') {
        return s;
      }
    }
    if (teamName) {
      const match = this.teams.find(
        t =>
          t.name === teamName ||
          t.id === String(teamId) ||
          (t as Team & { game4uTeamId?: string }).game4uTeamId === String(teamId)
      ) as (Team & { game4uTeamId?: string }) | undefined;
      const g4u = match?.game4uTeamId?.trim();
      if (g4u) {
        return g4u;
      }
      if (match?.id) {
        return String(match.id).trim() || undefined;
      }
    }
    return undefined;
  }

  private buildProductivitySeriesFromMaps(
    groups: Array<{
      memberId: string;
      memberName: string;
      activitiesMap: Map<string, number>;
      pointsMap: Map<string, number>;
    }>,
    dateRange: { start: Date; end: Date }
  ): Array<{
    memberId: string;
    memberName: string;
    activitiesDataPoints: GraphDataPoint[];
    pointsDataPoints: GraphDataPoint[];
  }> {
    const startDate = dayjs(dateRange.start).startOf('day');
    const endDate = dayjs(dateRange.end).endOf('day');
    return groups.map(g => {
      const activitiesDataPoints: GraphDataPoint[] = [];
      const pointsDataPoints: GraphDataPoint[] = [];
      let currentDate = startDate;
      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        const act = g.activitiesMap.get(dateStr) || 0;
        const pts = g.pointsMap.get(dateStr);
        activitiesDataPoints.push({ date: currentDate.toDate(), value: act });
        pointsDataPoints.push({
          date: currentDate.toDate(),
          value:
            typeof pts === 'number' && Number.isFinite(pts)
              ? Math.floor(pts)
              : Math.floor(act * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG)
        });
        currentDate = currentDate.add(1, 'day');
      }
      return {
        memberId: g.memberId,
        memberName: g.memberName,
        activitiesDataPoints,
        pointsDataPoints
      };
    });
  }

  private applyProductivityMemberData(
    validMemberData: Array<{
      memberId: string;
      memberName: string;
      activitiesDataPoints: GraphDataPoint[];
      pointsDataPoints: GraphDataPoint[];
    }>,
    meta?: { apiCalls?: number; rows?: number; mode?: ProductivitySegmentationMode }
  ): void {
    if (validMemberData.length === 0) {
      this.clearProductivityCharts();
      return;
    }

    const startDate = dayjs(validMemberData[0].activitiesDataPoints[0]?.date ?? new Date()).startOf('day');
    void this.graphDataProcessor.getDateLabels(this.selectedPeriod);

    this.graphDatasets = validMemberData.map((memberData, index) => {
      const colors = this.getColorForIndex(index);
      return {
        label: memberData.memberName,
        data: memberData.activitiesDataPoints.map(point => point.value),
        borderColor: colors.border,
        backgroundColor: colors.background,
        fill: false
      };
    });

    this.pointsGraphDatasets = validMemberData.map((memberData, index) => {
      const colors = this.getColorForIndex(index);
      return {
        label: memberData.memberName,
        data: memberData.pointsDataPoints.map(point => point.value),
        borderColor: colors.border,
        backgroundColor: colors.background,
        fill: false
      };
    });

    const aggregatedActivitiesMap = new Map<string, number>();
    const aggregatedPointsMap = new Map<string, number>();
    validMemberData.forEach(memberData => {
      memberData.activitiesDataPoints.forEach(point => {
        const dateStr = dayjs(point.date).format('YYYY-MM-DD');
        aggregatedActivitiesMap.set(dateStr, (aggregatedActivitiesMap.get(dateStr) || 0) + point.value);
      });
      memberData.pointsDataPoints.forEach(point => {
        const dateStr = dayjs(point.date).format('YYYY-MM-DD');
        aggregatedPointsMap.set(dateStr, (aggregatedPointsMap.get(dateStr) || 0) + point.value);
      });
    });

    const endDate = validMemberData[0].activitiesDataPoints.length
      ? dayjs(validMemberData[0].activitiesDataPoints[validMemberData[0].activitiesDataPoints.length - 1].date)
      : dayjs();
    const length = validMemberData[0].activitiesDataPoints.length;
    const rangeStart = length > 0 ? endDate.subtract(length - 1, 'day') : startDate;

    const aggregatedActivities: GraphDataPoint[] = [];
    const aggregatedPoints: GraphDataPoint[] = [];
    let currentDate = rangeStart;
    for (let i = 0; i < length; i++) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      aggregatedActivities.push({
        date: currentDate.toDate(),
        value: aggregatedActivitiesMap.get(dateStr) || 0
      });
      aggregatedPoints.push({
        date: currentDate.toDate(),
        value: Math.floor(aggregatedPointsMap.get(dateStr) || 0)
      });
      currentDate = currentDate.add(1, 'day');
    }

    this.graphData = aggregatedActivities;
    this.pointsGraphData = aggregatedPoints;
    this.calculateCollaboratorTotals(validMemberData);
    this.rebuildProductivityTables();

    console.log('✅ Productivity data loaded:', {
      mode: meta?.mode,
      series: validMemberData.length,
      apiCalls: meta?.apiCalls,
      rows: meta?.rows
    });
  }

  /** C_LEVEL / DIRETOR no painel agregado: uma série por gerência (gestor GERENTE). */
  private async loadProductivityDataByGerencias(dateRange: { start: Date; end: Date }): Promise<void> {
    const managers = await firstValueFrom(
      this.actionLogService
        .fetchManagementDashboardCachedList(this.selectedMonth, 'GERENTE')
        .pipe(takeUntil(this.destroy$))
    );

    if (!managers?.length) {
      console.warn('[Productivity] Sem gerências na listagem — fallback para supervisões.');
      await this.loadProductivityDataBySupervisoes(dateRange);
      return;
    }

    let apiCalls = 0;
    let rowCount = 0;
    const groups: Array<{
      memberId: string;
      memberName: string;
      activitiesMap: Map<string, number>;
      pointsMap: Map<string, number>;
    }> = [];

    for (const manager of managers) {
      const teamIds = [
        ...(manager.team_ids ?? []).map(id => String(id)),
        ...(manager.teams ?? []).map(t => String(t.team_id))
      ].filter((id, idx, arr) => id && arr.indexOf(id) === idx);

      const mergedRows: TeamDailyFinishedStatsRow[] = [];
      for (const tid of teamIds) {
        const numericId = this.resolveNumericTeamIdForStats(tid);
        if (!numericId) {
          continue;
        }
        const rows = await this.fetchTeamDailyFinishedStatsRows(numericId, dateRange);
        apiCalls++;
        rowCount += rows.length;
        mergedRows.push(...rows);
      }

      const byDay = aggregateDailyFinishedStatsByDay(mergedRows);
      const { activitiesMap, pointsMap } = dailyMapsFromDayAggregate(byDay);
      const label = formatGerenciaGroupLabel(manager.user_email);
      groups.push({
        memberId: manager.user_id || manager.user_email || label,
        memberName: label,
        activitiesMap,
        pointsMap
      });
    }

    const validMemberData = this.buildProductivitySeriesFromMaps(groups, dateRange);
    this.applyProductivityMemberData(validMemberData, {
      apiCalls,
      rows: rowCount,
      mode: 'gerencias'
    });
  }

  /** GERENTE no painel agregado: uma série por supervisão (time no escopo). */
  private async loadProductivityDataBySupervisoes(dateRange: { start: Date; end: Date }): Promise<void> {
    const overview = await firstValueFrom(
      this.actionLogService
        .fetchManagementDashboardCachedOverview(this.selectedMonth)
        .pipe(takeUntil(this.destroy$))
    );
    const supervisionTeams = overview?.teams ?? [];

    if (!supervisionTeams.length) {
      this.clearProductivityCharts();
      return;
    }

    let apiCalls = 0;
    let rowCount = 0;
    const groups: Array<{
      memberId: string;
      memberName: string;
      activitiesMap: Map<string, number>;
      pointsMap: Map<string, number>;
    }> = [];

    for (const team of supervisionTeams) {
      const numericId = this.resolveNumericTeamIdForStats(team.team_id, team.team_name);
      if (!numericId) {
        continue;
      }
      const rows = await this.fetchTeamDailyFinishedStatsRows(numericId, dateRange);
      apiCalls++;
      rowCount += rows.length;
      const byDay = aggregateDailyFinishedStatsByDay(rows);
      const { activitiesMap, pointsMap } = dailyMapsFromDayAggregate(byDay);
      groups.push({
        memberId: String(team.team_id),
        memberName: (team.team_name ?? `Supervisão ${team.team_id}`).trim(),
        activitiesMap,
        pointsMap
      });
    }

    const validMemberData = this.buildProductivitySeriesFromMaps(groups, dateRange);
    this.applyProductivityMemberData(validMemberData, {
      apiCalls,
      rows: rowCount,
      mode: 'supervisoes'
    });
  }

  /** SUPERVISOR, drill-down em time, ou líder de célula: séries por jogador (célula filtrada). */
  private async loadProductivityDataByPlayers(
    dateRange: { start: Date; end: Date },
    filterToCell: boolean
  ): Promise<void> {
    const teamTid = this.getGame4uReportTeamId();
    if (!teamTid) {
      this.clearProductivityCharts();
      return;
    }

    const rows = await this.fetchTeamDailyFinishedStatsRows(teamTid, dateRange);
    const byEmail = aggregateDailyFinishedStatsByEmail(rows);

    const cellMemberSet = new Set(
      [
        ...this.collaborators.map(c => String(c.userId ?? '').trim().toLowerCase()),
        ...this.teamMemberIds.map(id => String(id).trim().toLowerCase())
      ].filter(Boolean)
    );

    const AGG_KEY = '__team_aggregate__';
    const memberKeysOrdered = [...byEmail.keys()].filter(email => {
      if (!filterToCell || cellMemberSet.size === 0) {
        return true;
      }
      return cellMemberSet.has(email.trim().toLowerCase());
    });

    if (memberKeysOrdered.length === 0 && !filterToCell) {
      const fallbackKeys =
        this.teamMemberIds.length > 0 ? [...this.teamMemberIds] : [AGG_KEY];
      for (const memberId of fallbackKeys) {
        memberKeysOrdered.push(memberId === AGG_KEY ? AGG_KEY : memberId);
      }
    }

    const groups = memberKeysOrdered.map(memberId => {
      const collaborator = this.collaborators.find(
        c => c.userId?.trim().toLowerCase() === memberId.trim().toLowerCase()
      );
      const dayMap = byEmail.get(memberId) ?? new Map();
      const activitiesMap = new Map<string, number>();
      const pointsMap = new Map<string, number>();
      for (const [day, v] of dayMap) {
        activitiesMap.set(day, v.tasks);
        pointsMap.set(day, v.points);
      }
      return {
        memberId,
        memberName:
          memberId === AGG_KEY
            ? 'Equipe'
            : this.formatCollaboratorName(memberId, collaborator?.name),
        activitiesMap,
        pointsMap
      };
    });

    const validMemberData = this.buildProductivitySeriesFromMaps(groups, dateRange);
    this.applyProductivityMemberData(validMemberData, {
      apiCalls: 1,
      rows: rows.length,
      mode: filterToCell ? 'celula' : 'jogadores'
    });
  }

  /**
   * Carrega gráficos de produtividade com segmentação por papel:
   * gerências (C_LEVEL/DIRETOR), supervisões (GERENTE), jogadores (SUPERVISOR) ou célula (LIDER_CELULA).
   */
  private async loadProductivityData(dateRange: { start: Date; end: Date }): Promise<void> {
    if (!this.productivityAnalysisTabEnabled) {
      return;
    }

    const mode = this.getProductivitySegmentationMode();
    this.isLoadingProductivity = true;
    this.hasProductivityError = false;
    this.productivityErrorMessage = '';

    console.log('📈 Loading productivity data…', { mode, managementOverview: this.isManagementOverview });

    try {
      switch (mode) {
        case 'gerencias':
          await this.loadProductivityDataByGerencias(dateRange);
          break;
        case 'supervisoes':
          await this.loadProductivityDataBySupervisoes(dateRange);
          break;
        case 'celula':
          await this.loadProductivityDataByPlayers(dateRange, true);
          break;
        case 'jogadores':
        default:
          await this.loadProductivityDataByPlayers(dateRange, false);
          break;
      }
      this.hasProductivityError = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading productivity data:', error);
      this.clearProductivityCharts();
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
      this.toastService.error('Erro ao carregar dados de produtividade');
    } finally {
      this.isLoadingProductivity = false;
    }
  }

  /**
   * Calculate total activities and points by collaborator for bar charts
   */
  private calculateCollaboratorTotals(memberData: Array<{ 
  memberId: string; 
  memberName: string; 
  activitiesDataPoints: GraphDataPoint[]; 
  pointsDataPoints: GraphDataPoint[] 
}>): void {
  // Calculate totals for each collaborator
  const activitiesTotals: Array<{ name: string; total: number }> = [];
  const pointsTotals: Array<{ name: string; total: number }> = [];
  
  memberData.forEach(member => {
    const activitiesTotal = member.activitiesDataPoints.reduce((sum, point) => sum + point.value, 0);
    const pointsTotal = member.pointsDataPoints.reduce((sum, point) => sum + point.value, 0);
    
    // Format the member name (already formatted in loadProductivityData, but ensure consistency)
    const formattedName = this.formatCollaboratorName(member.memberId, member.memberName);
    
    activitiesTotals.push({
      name: formattedName,
      total: activitiesTotal
    });
    
    pointsTotals.push({
      name: formattedName,
      total: Math.floor(pointsTotal) // Round down points
    });
  });
  
  // Sort by total (descending) for better visualization
  activitiesTotals.sort((a, b) => b.total - a.total);
  pointsTotals.sort((a, b) => b.total - a.total);
  
  // Calculate total for percentage calculation
  const totalActivities = activitiesTotals.reduce((sum, item) => sum + item.total, 0);
  const totalPoints = pointsTotals.reduce((sum, item) => sum + item.total, 0);
  
  // Create graph data and datasets for activities by collaborator
  this.activitiesByCollaboratorGraphData = activitiesTotals.map((item, index) => ({
    date: new Date(2024, 0, index + 1), // Dummy date, not used in bar chart
    value: item.total
  }));
  
  this.activitiesByCollaboratorDatasets = [{
    label: 'Total de Atividades',
    data: activitiesTotals.map(item => item.total),
    backgroundColor: activitiesTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.background;
    }),
    borderColor: activitiesTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.border;
    }),
    borderWidth: 1
  }];
  
  // Create graph data and datasets for points by collaborator
  this.pointsByCollaboratorGraphData = pointsTotals.map((item, index) => ({
    date: new Date(2024, 0, index + 1), // Dummy date, not used in bar chart
    value: item.total
  }));
  
  this.pointsByCollaboratorDatasets = [{
    label: 'Total de Pontos',
    data: pointsTotals.map(item => item.total),
    backgroundColor: pointsTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.background;
    }),
    borderColor: pointsTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.border;
    }),
    borderWidth: 1
  }];
  
  // Store collaborator names with percentage for chart labels
  // Format: "Nome - Valor (Porcentagem%)"
  this.activitiesByCollaboratorLabels = activitiesTotals.map(item => {
    const percentage = totalActivities > 0 ? Math.round((item.total / totalActivities) * 100) : 0;
    return `${item.name} - ${item.total} (${percentage}%)`;
  });
  this.pointsByCollaboratorLabels = pointsTotals.map(item => {
    const percentage = totalPoints > 0 ? Math.round((item.total / totalPoints) * 100) : 0;
    return `${item.name} - ${item.total} (${percentage}%)`;
  });

  // Structured table rows for table view
  this.productivityActivitiesByCollaboratorTable = activitiesTotals.map(item => ({
    name: item.name,
    total: item.total,
    percent: totalActivities > 0 ? Math.round((item.total / totalActivities) * 100) : 0
  }));
  this.productivityPointsByCollaboratorTable = pointsTotals.map(item => ({
    name: item.name,
    total: item.total,
    percent: totalPoints > 0 ? Math.round((item.total / totalPoints) * 100) : 0
  }));
  
  console.log('✅ Collaborator totals calculated:', {
    activities: activitiesTotals,
    points: pointsTotals,
    activitiesLabels: this.activitiesByCollaboratorLabels,
    pointsLabels: this.pointsByCollaboratorLabels
  });
}

  setProductivityChartView(which: 'activitiesDaily' | 'pointsDaily' | 'activitiesByCollaborator' | 'pointsByCollaborator', view: 'chart' | 'table'): void {
    switch (which) {
      case 'activitiesDaily':
        this.productivityActivitiesDailyView = view;
        break;
      case 'pointsDaily':
        this.productivityPointsDailyView = view;
        break;
      case 'activitiesByCollaborator':
        this.productivityActivitiesByCollaboratorView = view;
        break;
      case 'pointsByCollaborator':
        this.productivityPointsByCollaboratorView = view;
        break;
    }
    this.cdr.markForCheck();
  }

  getHeatmapCellStyle(value: number, maxValue: number): { [k: string]: string } {
    if (!maxValue || maxValue <= 0) {
      return { backgroundColor: 'transparent' };
    }
    const ratio = Math.min(1, Math.max(0, value / maxValue));
    const alpha = 0.06 + ratio * 0.64; // 0.06 → 0.70
    const textColor = alpha >= 0.42 ? '#ffffff' : 'inherit';
    return {
      backgroundColor: `rgba(239, 68, 68, ${alpha.toFixed(3)})`,
      color: textColor
    };
  }

  trackByHeatmapRow(_idx: number, row: { memberName: string }): string {
    return row.memberName;
  }

  trackByHeatmapColumn(_idx: number, col: { key: string }): string {
    return col.key;
  }

  private rebuildProductivityTables(): void {
    this.productivityActivitiesDailyTable = this.buildDailyHeatmapTable(this.graphDatasets);
    this.productivityPointsDailyTable = this.buildDailyHeatmapTable(this.pointsGraphDatasets);
  }

  private buildDailyHeatmapTable(datasets: ChartDataset[]): {
    columns: Array<{ key: string; label: string; tooltip: string }>;
    rows: Array<{ memberName: string; values: number[] }>;
    maxValue: number;
  } {
    const normalizedDatasets = (datasets || []).filter(ds => Array.isArray((ds as any)?.data));
    const length = normalizedDatasets.length > 0 ? (normalizedDatasets[0].data?.length ?? 0) : 0;
    const end = this.productivityLastRangeEnd ?? dayjs(); // consistent with productivity tab range
    const start = length > 0 ? end.subtract(length - 1, 'day') : end;

    const columns: Array<{ key: string; label: string; tooltip: string }> = [];
    let current = start;
    for (let i = 0; i < length; i++) {
      const key = current.format('YYYY-MM-DD');
      columns.push({
        key,
        label: current.format('DD'),
        tooltip: current.format('DD/MM/YYYY')
      });
      current = current.add(1, 'day');
    }

    const rows: Array<{ memberName: string; values: number[] }> = normalizedDatasets.map(ds => ({
      memberName: String(ds.label ?? '').trim() || '—',
      values: (ds.data || []).map(v => Math.floor(Number(v) || 0))
    }));

    const maxValue = rows.reduce((max, r) => Math.max(max, ...r.values), 0);
    return { columns, rows, maxValue: Number.isFinite(maxValue) ? maxValue : 0 };
  }

  /**
   * Get color for dataset by index (cycling through palette)
   */
  private getColorForIndex(index: number): { border: string; background: string } {
    const colorPalette = [
      { border: 'rgba(75, 192, 192, 1)', background: 'rgba(75, 192, 192, 0.2)' },
      { border: 'rgba(255, 99, 132, 1)', background: 'rgba(255, 99, 132, 0.2)' },
      { border: 'rgba(54, 162, 235, 1)', background: 'rgba(54, 162, 235, 0.2)' },
      { border: 'rgba(255, 206, 86, 1)', background: 'rgba(255, 206, 86, 0.2)' },
      { border: 'rgba(153, 102, 255, 1)', background: 'rgba(153, 102, 255, 0.2)' },
      { border: 'rgba(255, 159, 64, 1)', background: 'rgba(255, 159, 64, 0.2)' }
    ];
    return colorPalette[index % colorPalette.length];
  }

  /**
   * Load team activity and process metrics aggregated from all team members
   * OPTIMIZED: Uses single aggregate query instead of N individual requests
   */
  private async loadTeamActivityAndMacroData(_dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      if (this.playerService.usesGame4uWalletFromStats()) {
        return;
      }
      if (!this.selectedTeam) {
        console.warn('⚠️ Sem equipa selecionada para métricas agregadas Game4U');
        return;
      }
      if (this.teamSupervisionBundle) {
        return;
      }
      this.isLoadingMonthlyPointsProgress = true;
      this.cdr.markForCheck();
      console.log(
        '📊 Loading team panel progress (Game4U: supervision/dashboard/cached ou fallback team-stats)...'
      );
      const metrics = await lastValueFrom(
        this.actionLogService
          .getProgressMetrics(this.selectedTeam, this.selectedMonth, {
            game4uTeamAggregate: {
              team: this.getGame4uTeamHttpParam(),
              bwaTeamId: this.getGame4uTeamScopeId()
            }
          })
          .pipe(takeUntil(this.destroy$), last())
      ).catch((error) => {
        console.error('Error loading team progress metrics (Game4U):', error);
        return {
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        };
      });

      this.teamActivityMetrics = {
        pendentes: metrics.activity.pendentes,
        emExecucao: metrics.activity.emExecucao,
        finalizadas: metrics.activity.finalizadas,
        pontos: Math.floor(metrics.activity.pontos),
        ...('pontosDone' in metrics.activity &&
        'pontosTodosStatus' in metrics.activity &&
        metrics.activity.pontosDone !== undefined &&
        metrics.activity.pontosTodosStatus !== undefined
          ? {
              pontosDone: metrics.activity.pontosDone,
              pontosTodosStatus: metrics.activity.pontosTodosStatus
            }
          : {})
      };

      this.teamProcessMetrics = {
        pendentes: metrics.processo.pendentes,
        incompletas: metrics.processo.incompletas,
        finalizadas: metrics.processo.finalizadas
      };

      console.log('✅ Team activity and process data (Game4U):', {
        activities: this.teamActivityMetrics,
        processos: this.teamProcessMetrics,
        selectedMonth: this.selectedMonth
      });

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team activity and process data:', error);
    } finally {
      this.isLoadingMonthlyPointsProgress = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Lista «Clientes atendidos»: mesmo fluxo que `gamification-dashboard.loadParticipacaoData`
   * (GET participação + cruzamento gamificação para % no prazo).
   */
  private async loadParticipacaoClientesList(
    playerId: string,
    opts?: { useTeamDeliveriesAggregate?: boolean; teamRange?: { start: Date; end: Date } }
  ): Promise<void> {
    this.isLoadingCarteira = true;
    this.isLoadingParticipacaoKpi = false;
    this.isLoadingCarteiraMore = false;
    this.participacaoHasMore = false;
    this.participacaoNextOffset = 0;
    this.participacaoTotal = undefined;
    this.participacaoPagedPlayerId = null;
    this.useParticipacaoReportsPagination = false;
    const loadGen = ++this.participacaoKpiLoadGen;
    this.cdr.markForCheck();

    const useTeam =
      !!opts?.useTeamDeliveriesAggregate &&
      !!opts?.teamRange &&
      (this.selectedTeam || '').trim() !== '';

    if (!useTeam && !playerId && !this.isManagementOverview) {
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
      return;
    }

    const teamTid = this.getGame4uTeamScopeId();

    try {
      if (
        this.isManagementOverview &&
        this.playerService.usesGame4uWalletFromStats() &&
        this.selectedMonth != null
      ) {
        if (this.teamSupervisionBundle && !this.teamSupervisionCacheMissing) {
          this.clientesAtendidosThisMonthCount = this.teamSupervisionBundle.monthClientsServed;
        } else {
          this.clientesAtendidosThisMonthCount = null;
        }
        this.isLoadingClientesAtendidosCount = false;
      } else if (
        useTeam &&
        this.playerService.usesGame4uWalletFromStats() &&
        this.selectedMonth != null &&
        teamTid
      ) {
        if (this.teamSupervisionBundle && !this.teamSupervisionCacheMissing) {
          this.clientesAtendidosThisMonthCount = this.teamSupervisionBundle.monthClientsServed;
        } else {
          this.clientesAtendidosThisMonthCount = null;
        }
        this.isLoadingClientesAtendidosCount = false;
      } else if (
        !useTeam &&
        this.playerService.usesGame4uWalletFromStats() &&
        this.selectedMonth != null &&
        playerId
      ) {
        this.isLoadingClientesAtendidosCount = true;
        this.cdr.markForCheck();
        this.actionLogService
          .getPlayerDashboardMonthClientsServedCount(playerId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: count => {
              this.clientesAtendidosThisMonthCount = Number.isFinite(count) ? Math.floor(count) : null;
              this.isLoadingClientesAtendidosCount = false;
              this.cdr.markForCheck();
            },
            error: err => {
              console.error('📊 Failed to load dashboard/cached month_clients_served:', err);
              this.clientesAtendidosThisMonthCount = null;
              this.isLoadingClientesAtendidosCount = false;
              this.cdr.markForCheck();
            }
          });
      } else {
        this.clientesAtendidosThisMonthCount = null;
        this.isLoadingClientesAtendidosCount = false;
      }

      // Paginação «Painel do Gerente/Diretor/C-Level»: usa `management/finished/deliveries/cached`
      // (sem `team_id`/`email`); escopo do gestor vem do JWT (`user_role_team_month`).
      if (
        this.isManagementOverview &&
        this.playerService.usesGame4uWalletFromStats() &&
        this.selectedMonth != null
      ) {
        const month = this.selectedMonth!;
        const page = await firstValueFrom(
          this.actionLogService
            .getManagementFinishedDeliveriesParticipacaoPage(month, 0, this.participacaoPageLimit)
            .pipe(takeUntil(this.destroy$))
        );
        this.useParticipacaoReportsPagination = true;
        this.participacaoPagedPlayerId = null;
        const apiReceived = page.apiRowCount ?? page.items?.length ?? 0;
        this.participacaoNextOffset = (page.offset ?? 0) + apiReceived;
        if (typeof page.total === 'number' && Number.isFinite(page.total)) {
          this.participacaoTotal = page.total;
        }
        this.participacaoHasMore = hasMoreFinishedDeliveriesCachedPage(
          apiReceived,
          this.participacaoPageLimit,
          this.participacaoNextOffset,
          this.participacaoTotal,
          page.has_more
        );

        const baseClientes = this.mapTeamParticipacaoDeliveryRowsToCompanyDisplay(page.items || []);
        const uniqueBase = this.dedupeParticipacaoClientes(baseClientes);
        uniqueBase.forEach(c => {
          const status = this.cnpjStatusMap.get(c.cnpj);
          if (status) {
            c.status = status;
          }
        });
        this.teamCarteiraClientes = uniqueBase;
        this.isLoadingCarteira = false;
        const skipGamificacaoKpi = !!page.fromCachedDeliveries;
        this.isLoadingParticipacaoKpi = !skipGamificacaoKpi && uniqueBase.length > 0;
        this.updateFormattedSidebarData();
        this.syncEntregasPrazoKpiFromParticipacao();
        this.cdr.markForCheck();
        return;
      }

      // Paginação (`finished/deliveries/cached` + team_id): vista equipa agregada quando há month + scopeId
      if (useTeam && this.playerService.usesGame4uWalletFromStats() && this.selectedMonth != null && teamTid) {
        const month = this.selectedMonth!;
        const page = await firstValueFrom(
          this.teamAggregateService
            .getTeamFinishedDeliveriesParticipacaoPage(teamTid, month, 0, this.participacaoPageLimit)
            .pipe(takeUntil(this.destroy$))
        );
        this.useParticipacaoReportsPagination = true;
        const apiReceived = page.apiRowCount ?? page.items?.length ?? 0;
        this.participacaoNextOffset = (page.offset ?? 0) + apiReceived;
        if (typeof page.total === 'number' && Number.isFinite(page.total)) {
          this.participacaoTotal = page.total;
        }
        this.participacaoHasMore = hasMoreFinishedDeliveriesCachedPage(
          apiReceived,
          this.participacaoPageLimit,
          this.participacaoNextOffset,
          this.participacaoTotal,
          page.has_more
        );

        const baseClientes = this.mapTeamParticipacaoDeliveryRowsToCompanyDisplay(page.items || []);
        const uniqueBase = this.dedupeParticipacaoClientes(baseClientes);
        uniqueBase.forEach(c => {
          const status = this.cnpjStatusMap.get(c.cnpj);
          if (status) {
            c.status = status;
          }
        });
        this.teamCarteiraClientes = uniqueBase;
        this.isLoadingCarteira = false;
        const skipGamificacaoKpi = !!page.fromCachedDeliveries;
        this.isLoadingParticipacaoKpi = !skipGamificacaoKpi && uniqueBase.length > 0;
        this.updateFormattedSidebarData();
        this.syncEntregasPrazoKpiFromParticipacao();
        this.cdr.markForCheck();

        if (uniqueBase.length > 0 && !skipGamificacaoKpi) {
          void this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(uniqueBase, loadGen).catch(
            (err: unknown) => console.error('📊 Falha ao aplicar KPI de entregas (gamificação, painel equipa):', err)
          );
        }
        return;
      }

      // Paginação por email (`finished/deliveries/cached`): drill-down de colaborador no painel equipa
      if (
        !useTeam &&
        playerId &&
        this.playerService.usesGame4uWalletFromStats() &&
        this.selectedMonth != null
      ) {
        const month = this.selectedMonth!;
        const page = await firstValueFrom(
          this.actionLogService
            .getPlayerFinishedDeliveriesParticipacaoPage(playerId, month, 0, this.participacaoPageLimit)
            .pipe(takeUntil(this.destroy$))
        );
        this.useParticipacaoReportsPagination = true;
        this.participacaoPagedPlayerId = playerId;
        const apiReceived = page.apiRowCount ?? page.items?.length ?? 0;
        this.participacaoNextOffset = (page.offset ?? 0) + apiReceived;
        if (typeof page.total === 'number' && Number.isFinite(page.total)) {
          this.participacaoTotal = page.total;
        }
        this.participacaoHasMore = hasMoreFinishedDeliveriesCachedPage(
          apiReceived,
          this.participacaoPageLimit,
          this.participacaoNextOffset,
          this.participacaoTotal,
          page.has_more
        );

        const baseClientes = this.mapTeamParticipacaoDeliveryRowsToCompanyDisplay(page.items || []);
        const uniqueBase = this.dedupeParticipacaoClientes(baseClientes);
        uniqueBase.forEach(c => {
          const status = this.cnpjStatusMap.get(c.cnpj);
          if (status) {
            c.status = status;
          }
        });
        this.teamCarteiraClientes = uniqueBase;
        this.isLoadingCarteira = false;
        const skipGamificacaoKpi = !!page.fromCachedDeliveries;
        this.isLoadingParticipacaoKpi = !skipGamificacaoKpi && uniqueBase.length > 0;
        this.updateFormattedSidebarData();
        this.syncEntregasPrazoKpiFromParticipacao();
        this.cdr.markForCheck();

        if (uniqueBase.length > 0 && !skipGamificacaoKpi) {
          void this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(uniqueBase, loadGen).catch(
            (err: unknown) => console.error('📊 Falha ao aplicar KPI de entregas (gamificação, painel equipa):', err)
          );
        }
        return;
      }

      const participacaoSource$: Observable<any[]> = useTeam
        ? this.teamAggregateService.getTeamCnpjListWithCount(
            this.getGame4uTeamHttpParam(),
            opts!.teamRange!.start,
            opts!.teamRange!.end,
            teamTid ? { game4uBwaTeamScopeId: teamTid } : undefined
          )
        : this.actionLogService.getPlayerCnpjListWithCount(playerId, this.selectedMonth, teamTid);

      const mapped$ = participacaoSource$.pipe(
        mergeMap((items: any[]) => {
          if (items.length > 0 && items.every(i => i.fromGameReportsDeliveries)) {
            const baseClientes: CompanyDisplay[] = items.map(i => ({
              cnpj: i.cnpj,
              cnpjId: i.cnpj,
              actionCount: i.actionCount ?? 0,
              processCount: 0,
              delivery_title: i.delivery_title,
              ...(i.deliveryId?.trim() ? { deliveryId: i.deliveryId.trim() } : {}),
              loadTasksViaGameReports: true
            }));
            return of({
              empids: [] as string[],
              baseClientes,
              skipKpi: false as const
            });
          }

          const empids = items.map(i => i.cnpj).filter((c): c is string => !!c && String(c).trim().length > 0);
          const actionCountByCnpj = new Map<string, number>(
            items.map(i => [i.cnpj, i.actionCount ?? 0] as [string, number])
          );
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

      const result = (await firstValueFrom(
        mapped$.pipe(take(1), takeUntil(this.destroy$))
      )) as {
        baseClientes: CompanyDisplay[];
        skipKpi: boolean;
      };

      const { baseClientes, skipKpi } = result;
      const uniqueBase = this.dedupeParticipacaoClientes(baseClientes);
      uniqueBase.forEach(c => {
        const status = this.cnpjStatusMap.get(c.cnpj);
        if (status) {
          c.status = status;
        }
      });
      this.teamCarteiraClientes = uniqueBase;
      this.isLoadingCarteira = false;
      this.isLoadingParticipacaoKpi = !skipKpi && uniqueBase.length > 0;
      this.updateFormattedSidebarData();
      this.syncEntregasPrazoKpiFromParticipacao();
      this.cdr.markForCheck();

      if (!skipKpi && uniqueBase.length > 0) {
        void this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(uniqueBase, loadGen).catch(
          (err: unknown) => {
            console.error('📊 Falha ao aplicar KPI de entregas (gamificação, painel equipa):', err);
          }
        );
      }
    } catch (err: unknown) {
      console.error('📊 Failed to load participação (painel equipa):', err);
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.isLoadingParticipacaoKpi = false;
      this.isLoadingCarteiraMore = false;
      this.participacaoHasMore = false;
      this.syncEntregasPrazoKpiFromParticipacao();
      this.cdr.markForCheck();
    }
  }

  get showParticipacaoLoadMoreButton(): boolean {
    return (
      this.useParticipacaoReportsPagination &&
      !this.isLoadingCarteira &&
      !this.isLoadingCarteiraMore &&
      this.participacaoHasMore
    );
  }

  loadMoreParticipacao(): void {
    if (
      !this.useParticipacaoReportsPagination ||
      this.isLoadingCarteira ||
      this.isLoadingCarteiraMore ||
      !this.participacaoHasMore
    ) {
      return;
    }
    if (!this.selectedMonth) {
      return;
    }
    const month = this.selectedMonth;
    this.isLoadingCarteiraMore = true;
    const loadGen = this.participacaoKpiLoadGen;
    this.cdr.markForCheck();

    const page$:
      | Observable<TeamFinishedDeliveriesPageResult | PlayerParticipacaoDeliveriesPageResult>
      | null = this.participacaoPagedPlayerId
      ? this.actionLogService.getPlayerFinishedDeliveriesParticipacaoPage(
          this.participacaoPagedPlayerId,
          month,
          this.participacaoNextOffset,
          this.participacaoPageLimit
        )
      : this.isManagementOverview
        ? this.actionLogService.getManagementFinishedDeliveriesParticipacaoPage(
            month,
            this.participacaoNextOffset,
            this.participacaoPageLimit
          )
        : (() => {
            const teamTid = this.getGame4uTeamScopeId();
            if (!teamTid) {
              return null;
            }
            return this.teamAggregateService.getTeamFinishedDeliveriesParticipacaoPage(
              teamTid,
              month,
              this.participacaoNextOffset,
              this.participacaoPageLimit
            );
          })();

    if (!page$) {
      this.isLoadingCarteiraMore = false;
      this.cdr.markForCheck();
      return;
    }

    page$.pipe(takeUntil(this.destroy$)).subscribe({
      next: async (
        page: TeamFinishedDeliveriesPageResult | PlayerParticipacaoDeliveriesPageResult
      ) => {
        try {
          const appended = this.mapTeamParticipacaoDeliveryRowsToCompanyDisplay(page.items || []);
          const merged = this.dedupeParticipacaoClientes([...this.teamCarteiraClientes, ...appended]);
          this.teamCarteiraClientes = merged;

          const apiReceived = page.apiRowCount ?? page.items?.length ?? 0;
          if (typeof page.total === 'number' && Number.isFinite(page.total)) {
            this.participacaoTotal = page.total;
          }
          this.participacaoNextOffset = (page.offset ?? this.participacaoNextOffset) + apiReceived;
          this.participacaoHasMore = hasMoreFinishedDeliveriesCachedPage(
            apiReceived,
            this.participacaoPageLimit,
            this.participacaoNextOffset,
            this.participacaoTotal,
            page.has_more
          );

          const skipGamificacaoKpi = !!page.fromCachedDeliveries;
          this.isLoadingParticipacaoKpi = !skipGamificacaoKpi && merged.length > 0;
          this.updateFormattedSidebarData();
          this.syncEntregasPrazoKpiFromParticipacao();
          this.cdr.markForCheck();

          if (merged.length > 0 && !skipGamificacaoKpi) {
            await this.applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(merged, loadGen);
          } else if (merged.length > 0 && skipGamificacaoKpi) {
            this.isLoadingParticipacaoKpi = false;
            this.syncEntregasPrazoKpiFromParticipacao();
            this.cdr.markForCheck();
          }
        } catch (err) {
          console.error('📊 Falha ao aplicar KPI após carregar mais participação (painel equipa):', err);
        } finally {
          this.isLoadingCarteiraMore = false;
          this.cdr.markForCheck();
        }
      },
      error: (err: unknown) => {
        console.error('📊 Failed to load more participação (painel equipa):', err);
        this.isLoadingCarteiraMore = false;
        this.cdr.markForCheck();
      }
    });
  }

  retryClientesAtendidosThisMonth(): void {
    this.isLoadingCarteira = true;
    this.cdr.markForCheck();
    const dateRange = this.calculateDateRange();
    if (this.selectedCollaborator) {
      void this.loadCollaboratorCarteiraData(this.selectedCollaborator, dateRange);
      return;
    }
    void this.loadTeamCarteiraData(dateRange);
  }

  /** Linha de `finished/deliveries/cached` (equipa ou jogador) → `CompanyDisplay` com `porcEntregas` quando existir. */
  private mapTeamParticipacaoDeliveryRowsToCompanyDisplay(
    items:
      | TeamFinishedDeliveriesPageResult['items']
      | PlayerParticipacaoDeliveryRow[]
      | null
      | undefined
  ): CompanyDisplay[] {
    return (items || []).map(i => ({
      cnpj: i.cnpj,
      cnpjId: i.cnpj,
      actionCount: i.actionCount ?? 0,
      processCount: 0,
      delivery_title: i.delivery_title,
      ...(i.deliveryId?.trim() ? { deliveryId: i.deliveryId.trim() } : {}),
      ...(i.porcEntregas != null
        ? { porcEntregas: i.porcEntregas, entrega: i.entrega ?? i.porcEntregas }
        : {}),
      loadTasksViaGameReports: i.loadTasksViaGameReports ?? true
    }));
  }

  /** Alinhado a `gamification-dashboard.buildParticipacaoBaseClientes`. */
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

  private async applyParticipacaoPorcEntregasKpiAfterGamificacaoAsync(
    baseClientes: CompanyDisplay[],
    loadGen: number
  ): Promise<void> {
    if (baseClientes.length === 0) {
      if (loadGen === this.participacaoKpiLoadGen) {
        this.isLoadingParticipacaoKpi = false;
        this.syncEntregasPrazoKpiFromParticipacao();
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
      this.teamCarteiraClientes = this.dedupeParticipacaoClientes(merged);
    } catch (err: unknown) {
      console.error('📊 Erro ao enriquecer participação (painel equipa):', err);
      if (loadGen === this.participacaoKpiLoadGen) {
        this.teamCarteiraClientes = baseClientes.map(b => ({ ...b }));
      }
    } finally {
      if (loadGen === this.participacaoKpiLoadGen) {
        this.isLoadingParticipacaoKpi = false;
        this.syncEntregasPrazoKpiFromParticipacao();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Load carteira data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when carteira data is loaded
   */
  private async loadCollaboratorCarteiraData(collaboratorId: string, _dateRange: { start: Date; end: Date }): Promise<void> {
    console.log('📊 Loading clientes atendidos (participação) for collaborator:', collaboratorId);
    await this.loadParticipacaoClientesList(collaboratorId);
  }

  /**
   * Load team carteira (companies/CNPJs) data using OPTIMIZED single aggregate query
   * 
   * Uses $lookup aggregate query to get all CNPJs and action counts for team members
   * in a single API call instead of N individual calls per member.
   * 
   * @private
   * @async
   * @param dateRange - Date range for filtering actions
   * @returns Promise that resolves when carteira data is loaded
   */
  private async loadTeamCarteiraData(_dateRange: { start: Date; end: Date }): Promise<void> {
    console.log('📊 Loading clientes atendidos (participação, equipa agregada via team-deliveries)...');
    if (!this.selectedTeamId || !(this.selectedTeam || '').trim()) {
      console.warn('⚠️ No team selected for carteira data');
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.isLoadingParticipacaoKpi = false;
      this.cdr.markForCheck();
      return;
    }
    await this.loadParticipacaoClientesList('', {
      useTeamDeliveriesAggregate: true,
      teamRange: _dateRange
    });
  }

  // ============================================================================================
  // EXECUTIVE INSIGHTS — mini dashboard com leitura agregada de
  // `GET /game/reports/{management/}finished/deliveries/cached` (linhas RAW com `user_email`).
  // ============================================================================================

  get usesGame4uWalletFromStats(): boolean {
    return this.playerService.usesGame4uWalletFromStats();
  }

  get executiveActionInsightsScopeLabel(): string {
    if (this.selectedCollaborator) {
      return 'do colaborador selecionado';
    }
    if (this.isManagementOverview) {
      return 'da organização';
    }
    return 'do time';
  }

  /**
   * Carrega o mini dashboard executivo com:
   *  - Top processos finalizados no mês (somatório de `tasks_total` por título do processo em user-actions).
   *  - Top performers (somatório de tarefas/clientes por `user_email`).
   *  - Saúde do mês (% no prazo, ativos, médias).
   *
   * Usa apenas as 4 fontes pedidas: `management/dashboard/cached/overview`,
   * `management/finished/deliveries/cached`, `supervision/dashboard/cached` e
   * `finished/deliveries/cached` — sem chamar o action_log/aggregate.
   */
  private async loadExecutiveInsights(): Promise<void> {
    const loadGen = ++this.executiveInsightsLoadGen;
    this.isLoadingExecutiveInsights = true;
    this.hasExecutiveInsightsData = false;
    this.hasExecutiveInsightsError = false;
    this.cdr.markForCheck();

    try {
      if (!this.playerService.usesGame4uWalletFromStats() || this.selectedMonth == null) {
        this.resetExecutiveInsights();
        return;
      }

      const month = this.selectedMonth;
      const teamScopeId = this.getGame4uTeamScopeId() ?? '';

      let scope:
        | { teamId?: string; email?: string; isManagement?: boolean }
        | null = null;
      if (this.isManagementOverview) {
        scope = { isManagement: true };
        this.showExecutiveInsightsPlayersRanking = true;
      } else if (this.selectedCollaborator) {
        scope = { email: this.selectedCollaborator };
        this.showExecutiveInsightsPlayersRanking = false;
      } else if (teamScopeId) {
        scope = { teamId: teamScopeId };
        this.showExecutiveInsightsPlayersRanking = true;
      }

      if (!scope) {
        this.resetExecutiveInsights();
        return;
      }

      const [rows, allUserActions] = await Promise.all([
        firstValueFrom(
          this.actionLogService
            .getExecutiveDeliveriesAllPages(scope, month, 100)
            .pipe(takeUntil(this.destroy$))
        ),
        firstValueFrom(
          this.loadExecutiveScopeUserActions(month).pipe(takeUntil(this.destroy$))
        )
      ]);

      if (loadGen !== this.executiveInsightsLoadGen) {
        return;
      }

      this.executiveDashboardInsights = buildDashboardInsightsSnapshotFromUserActions(
        allUserActions || [],
        month
      );
      const finishedUserActions = (allUserActions || []).filter(a =>
        isGame4uUserActionFinalizedStatus(a.status)
      );
      this.computeExecutiveInsightsFromRows(rows || [], finishedUserActions);
      this.refreshExecutiveInsightsHasData();
    } catch (error) {
      console.error('📊 Erro ao carregar insights executivos:', error);
      if (loadGen === this.executiveInsightsLoadGen) {
        this.resetExecutiveInsights();
        this.hasExecutiveInsightsError = true;
      }
    } finally {
      if (loadGen === this.executiveInsightsLoadGen) {
        this.isLoadingExecutiveInsights = false;
        this.cdr.markForCheck();
      }
    }
  }

  private resetExecutiveInsights(): void {
    this.executiveInsightsTopProcesses = [];
    this.executiveInsightsTopPlayers = [];
    this.executiveInsightsAttentionPlayers = [];
    this.executiveInsightsTotalTasks = 0;
    this.executiveInsightsOnTimeTasks = 0;
    this.executiveInsightsActivePlayers = 0;
    this.executiveInsightsAvgTasksPerActivePlayer = 0;
    this.executiveInsightsAvgClientsPerActivePlayer = 0;
    this.executiveInsightsTotalDeliveries = 0;
    this.executiveInsightsDistinctProcesses = 0;
    this.executiveInsightsOnTimePctOverall = null;
    this.executiveDashboardInsights = null;
    this.hasExecutiveInsightsData = false;
  }

  /** Garante cache de user-actions (mesmo dos insights) para o modal de progresso. */
  private warmProgressModalUserActionsCache(): void {
    if (!this.playerService.usesGame4uWalletFromStats() || this.selectedMonth == null) {
      return;
    }
    this.actionLogService.warmTeamUserActionsCacheForProgressModal(
      this.progressModalTeamIds,
      this.selectedMonth,
      this.selectedCollaborator?.trim() || undefined
    );
  }

  /** Duas requisições user-actions por equipa (abertas + finalizadas) ou por colaborador. */
  private loadExecutiveScopeUserActions(month: Date): Observable<Game4uUserActionModel[]> {
    const email = this.selectedCollaborator?.trim();
    if (email) {
      return this.actionLogService.getTeamUserActionsForInsightsMonth(undefined, month, email);
    }
    const teamIds = this.getInsightsScopeTeamIds();
    if (teamIds.length === 0) {
      const teamScopeId = this.getGame4uTeamScopeId();
      if (!teamScopeId) {
        return of([]);
      }
      return this.actionLogService.getTeamUserActionsForInsightsMonth(teamScopeId, month);
    }
    if (teamIds.length === 1) {
      return this.actionLogService.getTeamUserActionsForInsightsMonth(teamIds[0]!, month);
    }
    return forkJoin(
      teamIds.map(teamId =>
        this.actionLogService.getTeamUserActionsForInsightsMonth(teamId, month)
      )
    ).pipe(map(batches => batches.flat()));
  }

  private refreshExecutiveInsightsHasData(): void {
    const hasAction =
      this.executiveDashboardInsights != null &&
      (this.executiveDashboardInsights.pendingTasks > 0 ||
        this.executiveDashboardInsights.finishedTasks > 0);
    this.hasExecutiveInsightsData =
      this.executiveInsightsTopProcesses.length > 0 ||
      this.executiveInsightsTopPlayers.length > 0 ||
      hasAction;
  }

  private computeExecutiveInsightsFromRows(
    rows: Game4uReportsFinishedDeliveryRow[],
    finishedUserActions: Game4uUserActionModel[] = []
  ): void {
    const processAgg = aggregateExecutiveTopProcessesFromUserActions(finishedUserActions);
    this.executiveInsightsTopProcesses = processAgg.top;
    this.executiveInsightsDistinctProcesses = processAgg.distinctProcesses;

    const safeRows = (rows || []).filter(r => r != null && Math.floor(Number(r.tasks_total) || 0) > 0);
    if (safeRows.length === 0) {
      this.executiveInsightsTopPlayers = [];
      this.executiveInsightsAttentionPlayers = [];
      this.executiveInsightsTotalTasks = 0;
      this.executiveInsightsOnTimeTasks = 0;
      this.executiveInsightsActivePlayers = 0;
      this.executiveInsightsAvgTasksPerActivePlayer = 0;
      this.executiveInsightsAvgClientsPerActivePlayer = 0;
      this.executiveInsightsTotalDeliveries = 0;
      this.executiveInsightsOnTimePctOverall = null;
      return;
    }

    type PlayerAcc = {
      tasks: number;
      deliveries: number;
      onTimeDeliveries: number;
      clients: Set<string>;
      onTimeWeighted: number;
      tasksWithPct: number;
    };

    const byPlayer = new Map<string, PlayerAcc>();
    const activePlayers = new Set<string>();
    let totalTasks = 0;
    let totalOnTimeTasks = 0;
    let totalTasksWithPct = 0;

    for (const row of safeRows) {
      const tasks = Math.floor(Number(row.tasks_total) || 0);
      if (tasks <= 0) {
        continue;
      }
      totalTasks += tasks;

      // tasks on time podem vir como `tasks_on_time` ou inferidos de `on_time_pct`
      const tasksOnTimeExplicit = Math.floor(Number(row.tasks_on_time) || 0);
      const otp = row.on_time_pct;
      const hasOtp = otp != null && Number.isFinite(Number(otp));
      if (tasksOnTimeExplicit > 0) {
        totalOnTimeTasks += Math.min(tasksOnTimeExplicit, tasks);
      } else if (hasOtp) {
        totalOnTimeTasks += Math.round((Number(otp) / 100) * tasks);
      }
      if (hasOtp) {
        totalTasksWithPct += tasks;
      }

      const email = (row.user_email || '').trim().toLowerCase();
      if (email) {
        activePlayers.add(email);
        const plCur: PlayerAcc = byPlayer.get(email) ?? {
          tasks: 0,
          deliveries: 0,
          onTimeDeliveries: 0,
          clients: new Set<string>(),
          onTimeWeighted: 0,
          tasksWithPct: 0
        };
        plCur.tasks += tasks;
        plCur.deliveries += 1;
        if (deliveryRowCountsAsOnTime(row)) {
          plCur.onTimeDeliveries += 1;
        }
        const clientKey = String(row.emp_id ?? row.delivery_id ?? row.delivery_title ?? '').trim();
        if (clientKey) {
          plCur.clients.add(clientKey);
        }
        if (hasOtp) {
          plCur.onTimeWeighted += Number(otp) * tasks;
          plCur.tasksWithPct += tasks;
        }
        byPlayer.set(email, plCur);
      }
    }

    this.executiveInsightsTotalTasks = totalTasks;
    this.executiveInsightsOnTimeTasks = totalOnTimeTasks;
    this.executiveInsightsActivePlayers = activePlayers.size;
    this.executiveInsightsTotalDeliveries = safeRows.length;
    this.executiveInsightsAvgTasksPerActivePlayer =
      activePlayers.size > 0 ? Math.round((totalTasks / activePlayers.size) * 10) / 10 : 0;

    const sumClients = Array.from(byPlayer.values()).reduce((s, p) => s + p.clients.size, 0);
    this.executiveInsightsAvgClientsPerActivePlayer =
      activePlayers.size > 0 ? Math.round((sumClients / activePlayers.size) * 10) / 10 : 0;

    this.executiveInsightsOnTimePctOverall =
      totalTasksWithPct > 0
        ? Math.round((totalOnTimeTasks / totalTasksWithPct) * 1000) / 10
        : this.teamMonthOnTimeDeliveryPct;

    const playerArray: ExecutiveInsightsPlayerRank[] = [...byPlayer.entries()].map(([email, v]) => {
      const collab = this.collaborators.find(
        c => c.userId?.toLowerCase() === email || c.email?.toLowerCase() === email
      );
      const formatted = this.formatCollaboratorName(email, collab?.name);
      return {
        email,
        name: formatted,
        initials: this.computeExecutiveInitials(formatted),
        tasksTotal: v.tasks,
        clientsCount: v.clients.size,
        deliveriesCount: v.deliveries,
        onTimeDeliveries: v.onTimeDeliveries,
        onTimeDeliveryPct:
          v.deliveries > 0
            ? Math.round((v.onTimeDeliveries / v.deliveries) * 1000) / 10
            : null,
        onTimePct:
          v.tasksWithPct > 0
            ? Math.round((v.onTimeWeighted / v.tasksWithPct) * 10) / 10
            : null
      };
    });

    const compareByOnTimeDeliveriesDesc = (
      a: ExecutiveInsightsPlayerRank,
      b: ExecutiveInsightsPlayerRank
    ): number => {
      if (b.onTimeDeliveries !== a.onTimeDeliveries) {
        return b.onTimeDeliveries - a.onTimeDeliveries;
      }
      const pctA = a.onTimeDeliveryPct ?? -1;
      const pctB = b.onTimeDeliveryPct ?? -1;
      if (pctB !== pctA) {
        return pctB - pctA;
      }
      return b.deliveriesCount - a.deliveriesCount;
    };

    const compareNeedsAttention = (
      a: ExecutiveInsightsPlayerRank,
      b: ExecutiveInsightsPlayerRank
    ): number => {
      const pctA = a.onTimeDeliveryPct ?? 0;
      const pctB = b.onTimeDeliveryPct ?? 0;
      if (pctA !== pctB) {
        return pctA - pctB;
      }
      const lateA = a.deliveriesCount - a.onTimeDeliveries;
      const lateB = b.deliveriesCount - b.onTimeDeliveries;
      if (lateB !== lateA) {
        return lateB - lateA;
      }
      return b.deliveriesCount - a.deliveriesCount;
    };

    const isEligibleForAttention = (p: ExecutiveInsightsPlayerRank): boolean =>
      p.deliveriesCount >= EXECUTIVE_ATTENTION_MIN_DELIVERIES &&
      (p.onTimeDeliveryPct == null || p.onTimeDeliveryPct < EXECUTIVE_ATTENTION_MAX_ON_TIME_PCT);

    const ranked = playerArray
      .filter(p => p.deliveriesCount > 0)
      .sort(compareByOnTimeDeliveriesDesc);
    this.executiveInsightsTopPlayers = ranked.slice(0, 5);

    const topEmails = new Set(ranked.slice(0, 5).map(p => p.email));
    this.executiveInsightsAttentionPlayers = [...playerArray]
      .filter(p => !topEmails.has(p.email) && isEligibleForAttention(p))
      .sort(compareNeedsAttention)
      .slice(0, 5);
  }

  private computeExecutiveInitials(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return '?';
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    const first = parts[0]![0] || '';
    const last = parts[parts.length - 1]![0] || '';
    return (first + last).toUpperCase();
  }

  /** Cor determinística (azul→roxo→verde) para a barra de top processos. */
  getExecutiveProcessColor(idx: number): string {
    const palette = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
    return palette[idx % palette.length] || palette[0]!;
  }

  /** Classe CSS para o KPI de % no prazo, alinhado com paleta verde/amarelo/vermelho. */
  getExecutiveOnTimeBadgeClass(pct: number | null | undefined): string {
    if (pct == null || !Number.isFinite(pct)) {
      return 'badge-neutral';
    }
    if (pct >= 90) {
      return 'badge-success';
    }
    if (pct >= 70) {
      return 'badge-warning';
    }
    return 'badge-danger';
  }

  /** Meta mensal de pontos do cache de supervisão (`month_goal_points`); `null` quando ausente. */
  get executiveInsightsMonthlyGoalTarget(): number | null {
    const goal = Math.floor(Number(this.teamSupervisionBundle?.monthlyGoalTarget) || 0);
    return goal > 0 ? goal : null;
  }

  /** Pontos já entregues no mês (`month_points_done_delivered`) — espelho público de `activity.pontosDone`. */
  get executiveInsightsMonthlyPointsDone(): number {
    return Math.floor(Number(this.teamSupervisionBundle?.activity?.pontosDone) || 0);
  }

  /** % de evolução da meta de pontos do mês (0–100, capped). */
  get executiveInsightsGoalProgressPct(): number {
    const goal = this.executiveInsightsMonthlyGoalTarget ?? 0;
    const done = this.executiveInsightsMonthlyPointsDone;
    if (goal <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((done / goal) * 1000) / 10);
  }

  /** Total de tarefas pendentes do mês (cache `supervision/dashboard/cached`). */
  get executiveInsightsPendingTasks(): number {
    return Math.floor(Number(this.teamSupervisionBundle?.activity?.pendentes) || 0);
  }

  /** Tarefas finalizadas no mês conforme cache supervisão (preferido sobre soma das deliveries). */
  get executiveInsightsFinishedTasksCached(): number {
    return Math.floor(Number(this.teamSupervisionBundle?.activity?.finalizadas) || 0);
  }

  trackByExecutiveProcess(_idx: number, row: { deliveryTitle: string }): string {
    return row?.deliveryTitle ?? String(_idx);
  }

  trackByExecutivePlayer(_idx: number, row: { email: string }): string {
    return row?.email ?? String(_idx);
  }

  trackByExecutiveAttentionPlayer(_idx: number, row: { email: string }): string {
    return row?.email ?? String(_idx);
  }

  /**
   * Handle team selection change event.
   * 
   * When a user selects a different team from the dropdown:
   * 1. Updates the selectedTeamId (Funifier team ID) and selectedTeam (team name)
   * 2. Resets the collaborator filter to null (show all team members)
   * 3. Loads team members data for the selected team
   * 4. Reloads all team data for the new team
   * 5. Saves the selection to localStorage for persistence
   * 
   * @param teamId - The Funifier team ID (e.g., 'FkmdnFU')
   * 
   * @example
   * // Called from template when team selector changes
   * await this.onTeamChange('FkmdnFU');
   * 
   * @see {@link loadTeamMembersData}
   * @see {@link loadTeamData}
   */
  async onTeamChange(teamId: string): Promise<void> {
    try {
      console.log('🔄 Team changed to:', teamId);

      const team = this.teams.find(t => t.id === teamId);
      if (!team) {
        console.error('Team not found:', teamId);
        return;
      }

      const isTeamChanging = this.selectedTeamId !== teamId;
      const isManagementOverview =
        teamId === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID;

      this.selectedTeamId = teamId;
      this.selectedTeam = team.name;
      this.displayTeamName = team.name;
      this.isManagementOverview = isManagementOverview;

      if (isTeamChanging) {
        this.sidebarLoadedOnce = false;
        this.isLoadingSidebar = true;
        this.selectedCollaborator = null;
      }

      localStorage.setItem('selectedTeamId', teamId);

      if (isManagementOverview) {
        await this.loadManagementOverviewData();
      } else {
        await this.loadTeamMembersData(teamId, this.calculateDateRange());
        await this.loadTeamData();

        if (this.selectedCollaborator) {
          const collaboratorExists = this.collaborators.some(
            c => c.userId === this.selectedCollaborator
          );
          if (!collaboratorExists) {
            this.selectedCollaborator = null;
          }
        }
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in onTeamChange:', error);
    }
  }

  /**
   * Carrega o «Painel do Gerente / Diretor / C-Level» a partir de
   * `GET /game/reports/management/dashboard/cached/overview` (sem `team_id`).
   *
   * Não chama endpoints com `team_id` (supervisão, deliveries, team-stats, KPIs por time):
   * apenas KPIs/progresso agregados do gestor.
   */
  private async loadManagementOverviewData(): Promise<void> {
    try {
      this.isLoadingSidebar = !this.sidebarLoadedOnce;
      this.isLoadingGoals = true;
      this.isLoadingMonthlyPointsProgress = true;
      this.isLoadingKPIs = true;
      this.isLoadingCarteira = true;
      this.isLoadingCollaborators = false;

      this.selectedCollaborator = null;
      this.collaborators = [];
      this.teamCarteiraClientes = [];
      this.teamKPIs = [];
      this.teamMembersData = [];
      this.teamMemberIds = [];
      this.teamTotalPoints = 0;
      this.teamTotalTasks = 0;
      this.teamTotalBlockedPoints = 0;
      this.teamAveragePoints = 0;
      this.clientesAtendidosThisMonthCount = null;
      this.participacaoHasMore = false;
      this.useParticipacaoReportsPagination = false;

      this.cdr.markForCheck();

      const monthRange = this.calculateDateRange();
      const seasonRange = this.seasonDates;

      // Importante: `loadManagementOverviewFromCache` precisa terminar **antes** das outras tarefas
      // para que `teamMonthOnTimeDeliveryPct` (= `manager.month_on_time_delivery_pct`) já esteja
      // populado quando `loadTeamKPIs` rodar `syncEntregasPrazoKpiFromParticipacao`.
      await this.loadManagementOverviewFromCache();
      await Promise.all([
        this.loadSidebarData(seasonRange),
        this.loadGoalsData(monthRange),
        this.loadMonthlyPointsBreakdown(),
        // KPI «Entregas no Prazo» (circular): scaffold via `kpiService.getPlayerKPIs` e em seguida
        // `syncEntregasPrazoKpiFromParticipacao` aplica `manager.month_on_time_delivery_pct` do cache.
        this.loadTeamKPIs(),
        // «Clientes atendidos»: agregado da gestão via `management/finished/deliveries/cached` (sem team_id).
        this.loadParticipacaoClientesList('')
      ]);

      // Reaplica o pct do cache caso `loadParticipacaoClientesList` tenha re-sincronizado depois dos KPIs.
      this.syncEntregasPrazoKpiFromParticipacao();

      // Mini dashboard executivo agregado da gestão (top processos / top performers globais).
      void this.loadExecutiveInsights();

      this.updateFormattedSidebarData();
      this.updateTeamNameDisplay();
      this.lastRefresh = new Date();
    } catch (error) {
      console.error('Error loading management overview:', error);
    } finally {
      this.isLoadingGoals = false;
      this.isLoadingMonthlyPointsProgress = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Handle collaborator selection change event.
   * 
   * When a user selects a specific collaborator:
   * 1. Updates the selectedCollaborator property
   * 2. Reloads all data filtered to that collaborator only
   * 
   * When null is passed (deselecting):
   * 1. Clears the selectedCollaborator property
   * 2. Reloads all team data
   * 
   * @param userId - The user ID (email) of the selected collaborator, or null to show team data
   * 
   * @example
   * // Show data for specific collaborator
   * onCollaboratorChange('user@example.com');
   * // Shows only that collaborator's data
   * 
   * // Show team data
   * onCollaboratorChange(null);
   * // Shows aggregated team data
   */
  async onCollaboratorChange(userId: string | null): Promise<void> {
    // Update the selected collaborator
    this.selectedCollaborator = userId;
    
    // When a specific collaborator is selected, switch to goals tab
    // When no collaborator is selected (showing all), switch back to team view
    if (userId) {
      this.activeTab = 'goals';
      console.log('👤 Filtering data for collaborator:', userId);
    } else {
      // Reset to team view when "Redefinir seleção" is selected
      this.activeTab = 'goals'; // Keep on goals tab to show team KPIs and progress
      console.log('👥 Showing team data (no collaborator selected)');
    }
    
    // Update team name display immediately
    this.updateTeamNameDisplay();
    
    // Reload data with the new filter
    if (this.selectedTeamId) {
      await this.loadTeamData();
    }
    
    this.cdr.markForCheck();
  }

  /**
   * Update team name display based on current selection
   * This ensures the team name is correctly displayed when switching between collaborator and team view
   */
  private updateTeamNameDisplay(): void {
    // Calculate and update displayTeamName explicitly
    if (this.selectedCollaborator) {
      const collaborator = this.collaborators.find(c => c.userId === this.selectedCollaborator);
      this.displayTeamName = collaborator?.name || this.formatCollaboratorName(this.selectedCollaborator) || '';
    } else {
      // Show team name
      if (this.selectedTeam && this.selectedTeam.trim().length > 0) {
        this.displayTeamName = this.selectedTeam;
      } else if (this.selectedTeamId) {
        const team = this.teams.find(t => t.id === this.selectedTeamId);
        if (team && team.name) {
          this.selectedTeam = team.name;
          this.displayTeamName = team.name;
        } else {
          this.displayTeamName = this.selectedTeamId;
        }
      } else {
        this.displayTeamName = '';
      }
    }
    // Force change detection
    this.cdr.markForCheck();
  }


  /**
   * Handle month selection change event.
   * 
   * When a user navigates to a different month:
   * 1. Updates the selectedMonthsAgo property
   * 2. Updates the selectedMonth Date object
   * 3. Reloads all team data for the new month
   * 
   * @param monthsAgo - Number of months before current month (0 = current, 1 = previous, etc.)
   * 
   * @example
   * // Current month
   * onMonthChange(0);
   * 
   * // Previous month
   * onMonthChange(1);
   * 
   * // Two months ago
   * onMonthChange(2);
   * 
   * @see {@link loadTeamData}
   * @see {@link calculateDateRange}
   */
  /**
   * Handle month selection change event.
   * 
   * When a user navigates to a different month:
   * 1. Updates the selectedMonthsAgo property
   * 2. Updates the selectedMonth Date object
   * 3. Reloads all team data for the new month
   * 
   * Similar to gamification-dashboard implementation.
   * 
   * @param monthsAgo - Number of months before current month (0 = current, 1 = previous, etc.)
   * 
   * @example
   * // Current month (February 2026)
   * onMonthChange(0);
   * 
   * // Previous month (January 2026)
   * onMonthChange(1);
   * 
   * @see {@link loadTeamData}
   * @see {@link calculateDateRange}
   */
  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    
    // Handle "Toda temporada" (-1) — undefined means no month filtering
    if (monthsAgo === -1) {
      this.selectedMonth = undefined;
      this.announceToScreenReader('Filtro alterado para toda temporada');
    } else {
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);
      this.selectedMonth = date;
      const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      this.announceToScreenReader(`Mês alterado para ${monthName}`);
    }
    
    this.loadTeamData();

    // Se o preset "mês selecionado" estiver ativo, recalcula o tamanho do período
    // (para labels/acessibilidade dos gráficos) e garante recarga da aba quando visível.
    if (this.productivityPeriodSelection === 0) {
      const { start, end } = this.computeProductivityDateRangeInternal();
      const daysInclusive = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
      this.selectedPeriod = Math.max(1, daysInclusive);
    }
  }

  /**
   * Handle period change from productivity tab
   */
  onPeriodChange(period: number): void {
    this.productivityPeriodSelection = period;
    // `selectedPeriod` permanece numérico porque é usado por componentes de gráfico e helpers existentes.
    if (period !== 0) {
      this.selectedPeriod = period;
    } else {
      const { start, end } = this.computeProductivityDateRangeInternal();
      const daysInclusive = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
      this.selectedPeriod = Math.max(1, daysInclusive);
    }
    if (this.activeTab !== 'productivity' || !this.productivityAnalysisTabEnabled) {
      return;
    }
    void this.loadProductivityData(this.computeProductivityDateRange());
  }


  /**
   * Switch active tab
   */
  switchTab(tab: 'goals' | 'productivity'): void {
    if (tab === 'productivity' && !this.productivityAnalysisTabEnabled) {
      return;
    }
    this.activeTab = tab;
    if (tab === 'productivity' && !this.selectedCollaborator && this.productivityAnalysisTabEnabled) {
      void this.loadProductivityData(this.computeProductivityDateRange());
    }
  }

  /**
   * Intervalo do gráfico de produtividade (rolling window), normalizado ao dia.
   * Isso evita gerar `start/end` diferentes a cada clique, permitindo cache do request
   * (`/game/reports/team/daily-finished-stats`) quando alterna entre abas.
   */
  private computeProductivityDateRange(): { start: Date; end: Date } {
    const { start, end } = this.computeProductivityDateRangeInternal();
    this.productivityLastRangeEnd = end;
    return { start: start.toDate(), end: end.toDate() };
  }

  /**
   * Produz um intervalo coerente com o seletor de período:
   * - `number`: janela móvel (últimos N dias) como antes.
   * - `currentMonth`: do início do mês selecionado até o "dia atual" dentro desse mês.
   */
  private computeProductivityDateRangeInternal(): { start: dayjs.Dayjs; end: dayjs.Dayjs } {
    const today = dayjs();
    const selection = this.productivityPeriodSelection;

    if (selection !== 0) {
      const end = today.endOf('day');
      const start = end.subtract(this.selectedPeriod, 'day').startOf('day');
      return { start, end };
    }

    const baseMonth = this.selectedMonth ? dayjs(this.selectedMonth) : today;
    const start = baseMonth.startOf('month').startOf('day');
    const isCurrentMonth = baseMonth.isSame(today, 'month');
    const end = isCurrentMonth ? today.endOf('day') : baseMonth.endOf('month').endOf('day');
    return { start, end };
  }

  onProductivityTabDisabledHover(active: boolean, event?: MouseEvent): void {
    if (this.productivityAnalysisTabEnabled) {
      return;
    }
    if (active && event) {
      this.ensureProductivityTabBodyToast();
      this.updateProductivityTabBodyToastPosition(event);
    } else {
      this.removeProductivityTabBodyToast();
    }
  }

  onProductivityTabDisabledMove(event: MouseEvent): void {
    if (!this.productivityAnalysisTabEnabled && this.productivityTabBodyToastEl) {
      this.updateProductivityTabBodyToastPosition(event);
    }
  }

  private ensureProductivityTabBodyToast(): void {
    if (this.productivityTabBodyToastEl) {
      return;
    }
    const el = this.renderer.createElement('div');
    this.renderer.addClass(el, 'tab-disabled-hover-toast');
    this.renderer.setAttribute(el, 'role', 'status');
    this.renderer.setAttribute(el, 'aria-live', 'polite');
    el.textContent = this.productivityTabDisabledToastMessage;
    this.renderer.appendChild(this.document.body, el);
    this.productivityTabBodyToastEl = el;
  }

  private updateProductivityTabBodyToastPosition(event: MouseEvent): void {
    if (!this.productivityTabBodyToastEl) {
      return;
    }
    this.renderer.setStyle(this.productivityTabBodyToastEl, 'left', `${event.clientX}px`);
    this.renderer.setStyle(this.productivityTabBodyToastEl, 'top', `${event.clientY}px`);
  }

  private removeProductivityTabBodyToast(): void {
    if (this.productivityTabBodyToastEl) {
      this.renderer.removeChild(this.document.body, this.productivityTabBodyToastEl);
      this.productivityTabBodyToastEl = null;
    }
  }

  /**
   * Refresh all dashboard data with cache clearing.
   * 
   * This method:
   * 1. Sets loading state to true
   * 2. Clears all cached data in TeamAggregateService
   * 3. Reloads all team data from the API
   * 4. Preserves user selections (team, collaborator, month, tab)
   * 5. Updates the last refresh timestamp
   * 
   * Use this when you need to ensure the latest data is displayed,
   * bypassing the 5-minute cache.
   * 
   * @example
   * // Called when user clicks refresh button
   * refreshData();
   * 
   * @see {@link TeamAggregateService.clearCache}
   * @see {@link loadTeamData}
   */
  refreshData(): void {
    // Clear cache
    this.teamAggregateService.clearCache();
    
    // Reload data
    this.loadTeamData();
  }

  /**
   * Get formatted last refresh time as HH:mm:ss string.
   * 
   * Formats the lastRefresh Date object into a time string for display
   * in the dashboard header.
   * 
   * @returns Formatted time string (e.g., "14:35:22")
   * 
   * @example
   * const time = this.getLastRefreshTime();
   * // Returns: "14:35:22"
   */
  getLastRefreshTime(): string {
    return dayjs(this.lastRefresh).format('HH:mm:ss');
  }

  /**
   * Get the display name of the currently selected team.
   * 
   * Looks up the team name from the teams array based on the selectedTeamId.
   * Returns the selectedTeam name directly if available, or looks it up from teams array.
   * 
   * @returns Team display name or empty string
   * 
   * @example
   * this.selectedTeamId = 'FkmdnFU';
   * const name = this.teamName;
   * // Returns: "GESTAO" or the team name from Funifier
   */
  get teamName(): string {
    // If a collaborator is selected, show their name
    if (this.selectedCollaborator) {
      const collaborator = this.collaborators.find(c => c.userId === this.selectedCollaborator);
      return collaborator?.name || this.selectedCollaborator || '';
    }
    
    // If selectedTeam is already set (team name), return it
    if (this.selectedTeam && this.selectedTeam.trim().length > 0) {
      return this.selectedTeam;
    }
    
    // Otherwise, look it up from teams array using selectedTeamId
    if (this.selectedTeamId) {
      const team = this.teams.find(t => t.id === this.selectedTeamId);
      if (team && team.name) {
        // Update selectedTeam for consistency
        this.selectedTeam = team.name;
        return team.name;
      }
      return this.selectedTeamId;
    }
    
    return '';
  }

  /**
   * Retry loading sidebar data after an error.
   * 
   * Called when the user clicks a retry button in the sidebar error state.
   * Recalculates the date range and attempts to load sidebar data again.
   * 
   * @example
   * // Called from template on retry button click
   * <button (click)="retrySidebarData()">Retry</button>
   * 
   * @see {@link loadSidebarData}
   * @requirements 14.3 - Retry logic for failed queries
   */
  retrySidebarData(): void {
    const dateRange = this.calculateDateRange();
    this.loadSidebarData(dateRange);
  }

  /**
   * Retry loading goals data
   * Requirements: 14.3
   */
  retryGoalsData(): void {
    const dateRange = this.calculateDateRange();
    this.loadGoalsData(dateRange);
  }

  /**
   * Retry loading productivity data
   * Requirements: 14.3
   */
  retryProductivityData(): void {
    if (this.activeTab !== 'productivity' || !this.productivityAnalysisTabEnabled) {
      return;
    }
    void this.loadProductivityData(this.computeProductivityDateRange());
  }

  /**
   * Handle progress card click to open modal
   */
  onProgressCardClicked(type: ProgressCardType): void {
    // Map ProgressCardType to ProgressListType
    switch (type) {
      case 'atividades-finalizadas':
        this.progressModalType = 'atividades';
        break;
      case 'atividades-pendentes':
        this.progressModalType = 'atividades-pendentes';
        break;
      case 'atividades-pontos':
        this.progressModalType = 'pontos';
        break;
      case 'processos-pendentes':
        this.progressModalType = 'processos-pendentes';
        break;
      case 'processos-finalizados':
        this.progressModalType = 'processos-finalizados';
        break;
      default:
        this.progressModalType = 'atividades';
    }
    this.isProgressModalOpen = true;
  }

  /**
   * Close progress modal
   */
  onProgressModalClosed(): void {
    this.isProgressModalOpen = false;
  }

  /**
   * Open carteira modal
   */
  openCarteiraModal(): void {
    this.isCarteiraModalOpen = true;
  }

  /**
   * Close carteira modal
   */
  onCarteiraModalClosed(): void {
    this.isCarteiraModalOpen = false;
  }

  /**
   * Load monthly points breakdown (bloqueados and desbloqueados)
   * For team: uses OPTIMIZED single aggregate query for all team members
   * For collaborator: fetches breakdown for specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - Optional collaborator ID. If provided, loads for that collaborator only. Otherwise, aggregates for team.
   * @returns Promise that resolves when monthly points breakdown is loaded
   */
  private async loadMonthlyPointsBreakdown(collaboratorId?: string): Promise<void> {
    try {
      if (collaboratorId) {
        const breakdown = await firstValueFrom(
          this.actionLogService
            .getMonthlyPointsBreakdown(collaboratorId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error(`Error loading monthly points breakdown for collaborator ${collaboratorId}:`, error);
          return { bloqueados: 0, desbloqueados: 0 };
        });

        this.monthlyPointsBreakdown = breakdown;
      } else {
        if (!this.selectedTeam) {
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
          this.cdr.markForCheck();
          return;
        }
        if (this.playerService.usesGame4uWalletFromStats()) {
          const pts =
            this.teamSupervisionBundle != null
              ? Math.floor(
                  this.teamSupervisionBundle.activity.pontosDone ??
                    this.teamSupervisionBundle.activity.pontos ??
                    0
                )
              : 0;
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: pts };
        } else {
          const dr = this.calculateDateRange();
          const members = this.collaborators.map(c => c.userId).filter(Boolean);
          const breakdown = await firstValueFrom(
            this.teamAggregateService
              .getTeamMonthlyPointsBreakdown(this.getGame4uTeamHttpParam(), members, dr.start, dr.end)
              .pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error('Error loading team monthly points breakdown:', error);
            return { bloqueados: 0, desbloqueados: 0 };
          });
          this.monthlyPointsBreakdown = breakdown;
        }
        console.log('✅ Monthly points breakdown (team):', this.monthlyPointsBreakdown);
      }
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading monthly points breakdown:', error);
      this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
      this.cdr.markForCheck();
    }
  }

  /**
   * Funifier / modais legados: todos os membros; Game4U usa `teamIds` (sem `email` na API).
   */
  get teamPlayerIdsForModal(): string {
    return this.teamMemberIds.join(',');
  }

  /**
   * Id numérico Game4U para `team_id` em `/game/reports/user-actions` (por entrada do seletor).
   */
  private resolveGame4uTeamIdForPickerId(teamPickerId: string): string | undefined {
    const tid = (teamPickerId || '').trim();
    if (!tid || tid === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID) {
      return undefined;
    }
    const entry = this.teams.find(t => t.id === tid) as (Team & { game4uTeamId?: string }) | undefined;
    const fromPicker = entry?.game4uTeamId?.trim();
    if (fromPicker && /^\d+$/.test(fromPicker)) {
      return fromPicker;
    }
    if (/^\d+$/.test(tid)) {
      return tid;
    }
    if (tid === (this.selectedTeamId || '').trim()) {
      const report = this.getGame4uReportTeamId();
      if (report?.trim()) {
        return report.trim();
      }
      const http = this.getGame4uTeamHttpParam();
      if (http && /^\d+$/.test(http)) {
        return http;
      }
    }
    return undefined;
  }

  /**
   * Escopos `team_id` (Game4U) para insights, modal de tarefas, etc.
   */
  getInsightsScopeTeamIds(): string[] {
    if (!this.playerService.usesGame4uWalletFromStats()) {
      return [];
    }
    const selected = (this.selectedTeamId || '').trim();
    const isOverview =
      selected === '' || selected === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID;

    if (!isOverview && selected) {
      const one = this.resolveGame4uTeamIdForPickerId(selected);
      return one ? [one] : selected ? [selected] : [];
    }

    const ids: string[] = [];
    for (const t of this.teams) {
      if (t.id === TeamManagementDashboardComponent.MANAGEMENT_OVERVIEW_TEAM_ID) {
        continue;
      }
      const resolved = this.resolveGame4uTeamIdForPickerId(t.id);
      if (resolved && !ids.includes(resolved)) {
        ids.push(resolved);
      }
    }
    return ids;
  }

  get progressModalTeamIds(): string[] {
    return this.getInsightsScopeTeamIds();
  }

  /**
   * Game4U: não enviar e-mail do gestor à API — só `team_id`(s). Com colaborador selecionado,
   * o e-mail fica apenas para filtro local no modal.
   */
  get progressModalPlayerId(): string {
    if (this.selectedCollaborator?.trim()) {
      return this.selectedCollaborator.trim();
    }
    if (this.progressModalTeamIds.length > 0) {
      return '';
    }
    if (!this.playerService.usesGame4uWalletFromStats()) {
      return this.teamPlayerIdsForModal;
    }
    return (this.getPanelPlayerId() || '').trim();
  }

  /** Primeiro `team_id` (compat. com inputs legados do modal). */
  get progressModalTeamId(): string | null {
    const ids = this.progressModalTeamIds;
    return ids.length > 0 ? ids[0] : null;
  }

  /**
   * Indica se o modal de tarefas pendentes deve buscar o gráfico através do endpoint
   * `GET /game/reports/team/daily-pending-stats` (agregado diário com filtro por `due_date`).
   *
   * Aplica-se a **SUPERVISOR** e **LIDER_CELULA** — o gráfico do mês inteiro é resolvido com uma
   * única chamada, sem depender da paginação de `GET /game/reports/user-actions` para alimentá-lo.
   */
  get useDailyPendingStatsApiForModal(): boolean {
    return this.userProfileService.isSupervisor() || this.userProfileService.isLiderCelula();
  }

  /**
   * Ator dos pedidos Game4U no seletor de mês: colaborador selecionado, senão o gestor (painel).
   */
  getTeamPlayerIdForMonthSelector(): string {
    if (this.selectedCollaborator) {
      return this.selectedCollaborator;
    }
    return this.getPanelPlayerId() || '';
  }

  /**
   * Abre o modal de perguntas frequentes do painel de gestão.
   */
  abrirModalFaq(): void {
    this.ngbModal.open(ModalTeamManagementFaqComponent, { size: 'lg', scrollable: true });
  }

  /**
   * Toggle sidebar collapsed state
   */
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.announceToScreenReader(this.sidebarCollapsed ? 'Menu recolhido' : 'Menu expandido');
  }

  /**
   * Format KPI value as integer with percentage sign
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
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: Clean company name from empid_cnpj__c collection
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    console.log('📊 Team getCompanyDisplayName called:', { cnpj, displayName, hasInMap: this.cnpjNameMap.has(cnpj), mapSize: this.cnpjNameMap.size });
    return displayName || cnpj;
  }

  getClienteAtendidoDisplayName(cliente: CompanyDisplay): string {
    const t = cliente.delivery_title?.trim();
    const ec = cliente.delivery_extra_cnpj?.trim();
    const base = t || this.getCompanyDisplayName(cliente.cnpj) || cliente.cnpj;
    if (ec) {
      return t ? `${t} · ${ec}` : `${base} · ${ec}`;
    }
    return base;
  }

  /** Lista: mesmo texto que `getClienteAtendidoDisplayName` + CNPJ (lookup) ao lado quando útil. */
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

  private formatCnpjBr14(digits14: string): string {
    const d = digits14.replace(/\D/g, '');
    if (d.length !== 14) {
      return digits14;
    }
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

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

  getCompanyStatus(cnpj: string): string {
    return this.cnpjStatusMap.get(cnpj) || '';
  }

  isCompanyActive(cnpj: string): boolean {
    return this.cnpjStatusMap.get(cnpj)?.toLowerCase() === 'ativa';
  }

  /**
   * Open company detail modal
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
   * Announce message to screen reader
   */
  private announceToScreenReader(message: string): void {
    this.screenReaderAnnouncement = message;
    this.cdr.markForCheck();
    // Clear after announcement
    setTimeout(() => {
      this.screenReaderAnnouncement = '';
      this.cdr.markForCheck();
    }, 1000);
  }

  /**
   * KPIs: mesmo serviço que o painel de gamificação individual (`KPIService.getPlayerKPIs`),
   * com chave de cache incluindo o `team_id` do painel para não misturar equipas.
   */
  private async loadTeamKPIs(collaboratorId?: string): Promise<void> {
    try {
      this.isLoadingKPIs = true;
      
      const scope = this.getGame4uTeamScopeId();
      if (collaboratorId) {
        const kpis = await firstValueFrom(
          this.kpiService
            .getPlayerKPIs(collaboratorId, this.selectedMonth, this.actionLogService, scope)
            .pipe(takeUntil(this.destroy$))
        );
        this.teamKPIs = kpis || [];
      } else {
        const panelId = this.getPanelPlayerId();
        if (!panelId) {
          this.teamKPIs = [];
        } else {
          const kpis = await firstValueFrom(
            this.kpiService
              .getPlayerKPIs(panelId, this.selectedMonth, this.actionLogService, scope)
              .pipe(takeUntil(this.destroy$))
          );
          this.teamKPIs = kpis || [];
        }
        console.log('✅ Team KPIs (mesmo fluxo que gamificação individual, cache por team_id):', this.teamKPIs.length);
      }

      this.syncEntregasPrazoKpiFromParticipacao();

      this.isLoadingKPIs = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team KPIs:', error);
      this.teamKPIs = [];
      this.isLoadingKPIs = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * KPI «entregas-prazo»: média das % na lista «Clientes atendidos este mês» (após gamificação),
   * alinhado a `gamification-dashboard.syncEntregasPrazoKpiFromParticipacao`.
   */
  private getEntregasPrazoPercentFromSupervisionCache(): number | null {
    if (
      !this.playerService.usesGame4uWalletFromStats() ||
      this.selectedCollaborator != null ||
      this.selectedMonth == null ||
      this.teamMonthOnTimeDeliveryPct == null
    ) {
      return null;
    }
    return this.teamMonthOnTimeDeliveryPct;
  }

  private syncEntregasPrazoKpiFromParticipacao(): void {
    const idx = this.teamKPIs.findIndex(k => k.id === 'entregas-prazo');
    if (idx === -1) {
      return;
    }

    const fromCache = this.getEntregasPrazoPercentFromSupervisionCache();
    if (fromCache !== null) {
      this.applyTeamEntregasPrazoKpiValue(idx, fromCache);
      return;
    }

    if (this.isLoadingCarteira || this.isLoadingParticipacaoKpi) {
      return;
    }

    const base = this.teamKPIs[idx];
    const avg = this.getEntregasPrazoPercentFromParticipacao();

    if (avg === null) {
      const updated: KPIData = {
        ...base,
        current: 0,
        percentage: 0,
        color: 'gray',
        isMissing: true
      };
      this.teamKPIs = this.teamKPIs.map((k, i) => (i === idx ? updated : k));
      this.updateFormattedSidebarData();
      this.cdr.markForCheck();
      return;
    }

    this.applyTeamEntregasPrazoKpiValue(idx, avg);
  }

  private applyTeamEntregasPrazoKpiValue(idx: number, avg: number): void {
    const base = this.teamKPIs[idx];
    const target = base.target;
    const superTarget = base.superTarget ?? 100;
    const updated: KPIData = {
      ...base,
      current: avg,
      isMissing: false,
      percentage: Math.min(avg, 100),
      color: this.kpiService.getKPIColorByGoals(avg, target, superTarget)
    };
    this.teamKPIs = this.teamKPIs.map((k, i) => (i === idx ? updated : k));
    this.updateFormattedSidebarData();
    this.cdr.markForCheck();
  }

  /**
   * Média dos percentuais na lista de clientes atendidos (mês), após enriquecimento gamificação.
   */
  getEntregasPrazoPercentFromParticipacao(): number | null {
    if (this.isLoadingCarteira || this.teamCarteiraClientes.length === 0) {
      return null;
    }
    if (this.isLoadingParticipacaoKpi) {
      return null;
    }
    const values = this.teamCarteiraClientes
      .map(c => this.getListaEntregaPercent(c))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (values.length === 0) {
      return null;
    }
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  /**
   * Valor atual do anel: para entregas no prazo, prioriza a média da lista de participação.
   */
  getKpiCurrentValue(kpi: KPIData): number {
    if (kpi.id === 'entregas-prazo') {
      const fromCache = this.getEntregasPrazoPercentFromSupervisionCache();
      if (fromCache !== null) {
        return fromCache;
      }
      const fromList = this.getEntregasPrazoPercentFromParticipacao();
      if (fromList !== null) {
        return fromList;
      }
    }
    return kpi.current;
  }

  /** Circular «Entregas no Prazo»: aguarda gamificação só se não houver % no cache de supervisão. */
  isEntregasPrazoCircularPending(kpi: KPIData): boolean {
    if (kpi.id !== 'entregas-prazo') {
      return false;
    }
    if (this.getEntregasPrazoPercentFromSupervisionCache() !== null) {
      return false;
    }
    return (
      !this.isLoadingCarteira &&
      this.teamCarteiraClientes.length > 0 &&
      this.isLoadingParticipacaoKpi
    );
  }

  /** Estado «dado indisponível» do anel para entregas: cache de supervisão ou lista de participação. */
  getKpiCircularIsMissing(kpi: KPIData): boolean {
    if (kpi.id !== 'entregas-prazo') {
      return !!kpi.isMissing;
    }
    if (this.getEntregasPrazoPercentFromSupervisionCache() !== null) {
      return false;
    }
    if (this.isLoadingCarteira || this.teamCarteiraClientes.length === 0) {
      return !!kpi.isMissing;
    }
    if (this.isLoadingParticipacaoKpi) {
      return false;
    }
    return this.getEntregasPrazoPercentFromParticipacao() === null;
  }

  /** Barra lateral recolhida: % entregas como no painel individual. */
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
   * Get KPI color based on goals (red/yellow/green)
   */
  private getKPIColorByGoals(current: number, target: number, superTarget: number): 'red' | 'yellow' | 'green' {
    if (current >= superTarget) {
      return 'green';
    } else if (current >= target) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  /**
   * Round value for KPI display
   */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /**
   * Track by function for KPI list
   */
  trackByKpiId(index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /**
   * KPIs na barra lateral compacta (sem meta de empresas na carteira, alinhado ao painel principal).
   */
  get enabledKPIs(): KPIData[] {
    return this.teamKPIs.filter(k => k.id !== 'numero-empresas');
  }

  /**
   * Circular “Pontos no mês”: atingido = pontos só em DONE; meta = soma em todos os status (Game4U). Sem Game4U: meta provisória action_log.
   */
  get monthlyPointsProgressData(): { current: number; target: number } {
    // Evita preencher parcialmente enquanto ainda falta o `/game/reports/open/summary`
    // (ou qualquer fonte que complete a meta). Enquanto carrega, o componente fica 100% em pending.
    if (this.isLoadingMonthlyPointsProgress) {
      return { current: 0, target: 1 };
    }
    const donePts = this.teamActivityMetrics?.pontosDone;
    const allPts = this.teamActivityMetrics?.pontosTodosStatus;
    const current =
      donePts !== undefined ? Math.floor(donePts) : Math.floor(this.teamActivityMetrics?.pontos ?? 0);

    if (this.monthlyPointsGoalTarget != null && this.monthlyPointsGoalTarget > 0) {
      return { current, target: Math.max(this.monthlyPointsGoalTarget, 1) };
    }

    if (donePts !== undefined && allPts !== undefined) {
      const target = Math.max(Math.floor(allPts), 1);
      return { current, target };
    }
    const pendingTasks =
      (this.teamProcessMetrics?.pendentes ?? 0) + (this.teamProcessMetrics?.incompletas ?? 0);
    const target =
      pendingTasks > 0
        ? pendingTasks * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG
        : Math.max(current, 1);
    return { current, target };
  }

  get monthlyPointsGoalColor(): 'red' | 'yellow' | 'green' | 'gray' {
    if (this.isLoadingMonthlyPointsProgress) {
      return 'gray';
    }
    const { current, target } = this.monthlyPointsProgressData;
    const superGoal = Math.ceil(target * 1.5);
    return this.kpiService.getKPIColorByGoals(current, target, superGoal);
  }

  get monthlyPointsProgressLabel(): string {
    return this.selectedCollaborator ? 'Pontos no mês' : 'Pontos no mês (equipe)';
  }

  get teamMonthlyPointsHelpText(): string {
    const scope = this.selectedCollaborator
      ? 'Mostra os pontos deste colaborador no período que você escolheu no filtro. '
      : 'Mostra a soma dos pontos de toda a equipe no período do filtro. ';
    return (
      scope +
      'O que sobe no indicador são só as atividades já concluídas; a meta é o total planejado para o período (incluindo o que ainda falta fechar)'
    );
  }

  /**
   * Update formatted sidebar data for gamification dashboard components
   * Converts team data to PointWallet and SeasonProgress formats
   */
  private updateFormattedSidebarData(): void {
    // Convert seasonPoints to PointWallet format
    // Note: moedas is not available for teams, so we set it to 0
    this.teamPointWallet = {
      bloqueados: Math.floor(this.seasonPoints?.bloqueados || 0),
      desbloqueados: Math.floor(this.seasonPoints?.desbloqueados || 0),
      moedas: 0 // Teams don't have moedas, only individual players
    };
    
    // Calculate metas from team KPIs
    // Metas = count of KPIs where current >= target
    const totalKPIs = this.teamKPIs ? this.teamKPIs.length : 0;
    const metasAchieved = this.teamKPIs ? this.teamKPIs.filter(kpi => kpi.current >= kpi.target).length : 0;
    
    // Convert progressMetrics to SeasonProgress format
    // For teams, we use:
    // - metas: Calculated from teamKPIs (number of KPIs achieved / total KPIs)
    // - clientes: Count from player_company__c cnpj_resp (from numero-empresas KPI)
    // - tarefasFinalizadas: Game4U equipa = `tasks_count` de finished/summary; resto = progressMetrics.atividadesFinalizadas
    const empresasKpi = this.teamKPIs?.find(kpi => kpi.id === 'numero-empresas');
    const uniqueClientes = empresasKpi ? empresasKpi.current : (this.teamCarteiraClientes?.length || 0);

    const progress: SeasonProgress = {
      metas: {
        current: metasAchieved,
        target: totalKPIs
      },
      clientes: uniqueClientes,
      tarefasFinalizadas: this.progressMetrics?.atividadesFinalizadas || 0,
      seasonDates: this.seasonDates
    };
    if (
      this.teamSidebarDeliveryStatsTotal !== undefined &&
      Number.isFinite(this.teamSidebarDeliveryStatsTotal)
    ) {
      progress.deliveryStatsTotal = Math.floor(this.teamSidebarDeliveryStatsTotal);
    }
    this.teamSeasonProgress = progress;
    
    console.log('📊 Team metas updated from KPIs:', this.teamSeasonProgress.metas, `(${metasAchieved}/${totalKPIs})`, `from ${totalKPIs} KPIs`);
    
    this.cdr.markForCheck();
  }

  /**
   * Format collaborator name for display (public method for template)
   */
  getCollaboratorDisplayName(userId: string): string {
    return this.formatCollaboratorName(userId);
  }

  /**
   * Format collaborator name from email or use provided name
   * Converts email like "joyce.carla@bwa.global" to "Joyce Carla"
   * 
   * @param userId - The user ID (email) or collaborator ID
   * @param collaboratorName - Optional name from collaborator object
   * @returns Formatted name for display
   */
  private formatCollaboratorName(userId: string, collaboratorName?: string): string {
    // If we have a name from the collaborator object, use it
    if (collaboratorName && collaboratorName.trim()) {
      return collaboratorName.trim();
    }
    
    // Otherwise, extract and format from email
    if (userId && userId.includes('@')) {
      // Get the part before @
      const emailPrefix = userId.split('@')[0];
      // Replace dots with spaces and split into words
      const words = emailPrefix.split('.');
      // Capitalize each word
      const formattedWords = words.map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
      return formattedWords.join(' ');
    }
    
    // Fallback: return userId as-is if it's not an email
    return userId;
  }

  /**
   * Save clientes meta configuration for selected collaborator(s)
   * Updates the extra.client_goals field (number) in Funifier player object
   */
  async saveClientesMeta(): Promise<void> {
    if (!this.metaConfig.targetValue || this.metaConfig.targetValue < 0) {
      this.metaSaveMessage = 'Por favor, insira um valor válido para a meta';
      this.metaSaveSuccess = false;
      this.cdr.markForCheck();
      return;
    }

    this.isSavingMeta = true;
    this.metaSaveMessage = '';
    this.cdr.markForCheck();

    try {
      const targetValue = Math.floor(this.metaConfig.targetValue);
      const selectedCollaborator = this.metaConfig.selectedCollaborator;

      if (selectedCollaborator === 'all') {
        // Update all collaborators in the team
        if (this.collaborators.length === 0) {
          this.metaSaveMessage = 'Nenhum colaborador encontrado na equipe';
          this.metaSaveSuccess = false;
          this.isSavingMeta = false;
          this.cdr.markForCheck();
          return;
        }

        // Update all collaborators
        const updatePromises = this.collaborators.map(collaborator => 
          this.updatePlayerClientesTarget(collaborator.userId, targetValue)
        );

        await Promise.all(updatePromises);
        this.metaSaveMessage = `Meta de ${targetValue} clientes configurada para todos os ${this.collaborators.length} colaboradores`;
        this.toastService.success(`Meta configurada para todos os colaboradores`);
      } else {
        // Update single collaborator
        const collaborator = this.collaborators.find(c => c.userId === selectedCollaborator);
        const collaboratorName = collaborator?.name || this.formatCollaboratorName(selectedCollaborator);
        
        await this.updatePlayerClientesTarget(selectedCollaborator, targetValue);
        this.metaSaveMessage = `Meta de ${targetValue} clientes configurada para ${collaboratorName}`;
        this.toastService.success(`Meta configurada para ${collaboratorName}`);
      }

      this.metaSaveSuccess = true;
      
      // Reset form after successful save
      setTimeout(() => {
        this.resetMetaForm();
      }, 2000);
      
    } catch (error: any) {
      console.error('Error saving clientes meta:', error);
      this.metaSaveMessage = error?.message || 'Erro ao salvar meta. Tente novamente.';
      this.metaSaveSuccess = false;
    } finally {
      this.isSavingMeta = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Update player's client_goals in Funifier
   * @param playerId - Player ID (email)
   * @param targetValue - Target number of clients
   */
  private async updatePlayerClientesTarget(playerId: string, targetValue: number): Promise<void> {
    try {
      // First, get current player data to preserve existing extra fields
      const currentPlayerData = await firstValueFrom(
        this.backendApi.get<any>(`player/${playerId}`)
      );

      // Prepare update payload following Funifier API structure
      // Payload: { "extra": { "client_goals": number } }
      const updatePayload: any = {
        extra: {
          ...(currentPlayerData.extra || {}),
          client_goals: targetValue
        }
      };

      // Update player using PUT endpoint
      await firstValueFrom(
        this.backendApi.put<any>(`player/${playerId}`, updatePayload)
      );

      console.log(`✅ Updated client_goals for ${playerId}:`, targetValue);
    } catch (error: any) {
      console.error(`❌ Error updating client_goals for ${playerId}:`, error);
      throw new Error(`Erro ao atualizar meta para ${playerId}: ${error.message}`);
    }
  }

  /**
   * Reset meta configuration form
   */
  resetMetaForm(): void {
    this.metaConfig = {
      selectedCollaborator: 'all',
      targetValue: null
    };
    this.metaSaveMessage = '';
    this.metaSaveSuccess = false;
    this.cdr.markForCheck();
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
        void this.sessaoProvider.logout();
      });
  }
}
