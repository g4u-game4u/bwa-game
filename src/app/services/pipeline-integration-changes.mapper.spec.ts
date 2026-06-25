import {
  buildPipelineChangeDiffEntries,
  flattenPipelineIntegrationChangesForExport,
  pipelineChangeAppliedAt,
  pipelineChangeChangedEntries,
  pipelineChangeHasSnapshotDiff,
  pipelineChangePhase
} from './pipeline-integration-changes.mapper';
import { normalizePipelineIntegrationChangesResponse } from '@model/game4u-api.model';

describe('pipeline-integration-changes.mapper', () => {
  const promoteRow = {
    id: 124,
    applied_at: '2026-06-24T00:46:08.265071+00:00',
    action_kind: 'PROMOTE_MANAGER',
    before_json: {
      email: 'nicoly.costa@bwa.global',
      utc_role: 'GESTOR',
      full_name: 'Nicoly Costa'
    },
    after_json: {
      user_id: '660fae41-a83e-4844-8ef7-967e22fb6ff1',
      team_ids: [29],
      target_role: 'GERENTE'
    },
    run: { phase: 'reconcile' }
  };

  it('reads applied_at and run.phase from API payload', () => {
    expect(pipelineChangeAppliedAt(promoteRow)).toBe('2026-06-24T00:46:08.265071+00:00');
    expect(pipelineChangePhase(promoteRow)).toBe('reconcile');
  });

  it('builds field-level diff between before_json and after_json', () => {
    const changed = pipelineChangeChangedEntries(promoteRow);
    expect(pipelineChangeHasSnapshotDiff(promoteRow)).toBe(true);
    expect(changed.some(entry => entry.key === 'utc_role' && entry.changed)).toBe(true);
    expect(changed.some(entry => entry.key === 'target_role' && entry.after === 'GERENTE')).toBe(true);
  });

  it('handles null before_json on CREATE_PLAYER', () => {
    const row = {
      before_json: null,
      after_json: { email: 'tallys.fonseca@bwa.global' }
    };
    const entries = buildPipelineChangeDiffEntries(row);
    expect(entries).toEqual([
      {
        key: 'email',
        before: null,
        after: 'tallys.fonseca@bwa.global',
        changed: true
      }
    ]);
  });

  it('normalizes API envelope with summary and has_more', () => {
    const page = normalizePipelineIntegrationChangesResponse({
      summary: { total_changes: 153, success_count: 149, failed_count: 4 },
      offset: 0,
      limit: 3,
      has_more: true,
      items: [promoteRow]
    });
    expect(page.total).toBe(153);
    expect(page.has_more).toBe(true);
    expect(page.summary?.failed_count).toBe(4);
    expect(page.items.length).toBe(1);
  });

  it('flattens rows for spreadsheet export with before_json and after_json', () => {
    const [row] = flattenPipelineIntegrationChangesForExport([promoteRow]);
    expect(row['Tipo ação']).toBe('PROMOTE_MANAGER');
    expect(row.before_json).toContain('GESTOR');
    expect(row.after_json).toContain('GERENTE');
    expect(String(row['Campos alterados'])).toContain('target_role');
  });
});
