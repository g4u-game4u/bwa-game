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
  PipelineIntegrationChangesSummary,
  PipelineIntegrationPhase
} from '@model/game4u-api.model';
import {
  PipelineIntegrationChangeDiffEntry,
  buildPipelineChangeDiffEntries,
  buildPipelineIntegrationChangesExportFilename,
  flattenPipelineIntegrationChangesForExport,
  formatPipelineSnapshotJson,
  formatPipelineSnapshotValue,
  pipelineChangeActionLabel,
  pipelineChangeAppliedAt,
  pipelineChangeChangedEntries,
  pipelineChangeEmail,
  pipelineChangeHasSnapshotDiff,
  pipelineChangePhase,
  pipelineChangeRule,
  pipelineChangeRunIdShort,
  pipelineChangeSuccess
} from '@services/pipeline-integration-changes.mapper';
import { downloadXlsxFile } from '@utils/spreadsheet-export';

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
  isExporting = false;
  hasLoadError = false;
  errorMessage = '';
  page: Game4uReportsPipelineIntegrationChangesPage | null = null;
  expandedRowId: string | number | null = null;

  readonly pipelineChangeAppliedAt = pipelineChangeAppliedAt;
  readonly pipelineChangePhase = pipelineChangePhase;
  readonly pipelineChangeActionLabel = pipelineChangeActionLabel;
  readonly pipelineChangeEmail = pipelineChangeEmail;
  readonly pipelineChangeRule = pipelineChangeRule;
  readonly pipelineChangeSuccess = pipelineChangeSuccess;
  readonly pipelineChangeRunIdShort = pipelineChangeRunIdShort;
  readonly pipelineChangeHasSnapshotDiff = pipelineChangeHasSnapshotDiff;
  readonly pipelineChangeChangedEntries = pipelineChangeChangedEntries;
  readonly buildPipelineChangeDiffEntries = buildPipelineChangeDiffEntries;
  readonly formatPipelineSnapshotValue = formatPipelineSnapshotValue;
  readonly formatPipelineSnapshotJson = formatPipelineSnapshotJson;

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

  get summary(): PipelineIntegrationChangesSummary | null {
    return this.page?.summary ?? null;
  }

  get summaryActionKinds(): Array<{ kind: string; count: number }> {
    const byKind = this.summary?.by_action_kind;
    if (!byKind) {
      return [];
    }
    return Object.entries(byKind)
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
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

  async exportToExcel(): Promise<void> {
    if (this.isExporting || this.isLoading) {
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const rows = await this.fetchAllRowsForExport();
      if (rows.length === 0) {
        this.toastService.error('Nenhum registro para exportar no período selecionado.');
        return;
      }

      const exportRows = flattenPipelineIntegrationChangesForExport(rows);
      const filename = buildPipelineIntegrationChangesExportFilename({
        month: this.selectedMonth,
        phase: this.selectedPhase || undefined
      });
      downloadXlsxFile(filename, exportRows, 'Pipeline');
      this.toastService.success(`Exportados ${rows.length} registro(s) em Excel.`);
    } catch (error) {
      this.toastService.error(
        error instanceof Error ? error.message : 'Não foi possível exportar os logs para Excel.'
      );
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  toggleRowDetails(row: PipelineIntegrationChangeRow): void {
    const id = row.id ?? pipelineChangeAppliedAt(row) ?? JSON.stringify(row);
    this.expandedRowId = this.expandedRowId === id ? null : id;
    this.cdr.markForCheck();
  }

  isRowExpanded(row: PipelineIntegrationChangeRow): boolean {
    const id = row.id ?? pipelineChangeAppliedAt(row) ?? JSON.stringify(row);
    return this.expandedRowId === id;
  }

  rowTrackId(index: number, row: PipelineIntegrationChangeRow): string | number {
    return row.id ?? pipelineChangeAppliedAt(row) ?? index;
  }

  diffTrackKey(_index: number, entry: PipelineIntegrationChangeDiffEntry): string {
    return entry.key;
  }

  rowStatusClass(row: PipelineIntegrationChangeRow): string {
    const success = pipelineChangeSuccess(row);
    if (success === false) {
      return 'row--failed';
    }
    if (pipelineChangeHasSnapshotDiff(row)) {
      return 'row--diff';
    }
    return '';
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

  private async fetchAllRowsForExport(): Promise<PipelineIntegrationChangeRow[]> {
    const { start, end } = this.buildInterval();
    const pageSize = 500;
    const all: PipelineIntegrationChangeRow[] = [];
    let offset = 0;

    while (true) {
      const page = await firstValueFrom(
        this.game4uApi.getGameReportsPipelineIntegrationChanges({
          start,
          end,
          ...(this.selectedPhase ? { phase: this.selectedPhase } : {}),
          limit: pageSize,
          offset
        })
      );

      all.push(...page.items);

      if (!page.has_more || page.items.length === 0) {
        break;
      }

      offset += page.items.length;
    }

    return all;
  }
}
