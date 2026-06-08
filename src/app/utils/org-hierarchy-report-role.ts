import { ROLES_LIST } from './constants';
import { hasManagementDashboardCachedRole } from './management-dashboard-role';

function normalizeRoleToken(role: string): string {
  return role.trim().toUpperCase().replace(/-/g, '_');
}

function hasJwtRoleToken(roles: string[] | undefined | null, token: string): boolean {
  if (!roles?.length) {
    return false;
  }
  const normalized = token.trim().toUpperCase();
  return roles.some(
    r => r && typeof r === 'string' && normalizeRoleToken(r).includes(normalized)
  );
}

/** Papéis autorizados em `GET /game/reports/organization/hierarchy-report`. */
export function hasOrganizationHierarchyReportRole(roles: string[] | undefined | null): boolean {
  return (
    hasManagementDashboardCachedRole(roles) ||
    hasJwtRoleToken(roles, ROLES_LIST.ACCESS_ADMIN_PANEL) ||
    hasJwtRoleToken(roles, 'SERVICE')
  );
}
