export interface TemporadaDashboard {
  pendingTasks: number,
  /** Opcional — contagem DOING em action_stats (ex.: /game/stats). */
  doingTasks?: number,
  completedTasks: number,
  pendingDeliveries: number,
  incompleteDeliveries: number,
  completedDeliveries: number,
  blocked_points: number,
  unblocked_points: number,
  total_points: number,
  total_blocked_points: number,
  total_actions: number,
  /** Opcional — usado em layouts CS (nível da temporada). */
  nivel?: { nivelAtual: number; nivelMax: number };
}
