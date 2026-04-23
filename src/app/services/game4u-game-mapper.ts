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

export function mapGame4uStatsToPointWallet(stats: Game4uUserActionStatsResponse): PointWallet {
  const bloqueados = Math.floor(Number(stats.total_blocked_points) || 0);
  const desbloqueados = Math.floor(Number(stats.total_points) || 0);
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
  let finalizadas = 0;
  for (const row of stats.stats || []) {
    if (FINAL.includes(row.status)) {
      finalizadas += Math.floor(Number(row.count) || 0);
    }
  }
  const pontos = Math.floor(Number(stats.total_points) || 0);
  return {
    pendentes: 0,
    emExecucao: 0,
    finalizadas,
    pontos
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
): { cnpj: string; actionCount: number }[] {
  const byId = new Map<string, number>();
  for (const list of lists) {
    for (const d of list) {
      const id = String(d.id);
      byId.set(id, (byId.get(id) || 0) + 1);
    }
  }
  return [...byId.entries()].map(([cnpj, actionCount]) => ({ cnpj, actionCount }));
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
