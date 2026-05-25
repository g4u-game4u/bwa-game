import {
  detectManagementDashboardCachedRole,
  getManagementDashboardCachedRoleLabel,
  hasManagementDashboardCachedRole
} from './management-dashboard-role';

describe('hasManagementDashboardCachedRole', () => {
  it('returns true for GERENTE, DIRETOR and C_LEVEL variants', () => {
    expect(hasManagementDashboardCachedRole(['GERENTE'])).toBe(true);
    expect(hasManagementDashboardCachedRole(['DIRETOR'])).toBe(true);
    expect(hasManagementDashboardCachedRole(['C_LEVEL'])).toBe(true);
    expect(hasManagementDashboardCachedRole(['C-LEVEL'])).toBe(true);
  });

  it('returns false for GESTOR, SUPERVISOR and PLAYER roles', () => {
    expect(hasManagementDashboardCachedRole(['GESTOR'])).toBe(false);
    expect(hasManagementDashboardCachedRole(['GESTAO'])).toBe(false);
    expect(hasManagementDashboardCachedRole(['PLAYER'])).toBe(false);
    expect(hasManagementDashboardCachedRole(undefined)).toBe(false);
  });
});

describe('detectManagementDashboardCachedRole', () => {
  it('returns the highest tier when multiple roles are present', () => {
    expect(detectManagementDashboardCachedRole(['GERENTE', 'DIRETOR'])).toBe('DIRETOR');
    expect(detectManagementDashboardCachedRole(['DIRETOR', 'C_LEVEL'])).toBe('C_LEVEL');
    expect(detectManagementDashboardCachedRole(['GERENTE', 'C-LEVEL'])).toBe('C_LEVEL');
  });

  it('returns null when no management tier role is present', () => {
    expect(detectManagementDashboardCachedRole(['GESTOR'])).toBeNull();
    expect(detectManagementDashboardCachedRole(undefined)).toBeNull();
  });
});

describe('getManagementDashboardCachedRoleLabel', () => {
  it('returns the localized dashboard title for each tier', () => {
    expect(getManagementDashboardCachedRoleLabel('GERENTE')).toBe('Painel do Gerente');
    expect(getManagementDashboardCachedRoleLabel('DIRETOR')).toBe('Painel do Diretor');
    expect(getManagementDashboardCachedRoleLabel('C_LEVEL')).toBe('Painel do C-Level');
  });
});
