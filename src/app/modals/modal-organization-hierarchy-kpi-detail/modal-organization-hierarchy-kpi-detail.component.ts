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
  OrgHierarchyKpiDetailKey,
  OrgHierarchyNodeType,
  OrganizationHierarchyKpiDetailResponse,
  OrganizationHierarchyMultaRiskDeliveryRow,
  OrganizationHierarchyMultaRiskResponse
} from '@model/game4u-api.model';
import type { ChartDataset } from '@model/gamification-dashboard.model';
import { ActionLogService } from '@services/action-log.service';

@Component({
  selector: 'modal-organization-hierarchy-kpi-detail',
  templateUrl: './modal-organization-hierarchy-kpi-detail.component.html',
  styleUrls: ['./modal-organization-hierarchy-kpi-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalOrganizationHierarchyKpiDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() kpi!: OrgHierarchyKpiDetailKey;
  @Input() nodeType?: OrgHierarchyNodeType;
  @Input() nodeId?: string;
  @Input() nodeLabel?: string;
  @Input() month!: Date;
  @Input() months = 4;

  @Output() closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  isLoading = false;
  kpiDetail: OrganizationHierarchyKpiDetailResponse | null = null;
  multaRisk: OrganizationHierarchyMultaRiskResponse | null = null;

  chartLabels: string[] = [];
  chartDatasets: ChartDataset[] = [];

  constructor(
    private readonly actionLogService: ActionLogService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kpi'] || changes['month'] || changes['nodeType'] || changes['nodeId'] || changes['months']) {
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

  get modalIcon(): string {
    if (this.kpi === 'multa_risk') {
      return 'ri-alarm-warning-line';
    }
    if (this.kpi === 'on_time_pct') {
      return 'ri-time-line';
    }
    if (this.kpi === 'pending_open' || this.kpi === 'overdue_pending' || this.kpi === 'near_due') {
      return 'ri-alert-line';
    }
    return 'ri-bar-chart-grouped-line';
  }

  get modalTitle(): string {
    const kpiLabel = this.kpiDetail?.kpi_label ?? this.kpiLabelFallback;
    const scope = this.nodeLabel?.trim() ? this.nodeLabel!.trim() : 'Escopo';
    return `${kpiLabel} — ${scope}`;
  }

  private get kpiLabelFallback(): string {
    switch (this.kpi) {
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
      case 'multa_risk':
        return 'Risco de multa';
      default:
        return this.kpi;
    }
  }

  private resetState(): void {
    this.isLoading = true;
    this.kpiDetail = null;
    this.multaRisk = null;
    this.chartLabels = [];
    this.chartDatasets = [];
    this.cdr.markForCheck();
  }

  private async load(): Promise<void> {
    if (!this.month || !this.kpi) {
      return;
    }
    this.resetState();

    if (this.kpi === 'multa_risk') {
      this.actionLogService
        .fetchOrganizationHierarchyMultaRisk({
          month: this.month,
          nodeType: this.nodeType,
          nodeId: this.nodeId
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: res => {
            this.multaRisk = res;
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.multaRisk = null;
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    this.actionLogService
      .fetchOrganizationHierarchyKpiDetail({
        month: this.month,
        kpi: this.kpi,
        nodeType: this.nodeType,
        nodeId: this.nodeId,
        months: this.months
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.kpiDetail = res;
          this.applyKpiDetailToChart();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.kpiDetail = null;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private applyKpiDetailToChart(): void {
    if (!this.kpiDetail || !Array.isArray(this.kpiDetail.history)) {
      this.chartLabels = [];
      this.chartDatasets = [];
      return;
    }
    this.chartLabels = this.kpiDetail.history.map(h => h.month_label);
    const values = this.kpiDetail.history.map(h => (typeof h.value === 'number' ? h.value : 0));
    const label = this.kpiDetail.kpi_label || this.kpi;
    const borderColor = 'rgba(59, 130, 246, 1)';
    const backgroundColor = 'rgba(59, 130, 246, 0.35)';
    this.chartDatasets = [
      {
        label,
        data: values,
        borderColor,
        backgroundColor,
        borderWidth: 1
      }
    ];
  }

  formatHistoryValue(value: number | null): string {
    if (value == null || !Number.isFinite(value)) {
      return '—';
    }
    if (this.kpi === 'on_time_pct') {
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
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

  deliveryClientLabel(delivery: OrganizationHierarchyMultaRiskDeliveryRow): string {
    return delivery.client_key ?? '—';
  }

  deliveryPlayerLabel(delivery: OrganizationHierarchyMultaRiskDeliveryRow): string {
    return delivery.player_name ?? delivery.player_email ?? '—';
  }
}

