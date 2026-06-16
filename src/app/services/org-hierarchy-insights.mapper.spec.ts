import {
  orgHierarchyInsightCategoryLabel,
  orgHierarchyInsightPriorityClass,
  orgHierarchyInsightsSourceLabel,
  parseOrgHierarchyInsightsError
} from './org-hierarchy-insights.mapper';
import { HttpErrorResponse } from '@angular/common/http';

describe('org-hierarchy-insights.mapper', () => {
  it('parseOrgHierarchyInsightsError maps 404 to not_found', () => {
    const err = new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
    expect(parseOrgHierarchyInsightsError(err).kind).toBe('not_found');
  });

  it('parseOrgHierarchyInsightsError maps 402 to credits', () => {
    const err = new HttpErrorResponse({
      status: 402,
      error: { message: 'Insufficient API credits' }
    });
    expect(parseOrgHierarchyInsightsError(err).kind).toBe('credits');
  });

  it('orgHierarchyInsightPriorityClass normalizes priority', () => {
    expect(orgHierarchyInsightPriorityClass('high')).toContain('critical');
    expect(orgHierarchyInsightPriorityClass(undefined)).toContain('warning');
  });

  it('orgHierarchyInsightCategoryLabel maps known categories', () => {
    expect(orgHierarchyInsightCategoryLabel('risk')).toBe('Risco');
    expect(orgHierarchyInsightCategoryLabel('people')).toBe('Pessoas');
  });

  it('orgHierarchyInsightsSourceLabel maps from_cache', () => {
    expect(orgHierarchyInsightsSourceLabel(true)).toBe('Salva');
    expect(orgHierarchyInsightsSourceLabel(false)).toBe('Gerada agora');
  });
});
