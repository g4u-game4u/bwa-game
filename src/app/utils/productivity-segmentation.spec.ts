import { UserProfile } from './user-profile';
import {
  aggregateDailyFinishedStatsByDay,
  aggregateDailyFinishedStatsByEmail,
  formatGerenciaGroupLabel,
  resolveProductivitySegmentationMode
} from './productivity-segmentation';

describe('resolveProductivitySegmentationMode', () => {
  it('returns celula for LIDER_CELULA', () => {
    expect(
      resolveProductivitySegmentationMode({
        isManagementOverview: false,
        managementRole: null,
        userProfile: UserProfile.LIDER_CELULA,
        isLiderCelula: true,
        isSupervisor: false,
        sessionIsGerente: false
      })
    ).toBe('celula');
  });

  it('returns jogadores for SUPERVISOR', () => {
    expect(
      resolveProductivitySegmentationMode({
        isManagementOverview: true,
        managementRole: null,
        userProfile: UserProfile.SUPERVISOR,
        isLiderCelula: false,
        isSupervisor: true,
        sessionIsGerente: false
      })
    ).toBe('jogadores');
  });

  it('returns supervisoes for GERENTE on management overview', () => {
    expect(
      resolveProductivitySegmentationMode({
        isManagementOverview: true,
        managementRole: 'GERENTE',
        userProfile: UserProfile.JOGADOR,
        isLiderCelula: false,
        isSupervisor: false,
        sessionIsGerente: false
      })
    ).toBe('supervisoes');
  });

  it('returns gerencias for DIRETOR on management overview', () => {
    expect(
      resolveProductivitySegmentationMode({
        isManagementOverview: true,
        managementRole: 'DIRETOR',
        userProfile: UserProfile.JOGADOR,
        isLiderCelula: false,
        isSupervisor: false,
        sessionIsGerente: false
      })
    ).toBe('gerencias');
  });

  it('returns gerencias for C_LEVEL on management overview', () => {
    expect(
      resolveProductivitySegmentationMode({
        isManagementOverview: true,
        managementRole: 'C_LEVEL',
        userProfile: UserProfile.JOGADOR,
        isLiderCelula: false,
        isSupervisor: false,
        sessionIsGerente: false
      })
    ).toBe('gerencias');
  });
});

describe('aggregateDailyFinishedStatsByDay', () => {
  it('sums tasks and points per day', () => {
    const map = aggregateDailyFinishedStatsByDay([
      { day: '2026-05-01', email: 'a@b.com', tasksCount: 2, pointsSum: 10 },
      { day: '2026-05-01', email: 'b@b.com', tasksCount: 3, pointsSum: 5 }
    ]);
    expect(map.get('2026-05-01')).toEqual({ tasks: 5, points: 15 });
  });
});

describe('aggregateDailyFinishedStatsByEmail', () => {
  it('groups by email and day', () => {
    const map = aggregateDailyFinishedStatsByEmail([
      { day: '2026-05-02', email: 'a@b.com', tasksCount: 1, pointsSum: 4 }
    ]);
    expect(map.get('a@b.com')?.get('2026-05-02')).toEqual({ tasks: 1, points: 4 });
  });
});

describe('formatGerenciaGroupLabel', () => {
  it('formats email local part', () => {
    expect(formatGerenciaGroupLabel('joao.silva@bwa.global')).toBe('Joao Silva');
  });
});
