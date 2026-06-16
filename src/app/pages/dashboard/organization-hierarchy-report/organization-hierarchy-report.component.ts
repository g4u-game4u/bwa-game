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
import { ActionLogService } from '@services/action-log.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from '@services/toast.service';
import {
  OrganizationHierarchyReportResponse,
  OrgHierarchyHighlightItem,
  OrgHierarchyNode,
  OrgHierarchyKpiDetailKey,
  OrgHierarchyNodeType,
  OrganizationHierarchyInsightItem,
  OrganizationHierarchyInsightsResponse
} from '@model/game4u-api.model';
import {
  formatBrl,
  formatOrgHierarchyComparePct,
  getOrgHierarchyCompareTone,
  getOrgHierarchyScopeTitle,
  mapFinishedByDowToWeekdayStats,
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
  collectOrgHierarchyNodesByType,
  formatOrgHierarchyNodeMtdCell,
  getDirectorateRankingLabel,
  getOrgHierarchyAreaLabelClass,
  resolveDirectorateAreaLabel,
  OrgHighlightMtdColumn,
  formatHighlightMtdCell,
  OrgHierarchyHighlightViewTab,
  OrgClientClassificationTier,
  OrgHierarchyRankingSortBy,
  OrgHierarchyWeekdayStat,
  sortOrgHierarchyChildren,
  weekdayBarHeight,
  weekdayMaxFinishedCount
} from '@services/org-hierarchy-report.mapper';
import {
  OrgHierarchyInsightsErrorInfo,
  orgHierarchyInsightCategoryLabel,
  orgHierarchyInsightPriorityClass,
  orgHierarchyInsightPriorityLabel,
  orgHierarchyInsightsSourceLabel,
  parseOrgHierarchyInsightsError
} from '@services/org-hierarchy-insights.mapper';

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

  selectedMonthsAgo = 0;
  selectedMonth: Date = new Date();

  report: OrganizationHierarchyReportResponse | null = null;
  insights: OrganizationHierarchyInsightsResponse | null = null;
  isLoading = true;
  isLoadingInsights = false;
  isGeneratingInsights = false;
  hasLoadError = false;
  isEmpty = false;
  insightsNotFound = false;
  insightsBanner: OrgHierarchyInsightsErrorInfo | null = null;

  simulationPotBrl: number | null = null;
  rankingSortBy: OrgHierarchyRankingSortBy = 'balance_score';
  classificationView: 'table' | 'cards' = 'table';
  highlightViewTab: OrgHierarchyHighlightViewTab = 'gerencia';
  expandedNodeIds = new Set<string>();

  kpiDrilldownContext:
    | {
        kpi: OrgHierarchyKpiDetailKey;
        nodeType: OrgHierarchyNodeType;
        nodeId: string;
        nodeLabel: string;
        months: number;
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
  readonly rankingMtdColumns = ORG_HIGHLIGHT_MTD_COLUMNS;

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

  get weekdayStats(): OrgHierarchyWeekdayStat[] {
    return mapFinishedByDowToWeekdayStats(this.root?.finished_by_dow);
  }

  get weekdayMaxCount(): number {
    return weekdayMaxFinishedCount(this.weekdayStats);
  }

  get highlightDestaque(): OrgHierarchyHighlightItem[] {
    return getDerivedHighlightsForTab(this.root, this.highlightViewTab).destaque;
  }

  get highlightAtencao(): OrgHierarchyHighlightItem[] {
    return getDerivedHighlightsForTab(this.root, this.highlightViewTab).atencao;
  }

  get showHighlightsSection(): boolean {
    return this.highlightViewTabs.some(tab => this.isHighlightTabAvailable(tab.id));
  }

  get filteredHighlightDestaque(): OrgHierarchyHighlightItem[] {
    // Destaques já são derivados por aba; mantemos a interface atual da view.
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
    return !this.isLoading && !this.hasLoadError && !this.isEmpty;
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

  toggleClassificationView(): void {
    this.classificationView = this.classificationView === 'table' ? 'cards' : 'table';
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
  }

  openKpiDrillDownFromTree(payload: {
    kpi: OrgHierarchyKpiDetailKey;
    nodeType: OrgHierarchyNodeType;
    nodeId: string;
    nodeLabel: string;
  }): void {
    this.kpiDrilldownContext = {
      kpi: payload.kpi,
      nodeType: payload.nodeType,
      nodeId: payload.nodeId,
      nodeLabel: payload.nodeLabel,
      months: 4
    };
    this.cdr.markForCheck();
  }

  openKpiDrillDown(kpi: OrgHierarchyKpiDetailKey, node: OrgHierarchyNode): void {
    this.kpiDrilldownContext = {
      kpi,
      nodeType: node.node_type,
      nodeId: node.node_id,
      nodeLabel: node.label,
      months: 4
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

  rankingMtdCell(node: OrgHierarchyNode, column: OrgHighlightMtdColumn): string {
    return formatOrgHierarchyNodeMtdCell(node, column);
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
    const target = moment().subtract(monthsAgo, 'months').startOf('month');
    this.selectedMonth = target.toDate();
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
      this.isEmpty = !this.report;
      if (this.report?.root?.node_type === 'organization') {
        this.expandAllRootChildren();
      }
      this.ensureValidHighlightViewTab();
      if (this.report) {
        void this.loadInsights(gen);
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
