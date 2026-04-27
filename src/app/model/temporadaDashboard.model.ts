export interface TemporadaDashboard {
  pendingTasks: number,
  completedTasks: number,
  pendingDeliveries: number,
  incompleteDeliveries: number,
  completedDeliveries: number,
  /** Season: `delivery_stats.incomplete` + `delivery_stats.delivered` (resposta `/game/stats` do período fixo). */
  clientes: number,
  blocked_points: number,
  unblocked_points: number,
  total_points: number,
  total_blocked_points: number,
  total_actions: number,
}
