export type GameRulesUpdateAudience = 'player' | 'team' | 'collaborator';

export interface GameRulesUpdateAnnouncement {
  id: string;
  /** Primeiro mês (YYYY-MM) em que o aviso deve aparecer. */
  effectiveFrom: string;
  title: string;
  body: string;
  previousValueLabel: string;
  newValueLabel: string;
  effectiveMonthLabel: string;
}
