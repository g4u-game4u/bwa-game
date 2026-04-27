import {
  ActivityListItem,
  ActivityMetrics,
  PointWallet,
  ProcessListItem,
  ProcessMetrics,
  TeamProgressMetrics,
  TeamSeasonPoints
} from '@model/gamification-dashboard.model';
import {
  Game4uDeliveryModel,
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus
} from '@model/game4u-api.model';
import { CompanyDisplay } from './company-kpi.service';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';

const FINAL: Game4uUserActionStatus[] = ['DONE', 'DELIVERED', 'PAID'];
const OPEN: Game4uUserActionStatus[] = ['PENDING', 'DOING'];

function readDeliveryTitle(d: Game4uDeliveryModel): string | undefined {
  const dt = d.delivery_title != null ? String(d.delivery_title).trim() : '';
  if (dt) return dt;
  const t = d.title != null ? String(d.title).trim() : '';
  return t || undefined;
}

/** Bucket `DONE` / `done` em `action_stats` (resposta `/game/stats`). */
export function getGame4uActionStatsDone(stats: Game4uUserActionStatsResponse): {
  count: number;
  totalPoints: number;
} {
  const a = stats.action_stats;
  const bucket = a?.DONE ?? a?.done;
  return {
    count: Math.floor(Number(bucket?.count) || 0),
    totalPoints: Math.floor(Number(bucket?.total_points) || 0)
  };
}

/** `delivery_stats.total` na resposta `/game/stats`; `null` se ausente. */
export function readGame4uDeliveryStatsTotal(stats: Game4uUserActionStatsResponse): number | null {
  const ds = stats.delivery_stats;
  if (ds == null || typeof ds !== 'object') {
    return null;
  }
  const o = ds as Record<string, unknown>;
  const v = o['total'] ?? o['TOTAL'];
  if (v === undefined || v === null) {
    return null;
  }
  const n = Math.floor(Number(v) || 0);
  return Number.isFinite(n) ? n : null;
}

/** Pontos do bucket `PENDING` / `pending` em `action_stats` (`/game/stats`). */
export function getGame4uActionStatsPendingTotalPoints(stats: Game4uUserActionStatsResponse): number {
  const a = stats.action_stats;
  if (!a) {
    return 0;
  }
  const bucket = a.PENDING ?? a.pending;
  return Math.floor(Number(bucket?.total_points) || 0);
}

/**
 * Circular “pontos no mês” a partir de `action_stats`: atingido = done.total_points;
 * meta = pending.total_points + done.total_points.
 */
export function getGame4uMonthlyPointsCircularFromActionStats(
  stats: Game4uUserActionStatsResponse
): { pontosDone: number; pontosTodosStatus: number; finalizadas: number } | null {
  if (stats.action_stats == null) {
    return null;
  }
  const done = getGame4uActionStatsDone(stats);
  const pendingPts = getGame4uActionStatsPendingTotalPoints(stats);
  return {
    pontosDone: done.totalPoints,
    pontosTodosStatus: pendingPts + done.totalPoints,
    finalizadas: done.count
  };
}

function sumActionStatBucketPoints(actionStats: Record<string, unknown>): number {
  let s = 0;
  for (const [key, v] of Object.entries(actionStats)) {
    if (key === 'total_points' || key === 'total_blocked_points') continue;
    if (v && typeof v === 'object' && v !== null && 'total_points' in v) {
      s += Number((v as { total_points?: number }).total_points) || 0;
    }
  }
  return Math.floor(s);
}

/** Soma pontos de user-actions em todos os status: buckets em `action_stats`, filas `stats`, ou totais na raiz. */
export function getGame4uStatsTotalPointsAllStatuses(stats: Game4uUserActionStatsResponse): number {
  const a = stats.action_stats;
  if (a) {
    const fromBuckets = sumActionStatBucketPoints(a as Record<string, unknown>);
    if (fromBuckets > 0) {
      return fromBuckets;
    }
    const tp = Number(a.total_points) || 0;
    const tbp = Number(a.total_blocked_points) || 0;
    if (tp || tbp) {
      return Math.floor(tp + tbp);
    }
  }
  const rows = stats.stats || [];
  const sumRows = rows.reduce((acc, r) => acc + (Number(r.total_points) || 0), 0);
  if (rows.length > 0) {
    return Math.floor(sumRows);
  }
  return Math.floor(
    (Number(stats.total_points) || 0) + (Number(stats.total_blocked_points) || 0)
  );
}

function aggregateBlockedPoints(stats: Game4uUserActionStatsResponse): number {
  const fromNested = stats.action_stats?.total_blocked_points;
  if (fromNested !== undefined && fromNested !== null) {
    return Math.floor(Number(fromNested) || 0);
  }
  return Math.floor(Number(stats.total_blocked_points) || 0);
}

/**
 * Carteira de pontos: desbloqueados = `action_stats.done|DONE.total_points` (com fallback ao total da raiz).
 * Bloqueados = `action_stats.total_blocked_points` ou raiz.
 */
export function mapGame4uStatsToPointWallet(stats: Game4uUserActionStatsResponse): PointWallet {
  const done = getGame4uActionStatsDone(stats);
  const bloqueados = aggregateBlockedPoints(stats);
  const desbloqueados =
    stats.action_stats != null
      ? done.totalPoints
      : Math.floor(Number(stats.total_points) || 0);
  return {
    bloqueados,
    desbloqueados,
    moedas: 0
  };
}

export function mapGame4uStatsToTeamSeasonPoints(stats: Game4uUserActionStatsResponse): TeamSeasonPoints {
  const w = mapGame4uStatsToPointWallet(stats);
  return {
    total: w.bloqueados + w.desbloqueados,
    bloqueados: w.bloqueados,
    desbloqueados: w.desbloqueados
  };
}

export function mapGame4uStatsToActivityMetrics(stats: Game4uUserActionStatsResponse): ActivityMetrics {
  const done = getGame4uActionStatsDone(stats);
  const pontosTodosStatus = getGame4uStatsTotalPointsAllStatuses(stats);
  if (stats.action_stats != null) {
    return {
      pendentes: 0,
      emExecucao: 0,
      finalizadas: done.count,
      pontos: done.totalPoints,
      pontosDone: done.totalPoints,
      pontosTodosStatus
    };
  }
  let finalizadas = 0;
  let pontosDone = 0;
  for (const row of stats.stats || []) {
    if (FINAL.includes(row.status)) {
      finalizadas += Math.floor(Number(row.count) || 0);
    }
    if (row.status === 'DONE') {
      pontosDone += Math.floor(Number(row.total_points) || 0);
    }
  }
  const pontos = Math.floor(Number(stats.total_points) || 0);
  return {
    pendentes: 0,
    emExecucao: 0,
    finalizadas,
    pontos,
    pontosDone: pontosDone || done.totalPoints,
    pontosTodosStatus: pontosTodosStatus > 0 ? pontosTodosStatus : pontos + Math.floor(Number(stats.total_blocked_points) || 0)
  };
}

export function mapGame4uStatsToTeamProgressMetrics(stats: Game4uUserActionStatsResponse): TeamProgressMetrics {
  let atividades = 0;
  let procFin = 0;
  let procInc = 0;
  for (const row of stats.stats || []) {
    const c = Math.floor(Number(row.count) || 0);
    if (FINAL.includes(row.status)) {
      atividades += c;
    }
    if (row.status === 'DELIVERED' || row.status === 'PAID') {
      procFin += c;
    }
    if (row.status === 'PENDING' || row.status === 'DOING') {
      procInc += c;
    }
  }
  return {
    atividadesFinalizadas: atividades,
    processosFinalizados: procFin,
    processosIncompletos: procInc
  };
}

function asString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return String(v);
}

/** User-action finalizada (participação / “tarefas concluídas” ao nível de linha). */
export function isGame4uUserActionFinalizedStatus(status: unknown): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  return FINAL.includes(s as Game4uUserActionStatus);
}

/**
 * Chave para “cliente atendido” a partir da user-action: `integration_id` (EmpID/CNPJ no CRM),
 * senão `client_id`, senão `delivery_id` (evita lista vazia quando a API não envia `integration_id`).
 */
export function getGame4uParticipationRowKey(a: Game4uUserActionModel): string {
  const integ = asString(a.integration_id).trim();
  if (integ) {
    return integ;
  }
  const cid = asString(a.client_id).trim();
  if (cid) {
    return cid;
  }
  return asString(a.delivery_id).trim();
}

export function filterGame4uActionsByMonth(
  actions: Game4uUserActionModel[],
  month?: Date
): Game4uUserActionModel[] {
  if (!month) {
    return actions;
  }
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return actions.filter(a => {
    const t = Date.parse(String(a.created_at));
    return !Number.isNaN(t) && t >= start && t <= end;
  });
}

/**
 * `delivery_id` no formato `{empresa}-{YYYY-MM-DD}` (ex.: `1079-2025-12-31`): data final é a competência.
 * Retorna ano e mês (0–11) da competência, ou null se o sufixo não for parseável.
 */
export function parseCompetenceYearMonthFromDeliveryId(deliveryId: unknown): { y: number; m: number } | null {
  const s = asString(deliveryId).trim();
  const match = s.match(/^.*-(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y, m: mo - 1 };
}

/**
 * Filtra user-actions cuja competência (em `delivery_id`) cai no mês do dashboard.
 * Sem sufixo `...-YYYY-MM-DD`, mantém o mesmo critério de `filterGame4uActionsByMonth` (`created_at`).
 */
export function filterGame4uActionsByCompetenceMonth(
  actions: Game4uUserActionModel[],
  month?: Date
): Game4uUserActionModel[] {
  if (!month) {
    return actions;
  }
  const ty = month.getFullYear();
  const tm = month.getMonth();
  return actions.filter(a => {
    const ym = parseCompetenceYearMonthFromDeliveryId(a.delivery_id);
    if (ym) {
      return ym.y === ty && ym.m === tm;
    }
    const start = new Date(ty, tm, 1, 0, 0, 0, 0).getTime();
    const end = new Date(ty, tm + 1, 0, 23, 59, 59, 999).getTime();
    const t = Date.parse(String(a.created_at));
    return !Number.isNaN(t) && t >= start && t <= end;
  });
}

/** Pontos do circular do mês a partir de user-actions já filtradas (ex.: por competência). Alinhado a `getGame4uActionStatsDone`: só DONE conta como atingido. */
export function computeMonthlyPointsFromGame4uActions(actions: Game4uUserActionModel[]): {
  finalizadas: number;
  pontos: number;
  pontosDone: number;
  pontosTodosStatus: number;
} {
  let pontosDone = 0;
  let pontosTodosStatus = 0;
  let finalizadas = 0;
  for (const a of actions) {
    const pts = Math.floor(Number(a.points) || 0);
    pontosTodosStatus += pts;
    const st = String(a.status ?? '').toUpperCase();
    if (st === 'DONE') {
      pontosDone += pts;
      finalizadas += 1;
    }
  }
  return {
    finalizadas,
    pontos: pontosDone,
    pontosDone,
    pontosTodosStatus
  };
}

export function mapGame4uActionsToProcessMetrics(actions: Game4uUserActionModel[]): ProcessMetrics {
  const byDelivery = new Map<string, Set<Game4uUserActionStatus>>();

  for (const a of actions) {
    const d = asString(a.delivery_id).trim();
    if (!d) continue;
    if (!byDelivery.has(d)) byDelivery.set(d, new Set());
    byDelivery.get(d)!.add(a.status);
  }

  let finalizadas = 0;
  let pendentes = 0;
  let incompletas = 0;

  byDelivery.forEach(statuses => {
    const hasFinal = [...statuses].some(s => s === 'DELIVERED' || s === 'PAID');
    const hasOpen = [...statuses].some(s => OPEN.includes(s));
    if (hasFinal) {
      finalizadas++;
    } else if (hasOpen) {
      pendentes++;
    } else {
      incompletas++;
    }
  });

  return { pendentes, incompletas, finalizadas };
}

export function mapGame4uActionsToActivityList(
  actions: Game4uUserActionModel[],
  month?: Date
): ActivityListItem[] {
  return filterGame4uActionsByMonth(actions, month).map(a => ({
    id: a.id,
    title: (a.action_title as string) || 'Ação',
    delivery_title: (a.delivery_title as string) || undefined,
    points: Math.floor(Number(a.points) || PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG),
    created: Date.parse(String(a.created_at)) || 0,
    player: asString(a.user_email),
    cnpj: asString(a.integration_id) || undefined
  }));
}

export function mapGame4uActionsToProcessList(actions: Game4uUserActionModel[], month?: Date): ProcessListItem[] {
  const scoped = filterGame4uActionsByMonth(actions, month);

  const byDel = new Map<string, { title: string; count: number; cnpj?: string; finalized: boolean }>();

  for (const a of scoped) {
    const id = asString(a.delivery_id).trim();
    if (!id) continue;
    const title = (a.delivery_title as string) || (a.action_title as string) || 'Processo';
    const row = byDel.get(id) || { title, count: 0, cnpj: asString(a.integration_id) || undefined, finalized: false };
    row.count++;
    row.finalized = row.finalized || a.status === 'DELIVERED' || a.status === 'PAID';
    byDel.set(id, row);
  }

  return [...byDel.entries()].map(([deliveryId, v]) => ({
    deliveryId,
    title: v.title,
    actionCount: v.count,
    isFinalized: v.finalized,
    cnpj: v.cnpj
  }));
}

/** Lista estilo participação/carteira: usa id da entrega como chave de linha. */
export function mapGame4uDeliveriesToCompanyRows(
  deliveries: Game4uDeliveryModel[]
): { cnpj: string; actionCount: number; processCount: number }[] {
  return deliveries.map(d => ({
    cnpj: String(d.id),
    actionCount: 1,
    processCount: d.status === 'DELIVERED' ? 1 : 0
  }));
}

export function mapGame4uDeliveriesToCompanyDisplay(deliveries: Game4uDeliveryModel[]): CompanyDisplay[] {
  return deliveries.map(d => ({
    cnpj: String(d.id),
    actionCount: 1,
    processCount: d.status === 'DELIVERED' ? 1 : 0,
    entrega: undefined,
    deliveryKpi: undefined
  }));
}

/** Une listas por status (mesmo delivery pode aparecer em mais de uma consulta). */
export function mergeGame4uDeliveryParticipation(
  ...lists: Game4uDeliveryModel[][]
): { cnpj: string; actionCount: number; delivery_title?: string }[] {
  const byId = new Map<string, { actionCount: number; delivery_title?: string }>();
  for (const list of lists) {
    for (const d of list) {
      const id = String(d.id);
      const cur = byId.get(id) || { actionCount: 0 };
      cur.actionCount += 1;
      const label = readDeliveryTitle(d);
      if (label) {
        cur.delivery_title = label;
      }
      byId.set(id, cur);
    }
  }
  return [...byId.entries()].map(([cnpj, v]) => {
    const row: { cnpj: string; actionCount: number; delivery_title?: string } = {
      cnpj,
      actionCount: v.actionCount
    };
    if (v.delivery_title) {
      row.delivery_title = v.delivery_title;
    }
    return row;
  });
}

export function mergeGame4uTeamDeliveryRows(
  ...lists: Game4uDeliveryModel[][]
): { cnpj: string; actionCount: number; processCount: number }[] {
  const byId = new Map<string, { actionCount: number; processCount: number }>();
  for (const list of lists) {
    for (const d of list) {
      const id = String(d.id);
      const cur = byId.get(id) || { actionCount: 0, processCount: 0 };
      cur.actionCount += 1;
      if (d.status === 'DELIVERED') {
        cur.processCount = Math.max(cur.processCount, 1);
      }
      byId.set(id, cur);
    }
  }
  return [...byId.entries()].map(([cnpj, v]) => ({
    cnpj,
    actionCount: v.actionCount,
    processCount: v.processCount
  }));
}
