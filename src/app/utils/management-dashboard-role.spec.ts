import {
  detectManagementDashboardCachedRole,
  getManagementDashboardCachedRoleLabel,
  getManagementPreviewRoleNounLabel,
  hasManagementDashboardCachedRole,
  buildManagementOverviewTeamId,
  isManagementOverviewTeamId,
  resolveManagementRoleFromOverviewTeamId,
  toManagementOverviewApiTeamId,
  parseManagementManagerUserId,
  extractOrgHierarchyNodeUserId
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

describe('getManagementPreviewRoleNounLabel', () => {
  it('returns noun labels for the admin manager selector', () => {
    expect(getManagementPreviewRoleNounLabel('GERENTE')).toBe('Gerente');
    expect(getManagementPreviewRoleNounLabel('DIRETOR')).toBe('Diretor');
    expect(getManagementPreviewRoleNounLabel('C_LEVEL')).toBe('C-Level');
    expect(getManagementPreviewRoleNounLabel(null)).toBe('Gestor');
  });
});

describe('management overview team ids', () => {
  it('builds role-specific selector ids for ADMIN preview', () => {
    expect(buildManagementOverviewTeamId('GERENTE')).toBe('__management_overview__:GERENTE');
    expect(buildManagementOverviewTeamId('C_LEVEL')).toBe('__management_overview__:C_LEVEL');
  });

  it('detects management overview entries in the team selector', () => {
    expect(isManagementOverviewTeamId('__management_overview__')).toBe(true);
    expect(isManagementOverviewTeamId('__management_overview__:DIRETOR')).toBe(true);
    expect(isManagementOverviewTeamId('FkmdnFU')).toBe(false);
  });

  it('resolves role from selector id or JWT', () => {
    expect(
      resolveManagementRoleFromOverviewTeamId('__management_overview__:GERENTE', ['ADMIN'])
    ).toBe('GERENTE');
    expect(resolveManagementRoleFromOverviewTeamId('__management_overview__', ['DIRETOR'])).toBe(
      'DIRETOR'
    );
    expect(resolveManagementRoleFromOverviewTeamId('team-1', ['GERENTE'])).toBeNull();
  });

  it('maps selector id to API team_id', () => {
    expect(toManagementOverviewApiTeamId('__management_overview__:GERENTE')).toBe(
      '__management_overview__'
    );
    expect(toManagementOverviewApiTeamId('26')).toBe('26');
  });
});

describe('parseManagementManagerUserId', () => {
  it('prefers user_id and falls back to user_email', () => {
    expect(parseManagementManagerUserId({ user_id: 'uuid-1', user_email: 'a@b.com' })).toBe('uuid-1');
    expect(parseManagementManagerUserId({ user_email: 'gerente@bwa.global' })).toBe('gerente@bwa.global');
  });
});

describe('extractOrgHierarchyNodeUserId', () => {
  it('extracts user id from pipe-separated node_id', () => {
    expect(extractOrgHierarchyNodeUserId('fiscal|18da2080-2b52-42b1-8980-f99e59548430')).toBe(
      '18da2080-2b52-42b1-8980-f99e59548430'
    );
    expect(extractOrgHierarchyNodeUserId('gerente@bwa.global')).toBe('gerente@bwa.global');
  });
});
