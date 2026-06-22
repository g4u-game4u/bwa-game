import {
  canAccessOrganizationHierarchyNav,
  hasOrganizationHierarchyReportRole
} from './org-hierarchy-report-role';

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

describe('canAccessOrganizationHierarchyNav', () => {
  it('returns true for ADMIN, C_LEVEL and DIRETOR', () => {
    expect(canAccessOrganizationHierarchyNav(['ADMIN'])).toBe(true);
    expect(canAccessOrganizationHierarchyNav(['C_LEVEL'])).toBe(true);
    expect(canAccessOrganizationHierarchyNav(['C-LEVEL'])).toBe(true);
    expect(canAccessOrganizationHierarchyNav(['DIRETOR'])).toBe(true);
  });

  it('returns false for GERENTE, SERVICE and other roles', () => {
    expect(canAccessOrganizationHierarchyNav(['GERENTE'])).toBe(false);
    expect(canAccessOrganizationHierarchyNav(['SERVICE'])).toBe(false);
    expect(canAccessOrganizationHierarchyNav(['SUPERVISOR'])).toBe(false);
    expect(canAccessOrganizationHierarchyNav(undefined)).toBe(false);
  });
});
