import {
  META_PROTOCOLO_TARGET,
  APOSENTADORIAS_TARGET,
  TEAM_KPI_VISIBILITY,
  DEFAULT_VISIBLE_KPIS,
  isKpiVisibleForTeam,
} from './kpi-targets.constants';

describe('kpi-targets.constants', () => {
  describe('constant values', () => {
    it('should define META_PROTOCOLO_TARGET as 1_000_000', () => {
      expect(META_PROTOCOLO_TARGET).toBe(1_000_000);
    });

    it('should define APOSENTADORIAS_TARGET as 220', () => {
      expect(APOSENTADORIAS_TARGET).toBe(220);
    });

    it('should define DEFAULT_VISIBLE_KPIS with the three default KPIs', () => {
      expect(DEFAULT_VISIBLE_KPIS).toEqual([
        'entregas-prazo',
        'meta-protocolo',
        'aposentadorias-concedidas',
      ]);
    });

    it('should define TEAM_KPI_VISIBILITY as an empty object initially', () => {
      expect(TEAM_KPI_VISIBILITY).toEqual({});
    });
  });

  describe('isKpiVisibleForTeam', () => {
    describe('when no team-specific config exists', () => {
      it('should return true for each default KPI', () => {
        expect(isKpiVisibleForTeam('entregas-prazo')).toBe(true);
        expect(isKpiVisibleForTeam('meta-protocolo')).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas')).toBe(true);
      });

      it('should return true for valor-concedido (finance filtering is handled by dashboards)', () => {
        expect(isKpiVisibleForTeam('valor-concedido')).toBe(true);
      });

      it('should return false for an unknown KPI id', () => {
        expect(isKpiVisibleForTeam('unknown-kpi')).toBe(false);
      });

      it('should return false for numero-empresas (removed KPI)', () => {
        expect(isKpiVisibleForTeam('numero-empresas')).toBe(false);
      });
    });

    describe('when teamId is provided but has no config entry', () => {
      it('should fall back to defaults for an unconfigured team', () => {
        expect(isKpiVisibleForTeam('meta-protocolo', '99')).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas', '99')).toBe(true);
        expect(isKpiVisibleForTeam('entregas-prazo', '99')).toBe(true);
        expect(isKpiVisibleForTeam('valor-concedido', '99')).toBe(true);
      });
    });

    describe('when teamId is null or undefined', () => {
      it('should handle null teamId gracefully and use defaults', () => {
        expect(isKpiVisibleForTeam('meta-protocolo', null)).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas', null)).toBe(true);
        expect(isKpiVisibleForTeam('unknown-kpi', null)).toBe(false);
      });

      it('should handle undefined teamId gracefully and use defaults', () => {
        expect(isKpiVisibleForTeam('meta-protocolo', undefined)).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas', undefined)).toBe(true);
        expect(isKpiVisibleForTeam('unknown-kpi', undefined)).toBe(false);
      });
    });

    describe('when team-specific config is present', () => {
      const originalVisibility = { ...TEAM_KPI_VISIBILITY };

      afterEach(() => {
        // Restore original state
        Object.keys(TEAM_KPI_VISIBILITY).forEach(k => delete TEAM_KPI_VISIBILITY[k]);
        Object.assign(TEAM_KPI_VISIBILITY, originalVisibility);
      });

      it('should respect team-specific config and only allow listed KPIs', () => {
        TEAM_KPI_VISIBILITY['6'] = ['valor-concedido', 'meta-protocolo'];

        expect(isKpiVisibleForTeam('valor-concedido', '6')).toBe(true);
        expect(isKpiVisibleForTeam('meta-protocolo', '6')).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas', '6')).toBe(false);
        expect(isKpiVisibleForTeam('entregas-prazo', '6')).toBe(false);
      });

      it('should still use defaults for teams without config', () => {
        TEAM_KPI_VISIBILITY['6'] = ['valor-concedido'];

        // Team '7' has no config — should use defaults
        expect(isKpiVisibleForTeam('meta-protocolo', '7')).toBe(true);
        expect(isKpiVisibleForTeam('aposentadorias-concedidas', '7')).toBe(true);
      });

      it('should handle an empty visibility list for a team (no KPIs visible)', () => {
        TEAM_KPI_VISIBILITY['10'] = [];

        expect(isKpiVisibleForTeam('meta-protocolo', '10')).toBe(false);
        expect(isKpiVisibleForTeam('valor-concedido', '10')).toBe(false);
        expect(isKpiVisibleForTeam('entregas-prazo', '10')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty string teamId as falsy and use defaults', () => {
        expect(isKpiVisibleForTeam('meta-protocolo', '')).toBe(true);
      });

      it('should handle empty string kpiId', () => {
        expect(isKpiVisibleForTeam('')).toBe(false);
      });
    });
  });
});
