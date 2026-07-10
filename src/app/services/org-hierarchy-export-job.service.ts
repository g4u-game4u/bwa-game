import { Injectable, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subscription, firstValueFrom, timer } from 'rxjs';
import { ActionLogService } from '@services/action-log.service';
import { ToastService } from '@services/toast.service';
import { environment } from '../../environments/environment';
import {
  CriticalClientIssueFilter,
  Game4uReportsOrganizationHierarchyExportJobBody,
  OrgHierarchyAsyncExportType,
  OrgHierarchyNodeType
} from '@model/game4u-api.model';
import {
  ORG_HIERARCHY_EXPORT_JOB_STORAGE_KEY,
  OrgHierarchyExportJob,
  OrgHierarchyExportJobParams,
  OrgHierarchyExportJobPersisted,
  orgHierarchyExportKindLabel,
  orgHierarchyExportPhaseLabel
} from '@model/org-hierarchy-export-job.model';
import {
  buildOrgHierarchyClientListExportFilename
} from '@services/org-hierarchy-client-lists.mapper';
import {
  buildOrgHierarchyCriticalClientsDeliveriesExportFilename
} from '@services/org-hierarchy-kpi-export.mapper';
import {
  downloadBlobFile,
  parseHttpContentDispositionFilename
} from '@utils/spreadsheet-export';

const POLL_INTERVAL_MS = 2000;
const COMPLETED_VISIBLE_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class OrgHierarchyExportJobService implements OnDestroy {
  private readonly jobsSubject = new BehaviorSubject<OrgHierarchyExportJob[]>([]);
  readonly jobs$ = this.jobsSubject.asObservable();

  private readonly pollSubscriptions = new Map<string, Subscription>();
  private readonly syncSubscriptions = new Map<string, Subscription>();
  private asyncApiAvailable: boolean | null = null;

  constructor(
    private readonly actionLogService: ActionLogService,
    private readonly toastService: ToastService
  ) {
    void this.resumePersistedJobs();
  }

  ngOnDestroy(): void {
    for (const sub of this.pollSubscriptions.values()) {
      sub.unsubscribe();
    }
    for (const sub of this.syncSubscriptions.values()) {
      sub.unsubscribe();
    }
  }

  get jobs(): OrgHierarchyExportJob[] {
    return this.jobsSubject.value;
  }

  get visibleJobs(): OrgHierarchyExportJob[] {
    const now = Date.now();
    return this.jobs.filter(job => {
      if (!job.dismissed) {
        return true;
      }
      if (job.status === 'completed' || job.status === 'failed') {
        return (job.completedAt ?? 0) + COMPLETED_VISIBLE_MS > now;
      }
      return false;
    });
  }

  hasActiveJob(kind: OrgHierarchyAsyncExportType): boolean {
    return this.jobs.some(
      job =>
        job.kind === kind &&
        (job.status === 'queued' || job.status === 'processing')
    );
  }

  startClientsServedExport(params: OrgHierarchyExportJobParams): string {
    return this.enqueueJob('clients_served_xlsx', params);
  }

  startCriticalClientsDeliveriesExport(params: OrgHierarchyExportJobParams): string {
    return this.enqueueJob('critical_clients_deliveries', params);
  }

  dismissJob(localId: string): void {
    this.patchJob(localId, { dismissed: true });
  }

  private enqueueJob(kind: OrgHierarchyAsyncExportType, params: OrgHierarchyExportJobParams): string {
    const localId = this.createLocalId();
    const label = this.buildJobLabel(kind, params);
    const job: OrgHierarchyExportJob = {
      localId,
      kind,
      label,
      status: 'queued',
      progressPct: null,
      phaseLabel: 'Iniciando…',
      rowCount: null,
      startedAt: Date.now(),
      dismissed: false,
      syncLegacy: false
    };
    this.upsertJob(job);
    void this.runJob(localId, kind, params);
    return localId;
  }

  private async runJob(
    localId: string,
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams
  ): Promise<void> {
    const monthParam = this.actionLogService.toDashboardCachedMonthParam(params.month);
    const body = this.buildExportJobBody(kind, monthParam, params);

    const preferAsync =
      environment.orgHierarchyAsyncExport !== false && this.asyncApiAvailable !== false;

    if (preferAsync) {
      try {
        const created = await firstValueFrom(
          this.actionLogService.createOrganizationHierarchyExportJob(body)
        );
        this.asyncApiAvailable = true;
        const serverJobId = (created.job_id ?? '').trim();
        if (!serverJobId) {
          throw new Error('job_id ausente na resposta do servidor.');
        }
        this.patchJob(localId, {
          serverJobId,
          status: created.status ?? 'queued',
          progressPct: 0,
          phaseLabel: orgHierarchyExportPhaseLabel('queued'),
          syncLegacy: false
        });
        this.persistJob(localId, serverJobId, kind, this.buildJobLabel(kind, params));
        this.startPolling(localId, serverJobId, kind, params);
        return;
      } catch (error) {
        if (this.isAsyncEndpointUnavailable(error)) {
          this.asyncApiAvailable = false;
        } else {
          this.failJob(localId, this.readErrorMessage(error));
          return;
        }
      }
    }

    void this.runSyncLegacyExport(localId, kind, params, monthParam);
  }

  private runSyncLegacyExport(
    localId: string,
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams,
    monthParam: string
  ): void {
    this.patchJob(localId, {
      status: 'processing',
      progressPct: null,
      phaseLabel: 'Gerando arquivo (modo legado)…',
      syncLegacy: true
    });

    const request$ =
      kind === 'clients_served_xlsx'
        ? this.actionLogService.exportOrganizationHierarchyClientsServedXlsx({
            month: params.month,
            nodeType: params.nodeType,
            nodeId: params.nodeId
          })
        : this.actionLogService.exportOrganizationHierarchyCriticalClientsDeliveries({
            month: params.month,
            nodeType: params.nodeType,
            nodeId: params.nodeId,
            issue: params.issue ?? 'all',
            dedupeDeliveries: params.dedupeDeliveries
          });

    const sub = request$.subscribe({
      next: res => {
        this.syncSubscriptions.delete(localId);
        const blob = res.body;
        if (!blob || blob.size === 0) {
          this.failJob(localId, 'Arquivo vazio retornado pelo servidor.');
          return;
        }
        const headerFilename = parseHttpContentDispositionFilename(
          res.headers.get('Content-Disposition')
        );
        const filename =
          headerFilename ?? this.defaultFilename(kind, params, monthParam);
        downloadBlobFile(blob, filename);
        this.completeJob(localId, filename);
        this.toastService.success('Arquivo Excel exportado.');
      },
      error: error => {
        this.syncSubscriptions.delete(localId);
        this.failJob(localId, this.readErrorMessage(error));
        this.toastService.error('Falha ao exportar arquivo.', false);
      }
    });

    this.syncSubscriptions.set(localId, sub);
  }

  private startPolling(
    localId: string,
    serverJobId: string,
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams
  ): void {
    const sub = timer(0, POLL_INTERVAL_MS).subscribe(() => {
      void this.pollOnce(localId, serverJobId, kind, params);
    });
    this.pollSubscriptions.set(localId, sub);
  }

  private async pollOnce(
    localId: string,
    serverJobId: string,
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams
  ): Promise<void> {
    const job = this.jobs.find(item => item.localId === localId);
    if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      this.stopPolling(localId);
      return;
    }

    try {
      const status = await firstValueFrom(
        this.actionLogService.getOrganizationHierarchyExportJobStatus(serverJobId)
      );

      const progressPct =
        status.progress_pct != null && Number.isFinite(status.progress_pct)
          ? Math.min(100, Math.max(0, status.progress_pct))
          : job.progressPct;

      this.patchJob(localId, {
        status: status.status,
        progressPct,
        phaseLabel: orgHierarchyExportPhaseLabel(status.phase) ?? job.phaseLabel,
        rowCount: status.row_count ?? job.rowCount,
        filename: status.filename ?? job.filename,
        errorMessage: status.error_message ?? undefined
      });

      if (status.status === 'completed') {
        this.stopPolling(localId);
        this.removePersistedJob(localId);
        await this.downloadCompletedJob(localId, serverJobId, kind, params, status.filename);
        return;
      }

      if (status.status === 'failed' || status.status === 'cancelled') {
        this.stopPolling(localId);
        this.removePersistedJob(localId);
        this.failJob(localId, status.error_message ?? 'Exportação cancelada ou falhou.');
        this.toastService.error('Falha ao exportar arquivo.', false);
      }
    } catch (error) {
      this.stopPolling(localId);
      this.removePersistedJob(localId);
      this.failJob(localId, this.readErrorMessage(error));
      this.toastService.error('Falha ao acompanhar exportação.', false);
    }
  }

  private async downloadCompletedJob(
    localId: string,
    serverJobId: string,
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams,
    hintedFilename?: string | null
  ): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.actionLogService.downloadOrganizationHierarchyExportJob(serverJobId)
      );
      const blob = res.body;
      if (!blob || blob.size === 0) {
        this.failJob(localId, 'Arquivo vazio retornado pelo servidor.');
        return;
      }
      const headerFilename = parseHttpContentDispositionFilename(
        res.headers.get('Content-Disposition')
      );
      const monthParam = this.actionLogService.toDashboardCachedMonthParam(params.month);
      const filename =
        headerFilename ??
        (hintedFilename?.trim() || this.defaultFilename(kind, params, monthParam));
      downloadBlobFile(blob, filename);
      this.completeJob(localId, filename);
      this.toastService.success('Arquivo Excel exportado.');
    } catch (error) {
      this.failJob(localId, this.readErrorMessage(error));
      this.toastService.error('Falha ao baixar arquivo exportado.', false);
    }
  }

  private async resumePersistedJobs(): Promise<void> {
    const persisted = this.readPersistedJobs();
    if (!persisted.length) {
      return;
    }
    for (const item of persisted) {
      const job: OrgHierarchyExportJob = {
        localId: item.localId,
        serverJobId: item.serverJobId,
        kind: item.kind,
        label: item.label,
        status: 'processing',
        progressPct: null,
        phaseLabel: 'Retomando exportação…',
        rowCount: null,
        startedAt: item.startedAt,
        dismissed: false,
        syncLegacy: false
      };
      this.upsertJob(job);
      this.startPolling(item.localId, item.serverJobId, item.kind, {
        month: new Date(),
        scopeLabel: item.label
      });
    }
  }

  private buildExportJobBody(
    kind: OrgHierarchyAsyncExportType,
    monthParam: string,
    params: OrgHierarchyExportJobParams
  ): Game4uReportsOrganizationHierarchyExportJobBody {
    const nodeType = (params.nodeType ?? '').trim();
    const nodeId = (params.nodeId ?? '').trim();
    const companyServeKey = (params.companyServeKey ?? '').trim();
    const issue = (params.issue ?? 'all').trim() || 'all';

    return {
      export_type: kind,
      month: monthParam,
      ...(nodeType ? { node_type: nodeType as OrgHierarchyNodeType } : {}),
      ...(nodeId ? { node_id: nodeId } : {}),
      ...(companyServeKey ? { company_serve_key: companyServeKey } : {}),
      ...(kind === 'critical_clients_deliveries' ? { issue: issue as CriticalClientIssueFilter } : {}),
      ...(params.dedupeDeliveries === false ? { dedupe_deliveries: false } : {})
    };
  }

  private defaultFilename(
    kind: OrgHierarchyAsyncExportType,
    params: OrgHierarchyExportJobParams,
    monthParam: string
  ): string {
    const month = this.parseMonthParam(monthParam);
    if (kind === 'clients_served_xlsx') {
      return buildOrgHierarchyClientListExportFilename({
        listKey: 'clients_served',
        month,
        scopeLabel: params.scopeLabel,
        format: 'xlsx'
      });
    }
    return buildOrgHierarchyCriticalClientsDeliveriesExportFilename({
      month,
      scopeLabel: params.scopeLabel,
      issue: params.issue ?? 'all'
    });
  }

  private parseMonthParam(monthParam: string): Date {
    const [y, m] = monthParam.split('-').map(part => Number(part));
    if (!Number.isFinite(y) || !Number.isFinite(m)) {
      return new Date();
    }
    return new Date(y, m - 1, 1);
  }

  private buildJobLabel(kind: OrgHierarchyAsyncExportType, params: OrgHierarchyExportJobParams): string {
    const scope = (params.scopeLabel ?? '').trim();
    const base = orgHierarchyExportKindLabel(kind);
    return scope ? `${base} · ${scope}` : base;
  }

  private completeJob(localId: string, filename: string): void {
    this.patchJob(localId, {
      status: 'completed',
      progressPct: 100,
      phaseLabel: 'Concluído',
      filename,
      completedAt: Date.now()
    });
  }

  private failJob(localId: string, message: string): void {
    this.patchJob(localId, {
      status: 'failed',
      errorMessage: message,
      phaseLabel: 'Falhou',
      completedAt: Date.now()
    });
  }

  private stopPolling(localId: string): void {
    const sub = this.pollSubscriptions.get(localId);
    if (sub) {
      sub.unsubscribe();
      this.pollSubscriptions.delete(localId);
    }
  }

  private upsertJob(job: OrgHierarchyExportJob): void {
    const next = [...this.jobs.filter(item => item.localId !== job.localId), job].sort(
      (a, b) => b.startedAt - a.startedAt
    );
    this.jobsSubject.next(next);
  }

  private patchJob(localId: string, patch: Partial<OrgHierarchyExportJob>): void {
    const current = this.jobs.find(item => item.localId === localId);
    if (!current) {
      return;
    }
    this.upsertJob({ ...current, ...patch });
  }

  private createLocalId(): string {
    return `org-export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private isAsyncEndpointUnavailable(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }
    return error.status === 404 || error.status === 405 || error.status === 501;
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return (
        (typeof error.error === 'string' && error.error.trim()) ||
        error.message ||
        `Erro HTTP ${error.status}`
      );
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Erro desconhecido na exportação.';
  }

  private readPersistedJobs(): OrgHierarchyExportJobPersisted[] {
    try {
      const raw = sessionStorage.getItem(ORG_HIERARCHY_EXPORT_JOB_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as OrgHierarchyExportJobPersisted[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writePersistedJobs(jobs: OrgHierarchyExportJobPersisted[]): void {
    try {
      if (!jobs.length) {
        sessionStorage.removeItem(ORG_HIERARCHY_EXPORT_JOB_STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(ORG_HIERARCHY_EXPORT_JOB_STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      // ignore quota / private mode
    }
  }

  private persistJob(
    localId: string,
    serverJobId: string,
    kind: OrgHierarchyAsyncExportType,
    label: string
  ): void {
    const next = this.readPersistedJobs().filter(item => item.localId !== localId);
    next.push({
      localId,
      serverJobId,
      kind,
      label,
      startedAt: Date.now()
    });
    this.writePersistedJobs(next);
  }

  private removePersistedJob(localId: string): void {
    const next = this.readPersistedJobs().filter(item => item.localId !== localId);
    this.writePersistedJobs(next);
  }
}
