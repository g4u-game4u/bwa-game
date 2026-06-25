import {
  PipelineIntegrationChangeRow,
  PipelineIntegrationChangesSummary
} from '@model/game4u-api.model';
import { slugifyExportFilenamePart } from '@utils/spreadsheet-export';

export type { PipelineIntegrationChangesSummary };

export interface PipelineIntegrationRunInfo {
  id?: string;
  phase?: string;
  trigger?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
}

export interface PipelineIntegrationChangeDiffEntry {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function pipelineChangeAppliedAt(row: PipelineIntegrationChangeRow): string | null {
  const raw = row.applied_at ?? row.changed_at ?? row.created_at ?? row.recorded_at;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function pipelineChangePhase(row: PipelineIntegrationChangeRow): string {
  const run = asRecord(row.run);
  const phase = run?.['phase'] ?? row.phase;
  return typeof phase === 'string' && phase.trim() ? phase.trim() : '—';
}

export function pipelineChangeRunInfo(row: PipelineIntegrationChangeRow): PipelineIntegrationRunInfo | null {
  const run = asRecord(row.run);
  if (!run) {
    return null;
  }
  return {
    id: typeof run['id'] === 'string' ? run['id'] : undefined,
    phase: typeof run['phase'] === 'string' ? run['phase'] : undefined,
    trigger: typeof run['trigger'] === 'string' ? run['trigger'] : undefined,
    status: typeof run['status'] === 'string' ? run['status'] : undefined,
    started_at: typeof run['started_at'] === 'string' ? run['started_at'] : undefined,
    finished_at: typeof run['finished_at'] === 'string' ? run['finished_at'] : undefined
  };
}

export function pipelineChangeBeforeJson(row: PipelineIntegrationChangeRow): unknown {
  return row.before_json ?? row.old_value ?? row.value_before ?? row['before_value'] ?? null;
}

export function pipelineChangeAfterJson(row: PipelineIntegrationChangeRow): unknown {
  return row.after_json ?? row.new_value ?? row.value_after ?? row['after_value'] ?? null;
}

export function formatPipelineSnapshotValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value.trim() || '—';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildPipelineChangeDiffEntries(
  row: PipelineIntegrationChangeRow
): PipelineIntegrationChangeDiffEntry[] {
  const before = asRecord(pipelineChangeBeforeJson(row));
  const after = asRecord(pipelineChangeAfterJson(row));

  if (!before && !after) {
    return [];
  }

  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {})
  ]);

  return Array.from(keys)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(key => {
      const beforeValue = before ? before[key] : null;
      const afterValue = after ? after[key] : null;
      return {
        key,
        before: beforeValue ?? null,
        after: afterValue ?? null,
        changed: JSON.stringify(beforeValue) !== JSON.stringify(afterValue)
      };
    });
}

export function pipelineChangeChangedEntries(
  row: PipelineIntegrationChangeRow
): PipelineIntegrationChangeDiffEntry[] {
  return buildPipelineChangeDiffEntries(row).filter(entry => entry.changed);
}

export function pipelineChangeHasSnapshotDiff(row: PipelineIntegrationChangeRow): boolean {
  return pipelineChangeChangedEntries(row).length > 0;
}

export function pipelineChangeActionLabel(row: PipelineIntegrationChangeRow): string {
  const kind = typeof row.action_kind === 'string' ? row.action_kind.trim() : '';
  const summary = typeof row.detail_summary === 'string' ? row.detail_summary.trim() : '';
  if (kind && summary) {
    return `${kind} · ${summary}`;
  }
  return kind || summary || '—';
}

export function pipelineChangeEmail(row: PipelineIntegrationChangeRow): string {
  const email = row.email;
  return typeof email === 'string' && email.trim() ? email.trim() : '—';
}

export function pipelineChangeRule(row: PipelineIntegrationChangeRow): string {
  const rule = row.rule;
  return typeof rule === 'string' && rule.trim() ? rule.trim() : '—';
}

export function pipelineChangeSuccess(row: PipelineIntegrationChangeRow): boolean | null {
  if (typeof row.success === 'boolean') {
    return row.success;
  }
  return null;
}

export function formatPipelineSnapshotJson(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function pipelineChangeRunIdShort(row: PipelineIntegrationChangeRow): string {
  const runId = row.run_id ?? pipelineChangeRunInfo(row)?.id ?? row.batch_id;
  if (typeof runId !== 'string' || !runId.trim()) {
    return '—';
  }
  return runId.length > 8 ? `${runId.slice(0, 8)}…` : runId;
}

function formatExportDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('pt-BR');
}

function compactSnapshotJson(value: unknown): string {
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatPipelineChangeDiffSummary(row: PipelineIntegrationChangeRow): string {
  const changed = pipelineChangeChangedEntries(row);
  if (changed.length === 0) {
    return '';
  }
  return changed
    .map(
      entry =>
        `${entry.key}: ${formatPipelineSnapshotValue(entry.before)} → ${formatPipelineSnapshotValue(entry.after)}`
    )
    .join(' | ');
}

export function flattenPipelineIntegrationChangesForExport(
  rows: PipelineIntegrationChangeRow[]
): Record<string, string | number>[] {
  return rows.map(row => {
    const run = pipelineChangeRunInfo(row);
    const success = pipelineChangeSuccess(row);
    return {
      ID: row.id ?? '',
      'Data aplicação': formatExportDateTime(pipelineChangeAppliedAt(row)),
      Fase: pipelineChangePhase(row),
      'Tipo ação': typeof row.action_kind === 'string' ? row.action_kind : '',
      Resumo: typeof row.detail_summary === 'string' ? row.detail_summary : '',
      'E-mail': pipelineChangeEmail(row) === '—' ? '' : pipelineChangeEmail(row),
      Regra: pipelineChangeRule(row) === '—' ? '' : pipelineChangeRule(row),
      Status: success === true ? 'OK' : success === false ? 'Falha' : '',
      Erro: typeof row.error_message === 'string' ? row.error_message : '',
      'Campos alterados': formatPipelineChangeDiffSummary(row),
      before_json: compactSnapshotJson(pipelineChangeBeforeJson(row)),
      after_json: compactSnapshotJson(pipelineChangeAfterJson(row)),
      'Run ID': row.run_id ?? run?.id ?? '',
      'Run trigger': run?.trigger ?? '',
      'Run status': run?.status ?? '',
      'Run início': formatExportDateTime(run?.started_at),
      'Run fim': formatExportDateTime(run?.finished_at)
    };
  });
}

export function buildPipelineIntegrationChangesExportFilename(options: {
  month: string;
  phase?: string;
}): string {
  const monthSlug = slugifyExportFilenamePart(options.month);
  const phaseSlug = slugifyExportFilenamePart(options.phase?.trim() || 'todas-fases');
  return `pipeline-integracao-changes-${monthSlug}-${phaseSlug}.xlsx`;
}
