import {
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import * as moment from 'moment';
import { dateFromMonthFilterOffset } from '@utils/month-filter-offset.util';
import { ActionLogService } from '@services/action-log.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from '@services/toast.service';
import {
  buildOrgKpiDrilldownCompareContext,
  OrgKpiDrilldownCompareContext
} from '@services/org-hierarchy-kpi-compare.mapper';
import {
  OrganizationHierarchyReportResponse,
  OrganizationHierarchyReportParams,
  OrgHierarchyHighlightItem,
  OrgHierarchyNode,
  OrgHierarchyKpiDetailKey,
  OrgHierarchyNodeType,
  CriticalClientItem,
  CriticalClientIssueFilter,
  OrgHierarchyClientListKey,
  OrganizationHierarchyInsightItem,
  OrganizationHierarchyInsightsResponse
} from '@model/game4u-api.model';
import {
  formatBrl,
  formatOrgHierarchyComparePct,
  getOrgHierarchyCompareTone,
  getOrgHierarchyScopeTitle,
  mapFinishedByDowToWeekdayStats,
  mapAccessByDowToWeekdayStats,
  mapPlayerAccessRows,
  avgAccessSessionsPerActiveUser,
  mapClientClassificationTiers,
  clientClassificationTotal,
  clientClassificationMaxCount,
  clientClassificationBarHeight,
  getHighlightTeamLabel,
  getHighlightGerenciaLabel,
  getHighlightDiretoriaLabel,
  highlightHasContextForViewTab,
  getDerivedHighlightsForTab,
  highlightViewTabHasNodes,
  ORG_HIGHLIGHT_MTD_COLUMNS,
  ORG_GLOBAL_MTD_METRICS,
  ORG_RANKING_ESSENTIAL_COLUMNS,
  ORG_RANKING_DETAIL_COLUMNS,
  OrgGlobalMtdMetric,
  OrgPipelineSegment,
  mapOrgPipelineSegments,
  orgPipelineSegmentWidthPct,
  orgPipelineSegmentsTotal,
  buildOrgOperationalRiskAlerts,
  filterOrgPipelineLegendSegments,
  OrgOperationalRiskAlert,
  computeFinishedVsOpenPct,
  formatOrgGlobalMtdValue,
  collectOrgHierarchyNodesByType,
  findOrgHierarchyNodeById,
  computeOrgPointsGoalPct,
  computeOrgDeliveriesGoalPct,
  ORG_ON_TIME_PCT_GOAL,
  getOnTimeDeliveryGoalForMonth,
  formatOrgHierarchyNodeMtdCell,
  formatOrgPointsGoalPct,
  formatOrgRankingCell,
  getOrgPointsGoalTone,
  OrgRankingColumn,
  getDirectorateRankingLabel,
  getOrgHierarchyAreaLabelClass,
  resolveDirectorateAreaLabel,
  OrgHighlightMtdColumn,
  formatHighlightMtdCell,
  OrgHierarchyHighlightViewTab,
  OrgClientClassificationTier,
  OrgHierarchyRankingSortBy,
  OrgHierarchyReportPanelTab,
  OrgHierarchyTreeViewMode,
  getOrgHierarchyNodeTypeLabel,
  OrgHierarchyWeekdayStat,
  OrgHierarchyAccessWeekdayStat,
  OrgHierarchyPlayerAccessRow,
  sortOrgHierarchyChildren,
  weekdayBarHeight,
  weekdayMaxFinishedCount,
  weekdayMaxAccessDays,
  weekdayMaxAccessSessions
} from '@services/org-hierarchy-report.mapper';
import {
  buildOrgPaceGoalComparison,
  buildOrgPaceSupportingCards,
  hasOrgPaceMetrics,
  orgPaceCalendarLabel,
  OrgPaceGoalComparison,
  OrgPaceMetricCard
} from '@services/org-hierarchy-pace.mapper';
import {
  buildCriticalClientKpiChips,
  criticalClientHasOperationalIssues,
  formatCriticalClientRiskScore,
  getCriticalClientTagLabels,
  getCriticalClientTierClass,
  getCriticalClientTierLabel,
  getCriticalClientsTopList,
  hasCriticalClients,
  CriticalClientKpiChip
} from '@services/org-hierarchy-critical-clients.mapper';
import {
  OrgHierarchyInsightsErrorInfo,
  orgHierarchyInsightCategoryLabel,
  orgHierarchyInsightPriorityClass,
  orgHierarchyInsightPriorityLabel,
  orgHierarchyInsightsSourceLabel,
  parseOrgHierarchyInsightsError
} from '@services/org-hierarchy-insights.mapper';
import {
  buildOrgHierarchyCriticalClientsDeliveriesExportFilename
} from '@services/org-hierarchy-kpi-export.mapper';
import { buildOrgHierarchyClientListExportFilename } from '@services/org-hierarchy-client-lists.mapper';
import {
  downloadBlobFile,
  parseHttpContentDispositionFilename
} from '@utils/spreadsheet-export';

@Component({
  selector: 'app-organization-hierarchy-report',
  templateUrl: './organization-hierarchy-report.component.html',
  styleUrls: ['./organization-hierarchy-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrganizationHierarchyReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly simulationChange$ = new Subject<number | null>();
  private loadGen = 0;
  private insightsLoadGen = 0;
  private insightsDepth = 7; // teste econômico: se não houver cache em depth=7, tenta depth=1
  /** Análise executiva (IA) — desativada no template; não dispara GET de insights. */
  private readonly aiExecutiveAnalysisEnabled = false;

  selectedMonthsAgo = 0;
  selectedMonth: Date = new Date();

  report: OrganizationHierarchyReportResponse | null = null;
  insights: OrganizationHierarchyInsightsResponse | null = null;
  isLoading = true;
  isLoadingInsights = false;
  isGeneratingInsights = false;
  isExportingCriticalClientsDeliveries = false;
  isExportingClientsServed = false;
  criticalClientsModalOpen = false;
  hasLoadError = false;
  isEmpty = false;
  insightsNotFound = false;
  insightsBanner: OrgHierarchyInsightsErrorInfo | null = null;

  simulationPotBrl: number | null = null;
  rankingSortBy: OrgHierarchyRankingSortBy = 'on_time_pct';
  rankingShowDetails = false;
  treeShowAllMetrics = false;
  treeViewMode: OrgHierarchyTreeViewMode = 'table';
  flowchartSearchHighlightIds = new Set<string>();
  peopleHighlightTab: 'destaques' | 'atencao' = 'destaques';
  peopleSearch = '';
  accessWeekdayView: 'days' | 'sessions' = 'days';
  reportPanelTab: OrgHierarchyReportPanelTab = 'operations';
  highlightViewTab: OrgHierarchyHighlightViewTab = 'gerencia';
  expandedNodeIds = new Set<string>();

  readonly skeletonTabSlots = [0, 1, 2];
  readonly skeletonHeroSlots = [0, 1, 2, 3];
  readonly skeletonPaceCardSlots = [0, 1, 2, 3];
  readonly skeletonPipelineChipSlots = [0, 1, 2, 3];
  readonly skeletonTableRowSlots = [0, 1, 2, 3, 4];
  readonly skeletonWeekdayBarHeights = [28, 44, 18, 52, 36, 22, 48];
  readonly skeletonTreeRowSlots = [0, 1, 2, 3, 4, 5];

  kpiDrilldownContext:
    | {
        kind: 'kpi';
        kpi: OrgHierarchyKpiDetailKey;
        nodeType: OrgHierarchyNodeType;
        nodeId: string;
        nodeLabel: string;
        months: number;
        compareContext: OrgKpiDrilldownCompareContext | null;
        reportParams: OrganizationHierarchyReportParams | null;
        clientListKey?: OrgHierarchyClientListKey | null;
      }
    | {
        kind: 'critical_client';
        client: CriticalClientItem;
        issue: CriticalClientIssueFilter;
        nodeType: OrgHierarchyNodeType;
        nodeId: string;
        nodeLabel: string;
      }
    | null = null;

  readonly highlightViewTabs: ReadonlyArray<{
    id: OrgHierarchyHighlightViewTab;
    label: string;
    icon: string;
  }> = [
    { id: 'gerencia', label: 'Gerentes', icon: 'ri-briefcase-line' },
    { id: 'supervisao', label: 'Supervisões', icon: 'ri-team-line' },
    { id: 'player', label: 'Jogadores', icon: 'ri-user-line' }
  ];

  readonly highlightMtdColumns = ORG_HIGHLIGHT_MTD_COLUMNS;
  readonly rankingEssentialColumns = ORG_RANKING_ESSENTIAL_COLUMNS;
  readonly rankingDetailColumns = ORG_RANKING_DETAIL_COLUMNS;
  readonly globalMtdMetrics = ORG_GLOBAL_MTD_METRICS;
  readonly peopleOnTimeColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'on_time_pct')!;
  readonly peopleFinishedColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'finished')!;
  readonly peopleClientsColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'clients_served')!;
  readonly peopleOnboardingColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'clients_onboarding')!;
  readonly peopleChurnColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'clients_acessorias_risco_de_churn')!;
  readonly peoplePointsColumn = ORG_HIGHLIGHT_MTD_COLUMNS.find(c => c.key === 'points_delivered')!;

  readonly reportPanelTabs: ReadonlyArray<{
    id: OrgHierarchyReportPanelTab;
    label: string;
    icon: string;
    description: string;
  }> = [
    {
      id: 'operations',
      label: 'Operacional',
      icon: 'ri-bar-chart-grouped-line',
      description: 'Entregas, metas, riscos e hierarquia organizacional'
    },
    {
      id: 'access',
      label: 'Acessos ao app',
      icon: 'ri-login-circle-line',
      description: 'Engajamento e frequência de uso do aplicativo'
    },
    {
      id: 'simulation',
      label: 'Simulação financeira',
      icon: 'ri-money-dollar-circle-line',
      description: 'Pote fictício rateado pelos pontos MTD da organização'
    }
  ];

  constructor(
    private readonly actionLogService: ActionLogService,
    private readonly sessaoProvider: SessaoProvider,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.updateSelectedMonthFromMonthsAgo(this.selectedMonthsAgo);
    this.simulationChange$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(value => {
        this.simulationPotBrl = value;
        void this.loadReport();
      });
    void this.loadReport();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get root(): OrgHierarchyNode | null {
    return this.report?.root ?? null;
  }

  get scopeTitle(): string {
    return this.root ? getOrgHierarchyScopeTitle(this.root) : 'Relatório organizacional';
  }

  get showDirectorateRanking(): boolean {
    return this.directorateNodes.length > 0;
  }

  get directorateNodes(): OrgHierarchyNode[] {
    return collectOrgHierarchyNodesByType(this.root, 'diretoria').filter(
      n => (n.label ?? '').trim().length > 0
    );
  }

  get rankedDirectorates(): OrgHierarchyNode[] {
    return sortOrgHierarchyChildren(this.directorateNodes, this.rankingSortBy);
  }

  get rankingSortLabel(): string {
    return this.rankingSortBy === 'on_time_pct' ? '% no prazo' : 'pontos por colaborador';
  }

  get weekdayStats(): OrgHierarchyWeekdayStat[] {
    return mapFinishedByDowToWeekdayStats(this.root?.finished_by_dow);
  }

  get weekdayMaxCount(): number {
    return weekdayMaxFinishedCount(this.weekdayStats);
  }

  get showAccessSection(): boolean {
    return !!this.root?.access?.mtd;
  }

  get accessMtd() {
    return this.root?.access?.mtd;
  }

  get accessCompare() {
    return this.root?.access?.compare;
  }

  get accessWeekdayStats(): OrgHierarchyAccessWeekdayStat[] {
    return mapAccessByDowToWeekdayStats(this.root?.access?.access_by_dow);
  }

  get accessWeekdayMaxDays(): number {
    return weekdayMaxAccessDays(this.accessWeekdayStats);
  }

  get accessWeekdayMaxSessions(): number {
    return weekdayMaxAccessSessions(this.accessWeekdayStats);
  }

  get accessWeekdayPeakValue(): number {
    return this.accessWeekdayView === 'sessions'
      ? this.accessWeekdayMaxSessions
      : this.accessWeekdayMaxDays;
  }

  get playerAccessRows(): OrgHierarchyPlayerAccessRow[] {
    return mapPlayerAccessRows(this.root);
  }

  get showPlayerAccessTable(): boolean {
    return this.playerAccessRows.length > 0;
  }

  get avgAccessSessionsPerActiveUserLabel(): string {
    const avg = avgAccessSessionsPerActiveUser(
      this.accessMtd?.access_sessions,
      this.accessMtd?.active_users
    );
    return avg == null ? '—' : avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  get accessSessionsCompareDelta(): number | null {
    const mtd = this.accessMtd?.access_sessions;
    const prev = this.root?.access?.prev_mtd?.access_sessions;
    if (mtd == null || prev == null) {
      return null;
    }
    return mtd - prev;
  }

  get highlightDestaque(): OrgHierarchyHighlightItem[] {
    return getDerivedHighlightsForTab(this.root, this.highlightViewTab).destaque;
  }

  get highlightAtencao(): OrgHierarchyHighlightItem[] {
    return getDerivedHighlightsForTab(this.root, this.highlightViewTab).atencao;
  }

  get pipelineSegments(): OrgPipelineSegment[] {
    return mapOrgPipelineSegments(this.root?.mtd);
  }

  get pipelineLegendSegments(): OrgPipelineSegment[] {
    return filterOrgPipelineLegendSegments(this.pipelineSegments);
  }

  get operationalRiskAlerts(): OrgOperationalRiskAlert[] {
    return buildOrgOperationalRiskAlerts(this.root?.mtd);
  }

  get showPaceSection(): boolean {
    return hasOrgPaceMetrics(this.root);
  }

  get paceGoalComparison(): OrgPaceGoalComparison | null {
    return buildOrgPaceGoalComparison(this.root);
  }

  get paceSupportingCards(): OrgPaceMetricCard[] {
    return buildOrgPaceSupportingCards(this.root);
  }

  get paceCalendarLabel(): string | null {
    return orgPaceCalendarLabel(this.root);
  }

  get showCriticalClientsSection(): boolean {
    return hasCriticalClients(this.root?.critical_clients);
  }

  get criticalClientKpiChips(): CriticalClientKpiChip[] {
    return buildCriticalClientKpiChips(this.root?.critical_clients);
  }

  get criticalClientsTop(): CriticalClientItem[] {
    return getCriticalClientsTopList(this.root?.critical_clients);
  }

  get heroOnTimePctBreakdown(): { label: string; value: number }[] {
    const mtd = this.root?.mtd;
    if (!mtd) {
      return [];
    }
    const segments = [
      { label: 'G4', value: mtd.on_time_pct_acessorias_g4 },
      { label: 'Onboarding', value: mtd.on_time_pct_acessorias_onboarding },
      { label: 'Risco churn', value: mtd.on_time_pct_acessorias_risco_de_churn }
    ];
    return segments.filter(
      (segment): segment is { label: string; value: number } =>
        segment.value != null && Number.isFinite(segment.value)
    );
  }

  formatHeroOnTimePct(value: number): string {
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  openCriticalClientsModal(): void {
    if (!this.showCriticalClientsSection) {
      return;
    }
    this.criticalClientsModalOpen = true;
    this.cdr.markForCheck();
  }

  onCriticalClientsModalClosed(): void {
    this.criticalClientsModalOpen = false;
    this.cdr.markForCheck();
  }

  onCriticalClientFromModal(client: CriticalClientItem): void {
    this.criticalClientsModalOpen = false;
    this.openCriticalClientDrillDown(client);
  }

  openClassificationDrillDown(tier: OrgClientClassificationTier): void {
    if (!this.root || tier.count <= 0) {
      return;
    }
    this.openKpiDrillDown(tier.kpi, this.root);
  }

  criticalClientTierLabel(client: CriticalClientItem): string {
    return getCriticalClientTierLabel(client.risk_tier);
  }

  criticalClientTierClass(client: CriticalClientItem): string {
    return getCriticalClientTierClass(client.risk_tier);
  }

  criticalClientTags(client: CriticalClientItem): string[] {
    return getCriticalClientTagLabels(client);
  }

  criticalClientRiskScore(client: CriticalClientItem): string {
    return formatCriticalClientRiskScore(client.risk_score);
  }

  criticalClientHasIssues(client: CriticalClientItem): boolean {
    return criticalClientHasOperationalIssues(client);
  }

  trackByCriticalClient(_index: number, client: CriticalClientItem): string {
    return client.company_serve_key || client.company_label;
  }

  trackByOperationalAlert(_index: number, alert: OrgOperationalRiskAlert): string {
    return alert.key;
  }

  trackByPaceCard(_index: number, card: OrgPaceMetricCard): string {
    return card.key;
  }

  get pipelineTotal(): number {
    return this.root?.mtd?.pending_open ?? orgPipelineSegmentsTotal(this.pipelineSegments);
  }

  get finishedVsOpenPct(): number | null {
    return computeFinishedVsOpenPct(this.root?.mtd);
  }

  get showHeroPointsGoal(): boolean {
    const goal = this.root?.mtd?.goal_points;
    return goal != null && Number.isFinite(goal) && goal > 0;
  }

  get heroPointsGoalPct(): number | null {
    return computeOrgPointsGoalPct(this.root?.mtd);
  }

  get heroPointsGoalPctLabel(): string | null {
    const pct = this.heroPointsGoalPct;
    if (pct == null) {
      return null;
    }
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  get heroPointsDetailLabel(): string | null {
    const mtd = this.root?.mtd;
    if (!mtd || !this.showHeroPointsGoal) {
      return null;
    }
    const points = mtd.points_delivered ?? 0;
    const goal = mtd.goal_points ?? 0;
    return `${points.toLocaleString('pt-BR')} pontos de ${goal.toLocaleString('pt-BR')} (meta)`;
  }

  get heroPointsGoalPctBar(): number {
    const pct = this.heroPointsGoalPct;
    if (pct == null || !Number.isFinite(pct)) {
      return 0;
    }
    return Math.min(100, Math.max(0, pct));
  }

  get heroPointsGoalTone(): 'positive' | 'negative' | 'neutral' {
    return getOrgPointsGoalTone(this.heroPointsGoalPct);
  }

  get showHeroDeliveriesGoal(): boolean {
    const goal = this.root?.mtd?.goal_deliveries;
    return goal != null && Number.isFinite(goal) && goal > 0;
  }

  get heroDeliveriesGoalPct(): number | null {
    return computeOrgDeliveriesGoalPct(this.root?.mtd);
  }

  get heroDeliveriesGoalPctLabel(): string | null {
    const pct = this.heroDeliveriesGoalPct;
    if (pct == null) {
      return null;
    }
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  get heroDeliveriesDetailLabel(): string | null {
    const mtd = this.root?.mtd;
    if (!mtd || !this.showHeroDeliveriesGoal) {
      return null;
    }
    const finished = mtd.finished ?? 0;
    const goal = mtd.goal_deliveries ?? 0;
    return `${finished.toLocaleString('pt-BR')} entregas de ${goal.toLocaleString('pt-BR')} (meta)`;
  }

  get heroDeliveriesGoalPctBar(): number {
    const pct = this.heroDeliveriesGoalPct;
    if (pct == null || !Number.isFinite(pct)) {
      return 0;
    }
    return Math.min(100, Math.max(0, pct));
  }

  get heroDeliveriesGoalTone(): 'positive' | 'negative' | 'neutral' {
    return getOrgPointsGoalTone(this.heroDeliveriesGoalPct);
  }

  get finishedHeroProgressPct(): number {
    if (this.showHeroDeliveriesGoal) {
      return this.heroDeliveriesGoalPctBar;
    }
    return this.finishedVsOpenPct ?? 0;
  }

  get finishedHeroProgressTone(): 'positive' | 'negative' | 'neutral' {
    return this.showHeroDeliveriesGoal ? this.heroDeliveriesGoalTone : 'neutral';
  }

  get heroOnTimePct(): number | null {
    const onTime = this.root?.mtd?.on_time_pct;
    if (onTime == null || !Number.isFinite(onTime)) {
      return null;
    }
    return onTime;
  }

  get heroOnTimePctLabel(): string | null {
    const onTime = this.heroOnTimePct;
    if (onTime == null) {
      return null;
    }
    return this.formatHeroOnTimePct(onTime);
  }

  get heroOnTimeTone(): 'positive' | 'negative' | 'neutral' {
    const onTime = this.heroOnTimePct;
    if (onTime == null) {
      return 'neutral';
    }
    if (onTime >= getOnTimeDeliveryGoalForMonth(this.selectedMonth)) {
      return 'positive';
    }
    if (onTime < 70) {
      return 'negative';
    }
    return 'neutral';
  }

  get heroOnTimeMetaLabel(): string {
    return `meta ${getOnTimeDeliveryGoalForMonth(this.selectedMonth)}%`;
  }

  /** Meta de % no prazo vigente no mês filtrado (90% até jun/2026; 95% a partir de jul/2026). */
  get onTimeDeliveryGoalPct(): number {
    return getOnTimeDeliveryGoalForMonth(this.selectedMonth);
  }

  get weekdayPeakStat(): OrgHierarchyWeekdayStat | null {
    const stats = this.weekdayStats;
    if (!stats.length) {
      return null;
    }
    return stats.reduce((peak, day) => (day.finishedCount > peak.finishedCount ? day : peak), stats[0]);
  }

  get weekdayFinishedTotal(): number {
    return this.weekdayStats.reduce((sum, day) => sum + day.finishedCount, 0);
  }

  get currentPeopleHighlights(): OrgHierarchyHighlightItem[] {
    const items =
      this.peopleHighlightTab === 'destaques' ? this.filteredHighlightDestaque : this.filteredHighlightAtencao;
    return this.filterPeopleBySearch(items);
  }

  get showPeopleSection(): boolean {
    return this.showHighlightsSection;
  }

  get showHighlightsSection(): boolean {
    return this.highlightViewTabs.some(tab => this.isHighlightTabAvailable(tab.id));
  }

  pipelineSegmentWidth(value: number): string {
    return `${orgPipelineSegmentWidthPct(value, this.pipelineSegments)}%`;
  }

  onTimeGaugePct(): number {
    const onTime = this.heroOnTimePct;
    return onTime != null ? Math.min(100, Math.max(0, onTime)) : 0;
  }

  filterPeopleBySearch(items: OrgHierarchyHighlightItem[]): OrgHierarchyHighlightItem[] {
    const q = this.peopleSearch.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter(item => this.highlightMetricLabel(item).toLowerCase().includes(q));
  }

  onPeopleHighlightTabChange(tab: 'destaques' | 'atencao'): void {
    this.peopleHighlightTab = tab;
    this.cdr.markForCheck();
  }

  onPeopleSearchInput(raw: string): void {
    this.peopleSearch = raw;
    this.cdr.markForCheck();
  }

  toggleRankingDetails(): void {
    this.rankingShowDetails = !this.rankingShowDetails;
    this.cdr.markForCheck();
  }

  toggleTreeAllMetrics(): void {
    this.treeShowAllMetrics = !this.treeShowAllMetrics;
    this.cdr.markForCheck();
  }

  onTreeViewModeChange(mode: OrgHierarchyTreeViewMode): void {
    this.treeViewMode = mode;
    if (mode === 'flowchart' && this.root?.children?.length) {
      const ids = new Set(this.expandedNodeIds);
      ids.add(this.root.node_id);
      this.expandedNodeIds = ids;
    }
    this.cdr.markForCheck();
  }

  onFlowchartSearchChange(query: string): void {
    this.applyFlowchartSearch(query);
    this.cdr.markForCheck();
  }

  onPipelineSegmentClick(segment: OrgPipelineSegment): void {
    if (!this.root) {
      return;
    }
    this.openKpiDrillDown(segment.kpi, this.root);
  }

  get filteredHighlightDestaque(): OrgHierarchyHighlightItem[] {
    return this.highlightDestaque;
  }

  get filteredHighlightAtencao(): OrgHierarchyHighlightItem[] {
    return this.highlightAtencao;
  }

  get showCurrentHighlightTabContent(): boolean {
    return this.filteredHighlightDestaque.length > 0 || this.filteredHighlightAtencao.length > 0;
  }

  highlightTabCount(tab: OrgHierarchyHighlightViewTab): number {
    const derived = getDerivedHighlightsForTab(this.root, tab);
    return (derived.destaque?.length ?? 0) + (derived.atencao?.length ?? 0);
  }

  isHighlightTabAvailable(tab: OrgHierarchyHighlightViewTab): boolean {
    return highlightViewTabHasNodes(this.root, tab);
  }

  get clientClassificationTiers(): OrgClientClassificationTier[] {
    return mapClientClassificationTiers(this.root?.mtd);
  }

  get clientClassificationTotalCount(): number {
    return clientClassificationTotal(this.clientClassificationTiers);
  }

  get clientClassificationMaxCount(): number {
    return clientClassificationMaxCount(this.clientClassificationTiers);
  }

  get showSimulation(): boolean {
    return this.simulationPotBrl != null && this.simulationPotBrl > 0;
  }

  get showAiInsightsSection(): boolean {
    return this.aiExecutiveAnalysisEnabled && !this.isLoading && !this.hasLoadError && !this.isEmpty;
  }

  get hasInsightsContent(): boolean {
    return (this.insights?.insights?.length ?? 0) > 0 || !!this.insights?.summary?.trim();
  }

  get insightsGeneratedAtLabel(): string {
    const at = this.insights?.generated_at;
    if (!at) {
      return '';
    }
    return moment(at).format('DD/MM/YYYY HH:mm');
  }

  get insightsSourceBadge(): string {
    return orgHierarchyInsightsSourceLabel(this.insights?.from_cache);
  }

  private insightsScope(): {
    month: Date;
    depth: number;
    focus: 'risks_and_actions';
    simulation_pot_brl?: number;
  } {
    return {
      month: this.selectedMonth,
      depth: this.insightsDepth,
      focus: 'risks_and_actions' as const,
      ...(this.simulationPotBrl != null && this.simulationPotBrl > 0
        ? { simulation_pot_brl: this.simulationPotBrl }
        : {})
    };
  }

  get pointsPerBrlLabel(): string {
    const rate = this.report?.params?.points_per_brl;
    if (rate == null || !Number.isFinite(rate)) {
      return '';
    }
    return `${rate.toFixed(4)} pts/BRL`;
  }

  mtdComparePct(value: number | undefined | null): string {
    return formatOrgHierarchyComparePct(value);
  }

  mtdCompareTone(value: number | undefined | null): 'positive' | 'negative' | 'neutral' {
    return getOrgHierarchyCompareTone(value);
  }

  formatCurrency(value: number | undefined | null): string {
    return formatBrl(value);
  }

  weekdayBarHeight(count: number): string {
    return weekdayBarHeight(count, this.weekdayMaxCount);
  }

  accessWeekdayBarHeight(value: number): string {
    return weekdayBarHeight(value, this.accessWeekdayPeakValue);
  }

  accessWeekdayDisplayValue(day: OrgHierarchyAccessWeekdayStat): number {
    return this.accessWeekdayView === 'sessions' ? day.accessSessions : day.accessDays;
  }

  isAccessWeekdayPeak(day: OrgHierarchyAccessWeekdayStat): boolean {
    const value = this.accessWeekdayDisplayValue(day);
    return value > 0 && value === this.accessWeekdayPeakValue;
  }

  onAccessWeekdayViewChange(view: 'days' | 'sessions'): void {
    this.accessWeekdayView = view;
    this.cdr.markForCheck();
  }

  trackByPlayerAccess(_index: number, row: OrgHierarchyPlayerAccessRow): string {
    return row.nodeId;
  }

  formatAccessSessionsCompare(delta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }

  trackByAccessWeekday(_index: number, day: OrgHierarchyAccessWeekdayStat): number {
    return day.dow;
  }

  classificationBarHeight(count: number): string {
    return clientClassificationBarHeight(count, this.clientClassificationMaxCount);
  }

  classificationSharePct(count: number): string {
    const total = this.clientClassificationTotalCount;
    if (total <= 0) {
      return '—';
    }
    const pct = (count / total) * 100;
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  classificationShareWidth(count: number): string {
    const total = this.clientClassificationTotalCount;
    if (total <= 0) {
      return '0%';
    }
    return `${(count / total) * 100}%`;
  }

  trackByPipelineSegment(_index: number, segment: OrgPipelineSegment): string {
    return segment.key;
  }

  trackByClassificationLevel(_index: number, tier: OrgClientClassificationTier): number {
    return tier.level;
  }

  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    this.updateSelectedMonthFromMonthsAgo(monthsAgo);
    void this.loadReport();
  }

  onSimulationInput(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      this.simulationChange$.next(null);
      return;
    }
    const parsed = Number(trimmed.replace(/\./g, '').replace(',', '.'));
    this.simulationChange$.next(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  }

  onRankingSortChange(sortBy: OrgHierarchyRankingSortBy): void {
    this.rankingSortBy = sortBy;
    this.cdr.markForCheck();
  }

  onHighlightViewTabChange(tab: OrgHierarchyHighlightViewTab): void {
    this.highlightViewTab = tab;
    this.cdr.markForCheck();
  }

  onReportPanelTabChange(tab: OrgHierarchyReportPanelTab): void {
    this.reportPanelTab = tab;
    this.cdr.markForCheck();
  }

  trackByReportPanelTab(_index: number, tab: { id: OrgHierarchyReportPanelTab }): string {
    return tab.id;
  }

  trackBySkeletonIndex(_index: number, item: number): number {
    return item;
  }

  toggleTreeNode(nodeId: string): void {
    if (this.expandedNodeIds.has(nodeId)) {
      this.expandedNodeIds.delete(nodeId);
    } else {
      this.expandedNodeIds.add(nodeId);
    }
    this.expandedNodeIds = new Set(this.expandedNodeIds);
    this.cdr.markForCheck();
  }

  expandAllRootChildren(): void {
    const children = this.root?.children ?? [];
    for (const child of children) {
      this.expandedNodeIds.add(child.node_id);
    }
    this.expandedNodeIds = new Set(this.expandedNodeIds);
    this.cdr.markForCheck();
  }

  expandAllTreeNodes(): void {
    const ids = new Set<string>();
    const walk = (node: OrgHierarchyNode): void => {
      if (node.children?.length) {
        ids.add(node.node_id);
        for (const child of node.children) {
          walk(child);
        }
      }
    };
    if (this.root) {
      walk(this.root);
    }
    this.expandedNodeIds = ids;
    this.cdr.markForCheck();
  }

  collapseAllTreeNodes(): void {
    this.expandedNodeIds = new Set();
    this.flowchartSearchHighlightIds = new Set();
    this.cdr.markForCheck();
  }

  private applyFlowchartSearch(query: string): void {
    const normalizedQuery = this.normalizeFlowchartSearchText(query);
    if (!normalizedQuery || !this.root) {
      this.flowchartSearchHighlightIds = new Set();
      return;
    }

    const highlights = new Set<string>();
    const toExpand = new Set(this.expandedNodeIds);

    const walk = (node: OrgHierarchyNode, ancestors: string[]): boolean => {
      const selfMatch = this.normalizeFlowchartSearchText(
        `${node.label ?? ''} ${getOrgHierarchyNodeTypeLabel(node.node_type)}`
      ).includes(normalizedQuery);

      let childMatch = false;
      for (const child of node.children ?? []) {
        if (walk(child, [...ancestors, node.node_id])) {
          childMatch = true;
        }
      }

      if (selfMatch) {
        highlights.add(node.node_id);
        for (const ancestorId of ancestors) {
          toExpand.add(ancestorId);
        }
      }

      if (childMatch) {
        toExpand.add(node.node_id);
      }

      return selfMatch || childMatch;
    };

    walk(this.root, []);
    this.flowchartSearchHighlightIds = highlights;
    this.expandedNodeIds = toExpand;
  }

  private normalizeFlowchartSearchText(value: string | null | undefined): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  }

  openKpiDrillDownFromTree(payload: {
    kpi: OrgHierarchyKpiDetailKey;
    nodeType: OrgHierarchyNodeType;
    nodeId: string;
    nodeLabel: string;
  }): void {
    // Drill-down de listagem de clientes (total e tags) desabilitado temporariamente — performance.
    if (this.isClientListDrilldownDisabled(payload.kpi)) {
      return;
    }

    const node = findOrgHierarchyNodeById(this.root, payload.nodeId);
    this.kpiDrilldownContext = {
      kind: 'kpi',
      kpi: payload.kpi,
      nodeType: payload.nodeType,
      nodeId: payload.nodeId,
      nodeLabel: payload.nodeLabel,
      months: 4,
      compareContext: node ? buildOrgKpiDrilldownCompareContext(node) : null,
      reportParams: this.report?.params ?? null
    };
    this.cdr.markForCheck();
  }

  openKpiDrillDown(
    kpi: OrgHierarchyKpiDetailKey,
    node: OrgHierarchyNode,
    clientListKey?: OrgHierarchyClientListKey | null
  ): void {
    // Drill-down de listagem de clientes (total e tags) desabilitado temporariamente — performance.
    if (this.isClientListDrilldownDisabled(kpi)) {
      return;
    }

    this.kpiDrilldownContext = {
      kind: 'kpi',
      kpi,
      nodeType: node.node_type,
      nodeId: node.node_id,
      nodeLabel: node.label,
      months: 4,
      compareContext: buildOrgKpiDrilldownCompareContext(node),
      reportParams: this.report?.params ?? null,
      clientListKey: clientListKey ?? null
    };
    this.cdr.markForCheck();
  }

  /**
   * Abre drill-down da lista de clientes atendidos filtrada por tag (G4 / onboarding / churn).
   * Desabilitado temporariamente — reativar quando a listagem otimizada estiver pronta.
   */
  openClientsServedListDrillDown(
    _clientListKey: OrgHierarchyClientListKey,
    _node?: OrgHierarchyNode | null
  ): void {
    return;

    /*
    const scope = _node ?? this.root;
    if (!scope) {
      return;
    }
    this.openKpiDrillDown('clients_served', scope, _clientListKey);
    */
  }

  /** KPIs de listagem de clientes cujo drill-down está pausado por performance. */
  private isClientListDrilldownDisabled(kpi: OrgHierarchyKpiDetailKey): boolean {
    return (
      kpi === 'clients_served' ||
      kpi === 'clients_acessorias_g4' ||
      kpi === 'clients_acessorias_onboarding' ||
      kpi === 'clients_acessorias_risco_de_churn'
    );
  }

  exportClientsServedXlsx(): void {
    if (this.isExportingClientsServed || !this.root) {
      return;
    }
    this.isExportingClientsServed = true;
    this.cdr.markForCheck();

    this.actionLogService
      .exportOrganizationHierarchyClientsServedXlsx({
        month: this.selectedMonth,
        nodeType: this.root.node_type,
        nodeId: this.root.node_id
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.isExportingClientsServed = false;
          const blob = res.body;
          if (!blob || blob.size === 0) {
            this.toastService.error('Não foi possível exportar os clientes.', false);
            this.cdr.markForCheck();
            return;
          }
          const headerFilename = parseHttpContentDispositionFilename(
            res.headers.get('Content-Disposition')
          );
          const filename =
            headerFilename ??
            buildOrgHierarchyClientListExportFilename({
              listKey: 'clients_served',
              month: this.selectedMonth,
              scopeLabel: this.root?.label,
              format: 'xlsx'
            });
          downloadBlobFile(blob, filename);
          this.toastService.success('Arquivo Excel exportado.');
          this.cdr.markForCheck();
        },
        error: () => {
          this.isExportingClientsServed = false;
          this.toastService.error('Falha ao exportar clientes atendidos.', false);
          this.cdr.markForCheck();
        }
      });
  }

  openCriticalClientDrillDown(
    client: CriticalClientItem,
    issue: CriticalClientIssueFilter = 'all'
  ): void {
    const node = this.root;
    if (!node) {
      return;
    }
    this.kpiDrilldownContext = {
      kind: 'critical_client',
      client,
      issue,
      nodeType: node.node_type,
      nodeId: node.node_id,
      nodeLabel: node.label
    };
    this.cdr.markForCheck();
  }

  exportCriticalClientsDeliveries(): void {
    if (this.isExportingCriticalClientsDeliveries) {
      return;
    }
    const node = this.root;
    if (!node || !this.showCriticalClientsSection) {
      this.toastService.error('Nenhum cliente crítico para exportar.', false);
      return;
    }

    this.isExportingCriticalClientsDeliveries = true;
    this.cdr.markForCheck();

    this.actionLogService
      .exportOrganizationHierarchyCriticalClientsDeliveries({
        month: this.selectedMonth,
        nodeType: node.node_type,
        nodeId: node.node_id,
        issue: 'all'
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.isExportingCriticalClientsDeliveries = false;
          const blob = res.body;
          if (!blob || blob.size === 0) {
            this.toastService.error('Não foi possível exportar as entregas.', false);
            this.cdr.markForCheck();
            return;
          }
          const headerFilename = parseHttpContentDispositionFilename(
            res.headers.get('Content-Disposition')
          );
          const filename =
            headerFilename ??
            buildOrgHierarchyCriticalClientsDeliveriesExportFilename({
              month: this.selectedMonth,
              scopeLabel: node.label,
              issue: 'all'
            });
          downloadBlobFile(blob, filename);
          this.toastService.success('Arquivo Excel exportado.');
          this.cdr.markForCheck();
        },
        error: () => {
          this.isExportingCriticalClientsDeliveries = false;
          this.toastService.error('Falha ao exportar entregas de clientes críticos.', false);
          this.cdr.markForCheck();
        }
      });
  }

  onCriticalClientIssueFilterChange(issue: CriticalClientIssueFilter): void {
    if (!this.kpiDrilldownContext || this.kpiDrilldownContext.kind !== 'critical_client') {
      return;
    }
    this.kpiDrilldownContext = {
      ...this.kpiDrilldownContext,
      issue
    };
    this.cdr.markForCheck();
  }

  onKpiDrillDownModalClosed(): void {
    this.kpiDrilldownContext = null;
    this.cdr.markForCheck();
  }

  retryLoad(): void {
    void this.loadReport(true);
  }

  generateInsights(): void {
    if (this.isGeneratingInsights || this.isLoading) {
      return;
    }
    void this.runGenerateInsights();
  }

  insightPriorityClass(item: OrganizationHierarchyInsightItem): string {
    return orgHierarchyInsightPriorityClass(item.priority);
  }

  insightCategoryLabel(item: OrganizationHierarchyInsightItem): string {
    return orgHierarchyInsightCategoryLabel(item.category);
  }

  insightPriorityLabel(item: OrganizationHierarchyInsightItem): string {
    return orgHierarchyInsightPriorityLabel(item.priority);
  }

  trackByInsightId(index: number, item: OrganizationHierarchyInsightItem): string {
    return `${item.title}_${index}`;
  }

  logout(): void {
    const snack = this.toastService.action('Deseja sair do sistema?', 'Sair', {
      duration: 8000,
      panelClass: ['snackbar-warning'],
      dismissOnOutsideClick: true
    });
    snack
      .onAction()
      .pipe(take(1))
      .subscribe(() => {
        void this.sessaoProvider.logout();
      });
  }

  trackByNodeId(_index: number, node: OrgHierarchyNode): string {
    return node.node_id;
  }

  trackByGlobalMtdMetric(_index: number, metric: OrgGlobalMtdMetric): string {
    return metric.key;
  }

  onGlobalMtdMetricClick(metric: OrgGlobalMtdMetric): void {
    if (!metric.kpi || !this.root) {
      return;
    }
    this.openKpiDrillDown(metric.kpi, this.root);
  }

  formatGlobalMtdValue(metric: OrgGlobalMtdMetric): string {
    return formatOrgGlobalMtdValue(this.root?.mtd, metric);
  }

  isGlobalMtdRiskMetric(metric: OrgGlobalMtdMetric): boolean {
    return [
      'pending_open',
      'near_due',
      'overdue_pending',
      'overdue_pending_justified',
      'overdue_pending_unjustified',
      'multa_risk',
      'multa_incurred',
      'multa_and_near_due'
    ].includes(metric.key);
  }

  trackByHighlight(_index: number, item: OrgHierarchyHighlightItem): string {
    return `${item.node_id ?? ''}_${item.label ?? ''}_${_index}`;
  }

  trackByWeekday(_index: number, day: OrgHierarchyWeekdayStat): number {
    return day.dow;
  }

  highlightMetricLabel(item: OrgHierarchyHighlightItem): string {
    if (item.label) {
      return item.label;
    }
    return item.metric ?? 'Destaque';
  }

  highlightValueText(item: OrgHierarchyHighlightItem): string {
    const metric = String(item.metric ?? '').trim().toLowerCase();
    const raw = item.value;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (metric === 'on_time_pct') {
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  highlightTeamLabel(item: OrgHierarchyHighlightItem): string {
    return getHighlightTeamLabel(item, this.root);
  }

  highlightGerenciaLabel(item: OrgHierarchyHighlightItem): string {
    return getHighlightGerenciaLabel(item, this.root);
  }

  highlightDiretoriaLabel(item: OrgHierarchyHighlightItem): string {
    return getHighlightDiretoriaLabel(item, this.root);
  }

  highlightShowsContext(item: OrgHierarchyHighlightItem): boolean {
    return highlightHasContextForViewTab(item, this.highlightViewTab, this.root);
  }

  highlightMtdCell(item: OrgHierarchyHighlightItem, column: OrgHighlightMtdColumn): string {
    return formatHighlightMtdCell(item, column);
  }

  highlightInitials(item: OrgHierarchyHighlightItem): string {
    const label = this.highlightMetricLabel(item);
    return label
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  highlightContextLabel(item: OrgHierarchyHighlightItem): string {
    if (this.highlightViewTab === 'player') {
      const team = this.highlightTeamLabel(item);
      const gerencia = this.highlightGerenciaLabel(item);
      return [team !== '—' ? team : null, gerencia !== '—' ? gerencia : null].filter(Boolean).join(' · ');
    }
    if (this.highlightViewTab === 'supervisao') {
      const gerencia = this.highlightGerenciaLabel(item);
      return gerencia !== '—' ? gerencia : '';
    }
    const diretoria = this.highlightDiretoriaLabel(item);
    return diretoria !== '—' ? diretoria : '';
  }

  rankingMtdCell(node: OrgHierarchyNode, column: OrgRankingColumn | OrgHighlightMtdColumn): string {
    if (column.key === 'points_per_collaborator') {
      return formatOrgRankingCell(node, column as OrgRankingColumn);
    }
    return formatOrgHierarchyNodeMtdCell(node, column as OrgHighlightMtdColumn);
  }

  rankingPointsGoalPct(node: OrgHierarchyNode): string | null {
    return formatOrgPointsGoalPct(node.mtd);
  }

  rankingPointsGoalTone(node: OrgHierarchyNode): 'positive' | 'negative' | 'neutral' {
    return getOrgPointsGoalTone(computeOrgPointsGoalPct(node.mtd));
  }

  rankingPointsGoalPctNumber(node: OrgHierarchyNode): number {
    const pct = computeOrgPointsGoalPct(node.mtd);
    if (pct == null || !Number.isFinite(pct)) {
      return 0;
    }
    return Math.min(100, Math.max(0, pct));
  }

  directorateRankingLabel(diretoria: OrgHierarchyNode): string {
    return getDirectorateRankingLabel(this.root, diretoria);
  }

  directorateRankingArea(diretoria: OrgHierarchyNode): string | null {
    return resolveDirectorateAreaLabel(this.root, diretoria);
  }

  directorateRankingAreaClass(diretoria: OrgHierarchyNode): string | null {
    const area = this.directorateRankingArea(diretoria);
    return area ? getOrgHierarchyAreaLabelClass(area) : null;
  }

  directorateRankingName(diretoria: OrgHierarchyNode): string {
    return (diretoria.label ?? '').trim() || '—';
  }

  private updateSelectedMonthFromMonthsAgo(monthsAgo: number): void {
    const parsed = dateFromMonthFilterOffset(monthsAgo);
    this.selectedMonth = moment(parsed ?? new Date()).startOf('month').toDate();
  }

  private ensureValidHighlightViewTab(): void {
    if (this.isHighlightTabAvailable(this.highlightViewTab)) {
      return;
    }
    const fallback = this.highlightViewTabs.find(tab => this.isHighlightTabAvailable(tab.id));
    this.highlightViewTab = fallback?.id ?? 'gerencia';
  }

  private async loadReport(force = false): Promise<void> {
    const gen = ++this.loadGen;
    this.isLoading = true;
    this.hasLoadError = false;
    this.isEmpty = false;
    this.insights = null;
    this.insightsNotFound = false;
    this.insightsBanner = null;
      this.insightsDepth = 7;
      this.cdr.markForCheck();

    if (force) {
      this.actionLogService.clearCache();
    }

    try {
      const result = await firstValueFrom(
        this.actionLogService.fetchOrganizationHierarchyReport({
          month: this.selectedMonth,
          simulationPotBrl: this.simulationPotBrl ?? undefined,
          depth: 7
        })
      );

      if (gen !== this.loadGen) {
        return;
      }

      this.report = result ?? null;
      this.criticalClientsModalOpen = false;
      this.isEmpty = !this.report;
      if (this.report?.root?.node_type === 'organization') {
        this.expandAllRootChildren();
      }
      this.ensureValidHighlightViewTab();
      if (this.report) {
        if (this.aiExecutiveAnalysisEnabled) {
          void this.loadInsights(gen);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar relatório organizacional:', error);
      if (gen === this.loadGen) {
        this.report = null;
        this.hasLoadError = true;
      }
    } finally {
      if (gen === this.loadGen) {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  private async loadInsights(reportGen: number): Promise<void> {
    const gen = ++this.insightsLoadGen;
    this.isLoadingInsights = true;
    this.insightsBanner = null;
    this.cdr.markForCheck();

    try {
      const result = await firstValueFrom(
        this.actionLogService.fetchOrganizationHierarchyInsights(this.insightsScope())
      );
      if (gen !== this.insightsLoadGen || reportGen !== this.loadGen) {
        return;
      }
      this.insights = result;
      this.insightsNotFound = !result;
      if (!result && this.insightsDepth !== 1) {
        // GET é grátis; se não achou em depth=7, tenta o cache barato em depth=1.
        this.insightsDepth = 1;
        const retry = await firstValueFrom(
          this.actionLogService.fetchOrganizationHierarchyInsights(this.insightsScope())
        );
        if (gen !== this.insightsLoadGen || reportGen !== this.loadGen) {
          return;
        }
        this.insights = retry;
        this.insightsNotFound = !retry;
      }
    } catch (error) {
      if (gen !== this.insightsLoadGen || reportGen !== this.loadGen) {
        return;
      }
      const parsed = parseOrgHierarchyInsightsError(error);
      this.insightsBanner = parsed;
      if (parsed.kind !== 'not_found') {
        console.error('Erro ao carregar insights de IA:', error);
      }
    } finally {
      if (gen === this.insightsLoadGen) {
        this.isLoadingInsights = false;
        this.cdr.markForCheck();
      }
    }
  }

  private async runGenerateInsights(): Promise<void> {
    const reportGen = this.loadGen;
    const gen = ++this.insightsLoadGen;
    this.isGeneratingInsights = true;
    this.insightsBanner = null;
    this.cdr.markForCheck();

    try {
      const scope = {
        ...this.insightsScope(),
        // Primeira geração sem cache: depth=1 reduz tokens/custo no POST.
        depth: this.insightsNotFound ? 1 : this.insightsDepth
      };
      const result = await firstValueFrom(
        this.actionLogService.generateOrganizationHierarchyInsights(scope)
      );
      if (gen !== this.insightsLoadGen || reportGen !== this.loadGen) {
        return;
      }
      this.insights = result;
      this.insightsNotFound = false;
      this.toastService.success('Análise executiva gerada com sucesso.');
    } catch (error) {
      if (gen !== this.insightsLoadGen || reportGen !== this.loadGen) {
        return;
      }
      const parsed = parseOrgHierarchyInsightsError(error);
      this.insightsBanner = parsed;
      if (parsed.kind === 'credits') {
        this.toastService.error(parsed.message);
      } else {
        this.toastService.error('Não foi possível gerar a análise executiva.');
      }
      console.error('Erro ao gerar insights de IA:', error);
    } finally {
      if (gen === this.insightsLoadGen) {
        this.isGeneratingInsights = false;
        this.cdr.markForCheck();
      }
    }
  }
}
