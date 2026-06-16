import { HttpParams } from '@angular/common/http';
import {
  Game4uReportsOrganizationHierarchyInsightsBody,
  Game4uReportsOrganizationHierarchyInsightsQuery,
  OrganizationHierarchyInsightItem
} from '@model/game4u-api.model';

export function buildOrgHierarchyInsightsHttpParams(
  q: Game4uReportsOrganizationHierarchyInsightsQuery
): HttpParams {
  let params = new HttpParams().set('month', q.month.trim());
  if (q.depth != null && Number.isFinite(q.depth)) {
    params = params.set('depth', String(Math.floor(q.depth)));
  }
  if (q.node_type) {
    params = params.set('node_type', String(q.node_type).trim());
  }
  if (q.node_id) {
    params = params.set('node_id', String(q.node_id).trim());
  }
  const sim = q.simulation_pot_brl;
  if (sim != null && Number.isFinite(sim) && sim > 0) {
    params = params.set('simulation_pot_brl', String(sim));
  }
  if (q.focus) {
    params = params.set('focus', q.focus);
  }
  return params;
}

export function buildOrgHierarchyInsightsCacheKey(
  q: Game4uReportsOrganizationHierarchyInsightsQuery
): string {
  return [
    q.month.trim(),
    q.depth ?? '',
    q.node_type ?? '',
    q.node_id ?? '',
    q.simulation_pot_brl ?? '',
    q.focus ?? 'risks_and_actions'
  ].join('|');
}

export function defaultOrgHierarchyInsightsBody(
  q: Game4uReportsOrganizationHierarchyInsightsQuery
): Game4uReportsOrganizationHierarchyInsightsBody {
  return q.focus ? { focus: q.focus } : {};
}
