import {
  CriticalClientIssueFilter,
  OrgHierarchyAsyncExportJobStatus,
  OrgHierarchyAsyncExportType,
  OrgHierarchyNodeType
} from '@model/game4u-api.model';

export type OrgHierarchyExportJobUiStatus = OrgHierarchyAsyncExportJobStatus;

export interface OrgHierarchyExportJobParams {
  month: Date;
  nodeType?: OrgHierarchyNodeType;
  nodeId?: string;
  scopeLabel?: string;
  companyServeKey?: string;
  issue?: CriticalClientIssueFilter;
  dedupeDeliveries?: boolean;
}

export interface OrgHierarchyExportJob {
  /** ID local (UI); distinto do `serverJobId` quando assíncrono. */
  localId: string;
  serverJobId?: string;
  kind: OrgHierarchyAsyncExportType;
  label: string;
  status: OrgHierarchyExportJobUiStatus;
  /** 0–100 quando conhecido; `null` = indeterminado (sync legado). */
  progressPct: number | null;
  phaseLabel: string | null;
  rowCount: number | null;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  filename?: string;
  dismissed: boolean;
  /** Modo legado síncrono (GET blob direto). */
  syncLegacy: boolean;
}

export interface OrgHierarchyExportJobPersisted {
  localId: string;
  serverJobId: string;
  kind: OrgHierarchyAsyncExportType;
  label: string;
  startedAt: number;
}

export const ORG_HIERARCHY_EXPORT_JOB_STORAGE_KEY = 'org_hierarchy_export_jobs_v1';

export function orgHierarchyExportKindLabel(kind: OrgHierarchyAsyncExportType): string {
  switch (kind) {
    case 'clients_served_xlsx':
      return 'Clientes atendidos (Excel)';
    case 'critical_clients_deliveries':
      return 'Entregas de clientes críticos (Excel)';
    default:
      return 'Exportação organizacional';
  }
}

export function orgHierarchyExportPhaseLabel(phase: string | null | undefined): string | null {
  const key = String(phase ?? '').trim().toLowerCase();
  if (!key) {
    return null;
  }
  const labels: Record<string, string> = {
    queued: 'Na fila',
    querying: 'Consultando dados',
    building_xlsx: 'Gerando planilha',
    uploading: 'Preparando download',
    reading_cache: 'Lendo cache',
    finalizing: 'Finalizando'
  };
  return labels[key] ?? phase ?? null;
}
