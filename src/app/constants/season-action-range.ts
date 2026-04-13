/**
 * Janela fixa da temporada para GET `/game/actions` / `/game/stats` no painel
 * (alinhado à campanha padrão mar–abr/2026).
 */
export const SEASON_GAME_ACTION_RANGE: { start: Date; end: Date } = {
  start: new Date(2026, 2, 1, 0, 0, 0, 0),
  end: new Date(2026, 3, 30, 23, 59, 59, 999)
};
