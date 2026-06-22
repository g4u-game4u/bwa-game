import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnChanges,
  SimpleChanges,
  OnDestroy
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type {
  CriticalClientItem,
  CriticalClientIssueFilter,
  OrgHierarchyClientListItem,
  OrgHierarchyClientListKey,
  OrgHierarchyKpiDetailKey,
  OrgHierarchyDeliveriesDrilldownKey,
  OrgHierarchyNodeType,
  OrganizationHierarchyDeliveryRow,
  OrganizationHierarchyDeliveriesResponse,
  OrganizationHierarchyDeliveriesDiretoriaRow,
  OrganizationHierarchyKpiDetailResponse,
  OrganizationHierarchyReportParams
} from '@model/game4u-api.model';
import type { ChartDataset } from '@model/gamification-dashboard.model';
import { ActionLogService } from '@services/action-log.service';
import {
  getOrgHierarchyDeliveryActionTitle,
  getOrgHierarchyDeliveryCompanyLabel,
  isOrgHierarchyDeliveriesDrilldownKpi
} from '@services/org-hierarchy-report.mapper';
import {
  buildOrgHierarchyDeliveriesExportFilename,
  flattenOrgHierarchyDeliveriesForExport
} from '@services/org-hierarchy-kpi-export.mapper';
import {
  formatCriticalClientIssueKindLabel,
  getCriticalClientIssueFilterLabel,
  getCriticalClientTagLabels,
  getCriticalClientTierLabel
} from '@services/org-hierarchy-critical-clients.mapper';
import { ToastService } from '@services/toast.service';
import {
  downloadSpreadsheetFile,
  downloadBlobFile,
  parseHttpContentDispositionFilename,
  type SpreadsheetExportFormat
} from '@utils/spreadsheet-export';
import {
  buildOrgKpiComparePanel,
  buildOrgKpiMonthlyHistoryChartDatasets,
  formatOrgKpiCompareValue,
  OrgKpiComparePanel,
  OrgKpiDrilldownCompareContext,
  resolveOrgKpiMonthlyHistoryForChart,
  supportsOrgKpiWindowCompare
} from '@services/org-hierarchy-kpi-compare.mapper';
import {
  buildOrgHierarchyClientListExportFilename,
  buildOrgHierarchyClientListTabs,
  filterOrgHierarchyClientListItems,
  formatOrgHierarchyClientListTags,
  getClientListItems,
  getDefaultClientListKeyForKpi,
  getOrgHierarchyClientListLabel,
  isOrgHierarchyTagClientListKey,
  mapOrgHierarchyClientListForExport,
  shouldFetchOrgHierarchyClientLists,
  type OrgHierarchyClientListTab
} from '@services/org-hierarchy-client-lists.mapper';

@Component({
  selector: 'modal-organization-hierarchy-kpi-detail',
  templateUrl: './modal-organization-hierarchy-kpi-detail.component.html',
  styleUrls: ['./modal-organization-hierarchy-kpi-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalOrganizationHierarchyKpiDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() kpi?: OrgHierarchyKpiDetailKey;
  @Input() nodeType?: OrgHierarchyNodeType;
  @Input() nodeId?: string;
  @Input() nodeLabel?: string;
  @Input() month!: Date;
  @Input() months = 4;
  @Input() compareContext: OrgKpiDrilldownCompareContext | null = null;
  @Input() reportParams: OrganizationHierarchyReportParams | null = null;
  @Input() criticalClient: CriticalClientItem | null = null;
  @Input() issueFilter: CriticalClientIssueFilter = 'all';
  @Input() initialClientListKey: OrgHierarchyClientListKey | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() issueFilterChange = new EventEmitter<CriticalClientIssueFilter>();

  private readonly destroy$ = new Subject<void>();

  isLoading = false;
  isExportingClientsServed = false;
  kpiDetail: OrganizationHierarchyKpiDetailResponse | null = null;
  deliveries: OrganizationHierarchyDeliveriesResponse | null = null;
  deliverySearchQuery = '';
  clientListSearchQuery = '';
  clientListFilter: OrgHierarchyClientListKey = 'clients_served';

  chartLabels: string[] = [];
  chartDatasets: ChartDataset[] = [];
  chartShowLegend = false;

  constructor(
    private readonly actionLogService: ActionLogService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['kpi'] ||
      changes['month'] ||
      changes['nodeType'] ||
      changes['nodeId'] ||
      changes['months'] ||
      changes['compareContext'] ||
      changes['reportParams'] ||
      changes['criticalClient'] ||
      changes['issueFilter'] ||
      changes['initialClientListKey']
    ) {
      void this.load();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.closed.emit();
  }

  get usesDeliveriesPanel(): boolean {
    return !!this.criticalClient || (this.kpi != null && isOrgHierarchyDeliveriesDrilldownKpi(this.kpi));
  }

  get isCriticalClientDrilldown(): boolean {
    return !!this.criticalClient;
  }

  readonly criticalIssueFilters: ReadonlyArray<{
    id: CriticalClientIssueFilter;
    label: string;
  }> = [
    { id: 'all', label: 'Todos' },
    { id: 'overdue', label: 'Atraso pendente' },
    { id: 'late_finish', label: 'Entrega tardia' }
  ];

  get showDeliveryFinishedColumn(): boolean {
    if (this.isCriticalClientDrilldown) {
      return this.issueFilter === 'late_finish' || this.issueFilter === 'all';
    }
    return this.kpi === 'multa_incurred';
  }

  get showDeliveryDelayColumn(): boolean {
    return this.usesDeliveriesPanel;
  }

  get showDeliveryPointsColumn(): boolean {
    return this.kpi === 'multa_incurred';
  }

  get showDeliveryStatusColumn(): boolean {
    if (this.isCriticalClientDrilldown) {
      return true;
    }
    return (
      this.kpi === 'multa_risk' ||
      this.kpi === 'multa_incurred' ||
      this.kpi === 'near_due' ||
      this.kpi === 'overdue_pending' ||
      this.kpi === 'overdue_pending_justified' ||
      this.kpi === 'overdue_pending_unjustified'
    );
  }

  get showDeliveryIssueKindColumn(): boolean {
    return this.isCriticalClientDrilldown;
  }

  get drilldownBanner(): { severity: 'critical' | 'warning' | 'info'; title: string; body: string } | null {
    if (this.criticalClient) {
      const tags = getCriticalClientTagLabels(this.criticalClient);
      const tier = getCriticalClientTierLabel(this.criticalClient.risk_tier);
      const issueHint =
        this.issueFilter === 'all'
          ? 'Inclui pendências em atraso e entregas concluídas após o prazo.'
          : getCriticalClientIssueFilterLabel(this.issueFilter);
      return {
        severity: this.criticalClient.risk_score >= 75 ? 'critical' : 'warning',
        title: `Cliente crítico · ${tier}`,
        body: `${this.criticalClient.company_label} (score ${Math.round(this.criticalClient.risk_score)}). ${issueHint}${tags.length ? ` Tags: ${tags.join(', ')}.` : ''}`
      };
    }
    switch (this.kpi) {
      case 'multa_incurred':
        return {
          severity: 'critical',
          title: 'Multas incorridas',
          body: 'Entregas concluídas no MTD com regra EntMulta após dt_atraso (exceto justificadas). Verifique conclusão vs. prazo legal.'
        };
      case 'multa_risk':
        return {
          severity: 'critical',
          title: 'Risco de multa iminente',
          body: 'Pendentes na janela entre prazo técnico e legal (EntMulta). Priorize conclusão antes do dt_atraso.'
        };
      case 'overdue_pending_unjustified':
        return {
          severity: 'warning',
          title: 'Atraso sem justificativa',
          body: 'Entregas vencidas ainda pendentes sem registro de justificativa no MTD.'
        };
      case 'near_due':
        return {
          severity: 'warning',
          title: 'Próximas do vencimento',
          body: 'Pendentes com status de atenção ou crítico — risco de escalar para multa.'
        };
      default:
        return null;
    }
  }

  get showKpiComparePanel(): boolean {
    return !this.usesDeliveriesPanel && !!this.kpi && supportsOrgKpiWindowCompare(this.kpi) && !!this.kpiComparePanel;
  }

  get kpiComparePanel(): OrgKpiComparePanel | null {
    if (!this.kpi) {
      return null;
    }
    return buildOrgKpiComparePanel(this.kpi, this.compareContext, this.reportParams);
  }

  get showKpiChart(): boolean {
    return this.chartLabels.length > 0 && this.chartDatasets.length > 0;
  }

  get hasMonthlyHistoryTable(): boolean {
    return (this.kpiComparePanel?.monthlyHistory?.length ?? 0) > 0;
  }

  get usesClientListsPanel(): boolean {
    return shouldFetchOrgHierarchyClientLists(this.kpi, this.initialClientListKey);
  }

  get showClientListsPanel(): boolean {
    return this.usesClientListsPanel && !!this.kpiDetail?.client_lists;
  }

  get showClientsServedServerExport(): boolean {
    return this.kpi === 'clients_served' && !this.usesClientListsPanel;
  }

  get clientListTabs(): OrgHierarchyClientListTab[] {
    return buildOrgHierarchyClientListTabs(this.kpiDetail?.client_lists);
  }

  get activeClientListItems(): OrgHierarchyClientListItem[] {
    return getClientListItems(this.kpiDetail?.client_lists, this.clientListFilter);
  }

  get filteredClientListItems(): OrgHierarchyClientListItem[] {
    return filterOrgHierarchyClientListItems(this.activeClientListItems, this.clientListSearchQuery);
  }

  get hasClientListSearch(): boolean {
    return this.clientListSearchQuery.trim().length > 0;
  }

  get showClientListTagsColumn(): boolean {
    return this.clientListFilter === 'clients_served';
  }

  get activeClientListLabel(): string {
    return getOrgHierarchyClientListLabel(this.clientListFilter);
  }

  get deliveriesWindowLabel(): string {
    if (this.kpi === 'multa_risk') {
      return 'Janela técnico→legal';
    }
    if (this.kpi === 'multa_incurred') {
      return 'Janela MTD (concluídas)';
    }
    return 'Janela MTD';
  }

  get hasDeliverySearch(): boolean {
    return this.deliverySearchQuery.trim().length > 0;
  }

  get filteredDiretorias(): OrganizationHierarchyDeliveriesDiretoriaRow[] {
    const source = this.deliveries?.diretorias ?? [];
    const term = this.normalizeSearchTerm(this.deliverySearchQuery);
    if (!term) {
      return source;
    }
    return this.filterDiretoriasBySearch(source, term);
  }

  get filteredDeliveryTotal(): number {
    return this.filteredDiretorias.reduce((sum, dir) => sum + (dir.delivery_count ?? 0), 0);
  }

  onDeliverySearchInput(event: Event): void {
    this.deliverySearchQuery = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  clearDeliverySearch(): void {
    this.deliverySearchQuery = '';
    this.cdr.markForCheck();
  }

  get modalIcon(): string {
    if (this.criticalClient) {
      return 'ri-user-unfollow-line';
    }
    if (this.kpi === 'multa_risk' || this.kpi === 'multa_incurred') {
      return 'ri-alarm-warning-line';
    }
    if (
      this.kpi === 'clients_served' ||
      this.kpi === 'clients_acessorias_g4' ||
      this.kpi === 'clients_acessorias_onboarding' ||
      this.kpi === 'clients_acessorias_risco_de_churn'
    ) {
      return 'ri-building-4-line';
    }
    if (this.kpi === 'on_time_pct') {
      return 'ri-time-line';
    }
    if (
      this.kpi === 'pending_open' ||
      this.kpi === 'overdue_pending' ||
      this.kpi === 'near_due' ||
      this.kpi === 'overdue_pending_justified' ||
      this.kpi === 'overdue_pending_unjustified'
    ) {
      return 'ri-alert-line';
    }
    return 'ri-bar-chart-grouped-line';
  }

  get modalTitle(): string {
    if (this.criticalClient) {
      const issueSuffix =
        this.issueFilter !== 'all' ? ` · ${getCriticalClientIssueFilterLabel(this.issueFilter)}` : '';
      const scope = this.nodeLabel?.trim();
      const base = `Entregas · ${this.criticalClient.company_label}${issueSuffix}`;
      if (!scope || scope === 'Escopo') {
        return base;
      }
      return `${base} (${scope})`;
    }
    const kpiLabel =
      this.deliveries?.drilldown_label ??
      this.kpiDetail?.kpi_label ??
      this.kpiLabelFallback;
    const scope = this.nodeLabel?.trim();
    if (!scope || scope === 'Escopo') {
      return kpiLabel;
    }
    return `${kpiLabel} (${scope})`;
  }

  readonly skeletonCompareSlots = [0, 1, 2];
  readonly skeletonTableRowSlots = [0, 1, 2, 3, 4];
  readonly skeletonDeliveryGroupSlots = [0, 1, 2];

  trackBySkeletonIndex(_index: number, item: number): number {
    return item;
  }

  private get kpiLabelFallback(): string {
    switch (this.kpi) {
      case undefined:
        return 'Detalhamento';
      case 'on_time_pct':
        return 'Entregas no prazo';
      case 'clients_served':
        return 'Clientes atendidos';
      case 'finished':
        return 'Entregas concluídas';
      case 'points_delivered':
        return 'Pontos entregues';
      case 'pending_open':
        return 'Pendentes em aberto';
      case 'near_due':
        return 'Próximo do vencimento';
      case 'overdue_pending':
        return 'Atrasados';
      case 'overdue_pending_justified':
        return 'Atraso justificado';
      case 'overdue_pending_unjustified':
        return 'Atraso sem justificativa';
      case 'multa_risk':
        return 'Risco de multa';
      case 'multa_incurred':
        return 'Multas incorridas';
      case 'clients_acessorias_risco_de_churn':
        return 'Clientes Acessórias (risco de churn)';
      case 'clients_acessorias_onboarding':
        return 'Clientes Acessórias (onboarding)';
      case 'clients_acessorias_g4':
        return 'Clientes Acessórias (G4)';
      default:
        return this.kpi ?? 'Detalhamento';
    }
  }

  private resetState(): void {
    this.isLoading = true;
    this.isExportingClientsServed = false;
    this.kpiDetail = null;
    this.deliveries = null;
    this.deliverySearchQuery = '';
    this.clientListSearchQuery = '';
    this.clientListFilter = this.resolveInitialClientListFilter();
    this.chartLabels = [];
    this.chartDatasets = [];
    this.chartShowLegend = false;
    this.cdr.markForCheck();
  }

  private resolveInitialClientListFilter(): OrgHierarchyClientListKey {
    if (isOrgHierarchyTagClientListKey(this.initialClientListKey)) {
      return this.initialClientListKey;
    }
    if (this.kpi && shouldFetchOrgHierarchyClientLists(this.kpi, null)) {
      return getDefaultClientListKeyForKpi(this.kpi);
    }
    return 'clients_acessorias_g4';
  }

  private shouldFetchKpiDetail(): boolean {
    if (!this.kpi || this.usesDeliveriesPanel || this.criticalClient) {
      return false;
    }
    if (shouldFetchOrgHierarchyClientLists(this.kpi, this.initialClientListKey)) {
      return true;
    }
    return !this.hasCompareMonthlyHistory();
  }

  private hasCompareMonthlyHistory(): boolean {
    if (!this.kpi) {
      return false;
    }
    return buildOrgKpiComparePanel(this.kpi, this.compareContext, this.reportParams)?.monthlyHistory?.length
      ? true
      : false;
  }

  private async load(): Promise<void> {
    if (!this.month || (!this.kpi && !this.criticalClient)) {
      return;
    }
    this.resetState();

    if (this.criticalClient) {
      this.actionLogService
        .fetchOrganizationHierarchyDeliveries({
          month: this.month,
          drilldown: 'critical_client',
          nodeType: this.nodeType,
          nodeId: this.nodeId,
          companyServeKey: this.criticalClient.company_serve_key,
          issue: this.issueFilter
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: res => {
            this.deliveries = res;
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.deliveries = null;
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    if (this.kpi && isOrgHierarchyDeliveriesDrilldownKpi(this.kpi)) {
      this.actionLogService
        .fetchOrganizationHierarchyDeliveries({
          month: this.month,
          drilldown: this.kpi,
          nodeType: this.nodeType,
          nodeId: this.nodeId
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: res => {
            this.deliveries = res;
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.deliveries = null;
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    if (!this.shouldFetchKpiDetail()) {
      if (this.hasCompareMonthlyHistory()) {
        this.finishKpiPanelLoad();
        return;
      }
    }

    this.actionLogService
      .fetchOrganizationHierarchyKpiDetail({
        month: this.month,
        kpi: this.kpi!,
        nodeType: this.nodeType,
        nodeId: this.nodeId,
        months: this.months
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.kpiDetail = res;
          this.applyChartData();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.kpiDetail = null;
          this.applyChartData();
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private finishKpiPanelLoad(): void {
    this.applyChartData();
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private applyChartData(): void {
    if (!this.kpi || this.usesDeliveriesPanel) {
      this.chartLabels = [];
      this.chartDatasets = [];
      this.chartShowLegend = false;
      return;
    }

    const history = resolveOrgKpiMonthlyHistoryForChart(
      this.kpi,
      this.compareContext,
      this.kpiDetail?.history
    );

    if (!history.length) {
      this.chartLabels = [];
      this.chartDatasets = [];
      this.chartShowLegend = false;
      return;
    }

    const chart = buildOrgKpiMonthlyHistoryChartDatasets(this.kpi, history);
    this.chartLabels = chart.labels;
    this.chartDatasets = chart.datasets;
    this.chartShowLegend = chart.showLegend;
  }

  formatIsoDate(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return value;
    }
    return d.toLocaleDateString('pt-BR');
  }

  formatDeliveryPoints(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return '—';
    }
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  deliveryCompanyLabel(delivery: OrganizationHierarchyDeliveryRow): string {
    return getOrgHierarchyDeliveryCompanyLabel(delivery);
  }

  deliveryActionTitleLabel(delivery: OrganizationHierarchyDeliveryRow): string {
    return getOrgHierarchyDeliveryActionTitle(delivery);
  }

  exportDeliveries(format: SpreadsheetExportFormat): void {
    const rows = flattenOrgHierarchyDeliveriesForExport(this.filteredDiretorias, {
      includeDelayColumn: this.showDeliveryDelayColumn && !this.showDeliveryFinishedColumn,
      includeFinishedColumn: this.showDeliveryFinishedColumn,
      includePointsColumn: this.showDeliveryPointsColumn,
      includeStatusColumns: this.showDeliveryStatusColumn,
      includeDelayWithFinished: this.kpi === 'multa_incurred' || this.isCriticalClientDrilldown,
      includeIssueKindColumn: this.showDeliveryIssueKindColumn
    });
    if (rows.length === 0) {
      this.toastService.error('Nenhuma entrega para exportar.', false);
      return;
    }
    const drilldown: OrgHierarchyDeliveriesDrilldownKey | null = this.isCriticalClientDrilldown
      ? 'critical_client'
      : this.kpi && isOrgHierarchyDeliveriesDrilldownKpi(this.kpi)
        ? this.kpi
        : null;
    if (!drilldown) {
      return;
    }
    const filename = buildOrgHierarchyDeliveriesExportFilename({
      drilldown,
      month: this.month,
      scopeLabel: this.nodeLabel,
      format,
      filtered: this.hasDeliverySearch,
      clientLabel: this.criticalClient?.company_label,
      issue: this.isCriticalClientDrilldown ? this.issueFilter : undefined
    });
    downloadSpreadsheetFile(format, filename, rows, 'Entregas');
    this.toastService.success(
      `Arquivo exportado (${rows.length} ${rows.length === 1 ? 'entrega' : 'entregas'}).`
    );
  }

  onCriticalIssueFilterChange(issue: CriticalClientIssueFilter): void {
    if (this.issueFilter === issue) {
      return;
    }
    this.issueFilterChange.emit(issue);
  }

  onClientListFilterChange(key: OrgHierarchyClientListKey): void {
    if (this.clientListFilter === key) {
      return;
    }
    this.clientListFilter = key;
    this.clientListSearchQuery = '';
    this.cdr.markForCheck();
  }

  onClientListSearchInput(event: Event): void {
    this.clientListSearchQuery = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  clearClientListSearch(): void {
    this.clientListSearchQuery = '';
    this.cdr.markForCheck();
  }

  clientListTagsLabel(client: OrgHierarchyClientListItem): string {
    return formatOrgHierarchyClientListTags(client) || '—';
  }

  clientListPlayerLabel(client: OrgHierarchyClientListItem): string {
    return client.player_name ?? client.player_email ?? '—';
  }

  exportClientList(format: SpreadsheetExportFormat): void {
    const rows = mapOrgHierarchyClientListForExport(this.filteredClientListItems, {
      includeTags: this.showClientListTagsColumn
    });
    if (rows.length === 0) {
      this.toastService.error('Nenhum cliente para exportar.', false);
      return;
    }
    const filename = buildOrgHierarchyClientListExportFilename({
      listKey: this.clientListFilter,
      month: this.month,
      scopeLabel: this.nodeLabel,
      format,
      filtered: this.hasClientListSearch
    });
    downloadSpreadsheetFile(format, filename, rows, 'Clientes');
    this.toastService.success(
      `Arquivo exportado (${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}).`
    );
  }

  exportClientsServedXlsx(): void {
    if (this.isExportingClientsServed || this.kpi !== 'clients_served') {
      return;
    }
    this.isExportingClientsServed = true;
    this.cdr.markForCheck();

    this.actionLogService
      .exportOrganizationHierarchyClientsServedXlsx({
        month: this.month,
        nodeType: this.nodeType,
        nodeId: this.nodeId
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
              month: this.month,
              scopeLabel: this.nodeLabel,
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

  trackByClientListItem(_index: number, client: OrgHierarchyClientListItem): string {
    return `${client.company_serve_key}|${client.company_name}`;
  }

  deliveryIssueKindLabel(delivery: OrganizationHierarchyDeliveryRow): string {
    return formatCriticalClientIssueKindLabel(delivery.issue_kind) || '—';
  }

  deliveryPlayerLabel(delivery: OrganizationHierarchyDeliveryRow): string {
    return delivery.player_name ?? delivery.player_email ?? '—';
  }

  deliveryStatusLabel(delivery: OrganizationHierarchyDeliveryRow): string {
    return delivery.status_calc?.trim() || delivery.status?.trim() || '—';
  }

  deliveryRowClass(delivery: OrganizationHierarchyDeliveryRow): string | null {
    if (this.isCriticalClientDrilldown) {
      if (delivery.issue_kind === 'overdue') {
        return 'multa-table__row--critical';
      }
      if (delivery.issue_kind === 'late_finish') {
        return 'multa-table__row--warning';
      }
      return null;
    }
    if (this.kpi === 'multa_incurred' || this.kpi === 'multa_risk') {
      return 'multa-table__row--critical';
    }
    if (this.kpi === 'overdue_pending_unjustified') {
      return 'multa-table__row--warning';
    }
    if (this.kpi === 'near_due' && delivery.status_calc) {
      const status = delivery.status_calc.toLowerCase();
      if (status.includes('crit') || status.includes('multa')) {
        return 'multa-table__row--warning';
      }
    }
    return null;
  }

  private normalizeSearchTerm(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private filterDiretoriasBySearch(
    diretorias: OrganizationHierarchyDeliveriesDiretoriaRow[],
    term: string
  ): OrganizationHierarchyDeliveriesDiretoriaRow[] {
    return diretorias
      .map(dir => {
        const gerencias = (dir.gerencias ?? [])
          .map(ger => {
            const supervisoes = (ger.supervisoes ?? [])
              .map(sup => {
                const deliveries = (sup.deliveries ?? []).filter(delivery =>
                  this.deliveryMatchesSearch(delivery, {
                    diretoriaLabel: dir.label,
                    gerenciaLabel: ger.label,
                    supervisorLabel: sup.label
                  }, term)
                );
                if (deliveries.length === 0) {
                  return null;
                }
                return {
                  ...sup,
                  deliveries,
                  delivery_count: deliveries.length
                };
              })
              .filter((sup): sup is NonNullable<typeof sup> => sup != null);

            if (supervisoes.length === 0) {
              return null;
            }

            const deliveryCount = supervisoes.reduce((sum, sup) => sum + sup.delivery_count, 0);
            return {
              ...ger,
              supervisoes,
              delivery_count: deliveryCount
            };
          })
          .filter((ger): ger is NonNullable<typeof ger> => ger != null);

        if (gerencias.length === 0) {
          return null;
        }

        const deliveryCount = gerencias.reduce((sum, ger) => sum + ger.delivery_count, 0);
        return {
          ...dir,
          gerencias,
          delivery_count: deliveryCount
        };
      })
      .filter((dir): dir is NonNullable<typeof dir> => dir != null);
  }

  private deliveryMatchesSearch(
    delivery: OrganizationHierarchyDeliveryRow,
    context: {
      diretoriaLabel: string;
      gerenciaLabel: string;
      supervisorLabel: string;
    },
    term: string
  ): boolean {
    const haystack = this.normalizeSearchTerm(
      [
        delivery.action_name,
        delivery.action_title,
        delivery.delivery_title,
        delivery.client_name,
        delivery.client_key,
        delivery.status,
        delivery.status_calc,
        delivery.issue_kind ? formatCriticalClientIssueKindLabel(delivery.issue_kind) : '',
        delivery.player_name,
        delivery.player_email,
        delivery.team_name,
        delivery.team_id,
        context.supervisorLabel,
        context.gerenciaLabel,
        context.diretoriaLabel
      ]
        .filter((value): value is string => !!value && String(value).trim().length > 0)
        .join(' ')
    );
    return haystack.includes(term);
  }
}
