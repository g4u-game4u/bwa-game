import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Subject, firstValueFrom, take, takeUntil } from 'rxjs';
import * as moment from 'moment';
import { Game4uApiService } from '@services/game4u-api.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from '@services/toast.service';
import {
  Game4uReportsPipelineIntegrationChangesPage,
  PipelineIntegrationChangeRow,
  PipelineIntegrationPhase,
  pipelineChangeEntityLabel,
  pipelineChangeFieldName,
  pipelineChangeNewValue,
  pipelineChangeOldValue,
  pipelineChangeTimestamp
} from '@model/game4u-api.model';

interface PhaseOption {
  value: PipelineIntegrationPhase | '';
  label: string;
}

@Component({
  selector: 'app-pipeline-integration-changes',
  templateUrl: './pipeline-integration-changes.component.html',
  styleUrls: ['./pipeline-integration-changes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PipelineIntegrationChangesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly phaseOptions: PhaseOption[] = [
    { value: 'reconcile', label: 'Reconcile' },
    { value: 'ingest', label: 'Ingest' },
    { value: 'transform', label: 'Transform' },
    { value: 'sync', label: 'Sync' },
    { value: '', label: 'Todas as fases' }
  ];

  selectedPhase: PipelineIntegrationPhase | '' = 'reconcile';
  limit = 100;
  selectedMonth = moment().format('YYYY-MM');
  selectedMonthsAgo = 0;

  isLoading = false;
  hasLoadError = false;
  errorMessage = '';
  page: Game4uReportsPipelineIntegrationChangesPage | null = null;
  expandedRowId: string | number | null = null;

  readonly pipelineChangeTimestamp = pipelineChangeTimestamp;
  readonly pipelineChangeFieldName = pipelineChangeFieldName;
  readonly pipelineChangeOldValue = pipelineChangeOldValue;
  readonly pipelineChangeNewValue = pipelineChangeNewValue;
  readonly pipelineChangeEntityLabel = pipelineChangeEntityLabel;

  constructor(
    private game4uApi: Game4uApiService,
    private sessaoProvider: SessaoProvider,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get rows(): PipelineIntegrationChangeRow[] {
    return this.page?.items ?? [];
  }

  get isEmpty(): boolean {
    return !this.isLoading && !this.hasLoadError && this.rows.length === 0;
  }

  get intervalLabel(): string {
    const { start, end } = this.buildInterval();
    return `${moment(start).format('DD/MM/YYYY HH:mm')} – ${moment(end).format('DD/MM/YYYY HH:mm')}`;
  }

  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    this.selectedMonth = moment().subtract(monthsAgo, 'months').format('YYYY-MM');
    void this.loadChanges();
  }

  onPhaseChange(value: string): void {
    this.selectedPhase = value as PipelineIntegrationPhase | '';
    void this.loadChanges();
  }

  onLimitChange(raw: string): void {
    const parsed = Number.parseInt(raw, 10);
    this.limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 100;
    void this.loadChanges();
  }

  async reload(): Promise<void> {
    await this.loadChanges();
  }

  toggleRowDetails(row: PipelineIntegrationChangeRow): void {
    const id = row.id ?? pipelineChangeTimestamp(row) ?? JSON.stringify(row);
    this.expandedRowId = this.expandedRowId === id ? null : id;
    this.cdr.markForCheck();
  }

  isRowExpanded(row: PipelineIntegrationChangeRow): boolean {
    const id = row.id ?? pipelineChangeTimestamp(row) ?? JSON.stringify(row);
    return this.expandedRowId === id;
  }

  rowTrackId(index: number, row: PipelineIntegrationChangeRow): string | number {
    return row.id ?? pipelineChangeTimestamp(row) ?? index;
  }

  formatJson(row: PipelineIntegrationChangeRow): string {
    try {
      return JSON.stringify(row, null, 2);
    } catch {
      return String(row);
    }
  }

  logout(): void {
    const snack = this.toastService.action('Deseja sair do sistema?', 'Sair', {
      duration: 8000,
      panelClass: ['snackbar-warning'],
      dismissOnOutsideClick: true
    });
    snack
      .onAction()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(() => {
        void this.sessaoProvider.logout();
      });
  }

  private buildInterval(): { start: string; end: string } {
    const month = moment(this.selectedMonth, 'YYYY-MM', true);
    const anchor = month.isValid() ? month : moment().startOf('month');
    return {
      start: anchor.clone().startOf('month').toISOString(),
      end: anchor.clone().endOf('month').toISOString()
    };
  }

  private async loadChanges(): Promise<void> {
    this.isLoading = true;
    this.hasLoadError = false;
    this.errorMessage = '';
    this.cdr.markForCheck();

    const { start, end } = this.buildInterval();
    try {
      this.page = await firstValueFrom(
        this.game4uApi.getGameReportsPipelineIntegrationChanges({
          start,
          end,
          ...(this.selectedPhase ? { phase: this.selectedPhase } : {}),
          limit: this.limit
        })
      );
    } catch (error) {
      this.page = null;
      this.hasLoadError = true;
      this.errorMessage =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o log de mudanças do pipeline.';
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }
}
