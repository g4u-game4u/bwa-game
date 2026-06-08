import { hasOrganizationHierarchyReportRole } from './org-hierarchy-report-role';

describe('hasOrganizationHierarchyReportRole', () => {
  it('returns true for GERENTE, DIRETOR, C_LEVEL, ADMIN and SERVICE', () => {
    expect(hasOrganizationHierarchyReportRole(['GERENTE'])).toBe(true);
    expect(hasOrganizationHierarchyReportRole(['DIRETOR'])).toBe(true);
    expect(hasOrganizationHierarchyReportRole(['C_LEVEL'])).toBe(true);
    expect(hasOrganizationHierarchyReportRole(['ADMIN'])).toBe(true);
    expect(hasOrganizationHierarchyReportRole(['SERVICE'])).toBe(true);
  });

  it('returns false for SUPERVISOR, LIDER_CELULA and PLAYER roles', () => {
    expect(hasOrganizationHierarchyReportRole(['SUPERVISOR'])).toBe(false);
    expect(hasOrganizationHierarchyReportRole(['LIDER_CELULA'])).toBe(false);
    expect(hasOrganizationHierarchyReportRole(['PLAYER'])).toBe(false);
    expect(hasOrganizationHierarchyReportRole(undefined)).toBe(false);
  });
});
