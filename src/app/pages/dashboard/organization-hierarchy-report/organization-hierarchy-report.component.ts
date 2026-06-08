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
  OrgHierarchyNode
} from '@model/game4u-api.model';
import {
  formatBrl,
  formatOrgHierarchyComparePct,
  getOrgHierarchyCompareTone,
  getOrgHierarchyScopeTitle,
  mapFinishedByDowToWeekdayStats,
  OrgHierarchyRankingSortBy,
  OrgHierarchyWeekdayStat,
  sortOrgHierarchyChildren,
  weekdayBarHeight,
  weekdayMaxFinishedCount
} from '@services/org-hierarchy-report.mapper';

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

  selectedMonthsAgo = 0;
  selectedMonth: Date = new Date();

  report: OrganizationHierarchyReportResponse | null = null;
  isLoading = true;
  hasLoadError = false;
  isEmpty = false;

  simulationPotBrl: number | null = null;
  rankingSortBy: OrgHierarchyRankingSortBy = 'balance_score';
  expandedNodeIds = new Set<string>();

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
    return this.root?.node_type === 'organization' && !!(this.root.children?.length);
  }

  get rankedDirectorates(): OrgHierarchyNode[] {
    return sortOrgHierarchyChildren(this.root?.children, this.rankingSortBy);
  }

  get weekdayStats(): OrgHierarchyWeekdayStat[] {
    return mapFinishedByDowToWeekdayStats(this.root?.finished_by_dow);
  }

  get weekdayMaxCount(): number {
    return weekdayMaxFinishedCount(this.weekdayStats);
  }

  get highlightDestaque(): OrgHierarchyHighlightItem[] {
    return this.root?.highlights?.destaque ?? [];
  }

  get highlightAtencao(): OrgHierarchyHighlightItem[] {
    return this.root?.highlights?.atencao ?? [];
  }

  get showSimulation(): boolean {
    return this.simulationPotBrl != null && this.simulationPotBrl > 0;
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

  retryLoad(): void {
    void this.loadReport(true);
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

  private updateSelectedMonthFromMonthsAgo(monthsAgo: number): void {
    const target = moment().subtract(monthsAgo, 'months').startOf('month');
    this.selectedMonth = target.toDate();
  }

  private async loadReport(force = false): Promise<void> {
    const gen = ++this.loadGen;
    this.isLoading = true;
    this.hasLoadError = false;
    this.isEmpty = false;
    this.cdr.markForCheck();

    if (force) {
      this.actionLogService.clearCache();
    }

    try {
      const result = await firstValueFrom(
        this.actionLogService.fetchOrganizationHierarchyReport({
          month: this.selectedMonth,
          simulationPotBrl: this.simulationPotBrl ?? undefined,
          depth: 5
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
}
