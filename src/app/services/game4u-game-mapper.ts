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
  Game4uReportsFinishedDeliveryRow,
  Game4uReportsFinishedSummary,
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

/**
 * `deliveries_count` em `GET /game/reports/finished/summary` (variantes no JSON da API).
 */
export function readDeliveriesCountFromFinishedSummary(
  summary: Game4uReportsFinishedSummary | Record<string, unknown>
): number {
  const o = summary as Record<string, unknown>;
  const candidates = [
    o['deliveries_count'],
    o['delivery_count'],
    o['deliveriesCount'],
    o['deliveryCount']
  ];
  for (const v of candidates) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n)) {
      return Math.floor(n);
    }
  }
  return 0;
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

/** Normaliza `risco_multa` de `/game/reports/user-actions` para booleano de UI. */
export function parseGame4uRiscoMulta(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'sim' || s === 'yes';
  }
  return false;
}

/** `extra.status_api` da assessoria em user-actions (relatórios Game4U). */
export function readGame4uExtraStatusApi(a: Game4uUserActionModel): string | null {
  const raw = a as Record<string, unknown>;
  const ex = readGame4uExtraRecord(a);
  const candidates: unknown[] = [
    ex?.['status_api'],
    ex?.['statusApi'],
    raw['status_api'],
    raw['statusApi']
  ];
  for (const v of candidates) {
    if (v == null || v === '') {
      continue;
    }
    const s = String(v).trim();
    if (s) {
      return s;
    }
  }
  return null;
}

/** Entrega justificada quando o status da assessoria contém «justif» (ex.: «Pend. justificada»). */
export function parseGame4uAtrasoJustificado(statusApi: unknown): boolean {
  if (statusApi == null || statusApi === '') {
    return false;
  }
  return String(statusApi).toLowerCase().includes('justif');
}

export function isGame4uUserActionJustified(a: Game4uUserActionModel): boolean {
  return parseGame4uAtrasoJustificado(readGame4uExtraStatusApi(a));
}

/** Chave de correlação entre linhas de `finished/deliveries/cached` e user-actions. */
export function executiveDeliveryDistinctKey(parts: {
  emp_id?: string | number | null;
  delivery_id?: string | null;
  delivery_title?: string | null;
}): string {
  return String(parts.emp_id ?? parts.delivery_id ?? parts.delivery_title ?? '').trim();
}

/** `status_api` em linhas de `finished/deliveries/cached` (quando presente). */
export function readGame4uDeliveryRowStatusApi(row: Game4uReportsFinishedDeliveryRow): string | null {
  const raw = row as unknown as Record<string, unknown>;
  const extra = row.extra ?? (
    raw['extra'] != null && typeof raw['extra'] === 'object'
      ? (raw['extra'] as Record<string, unknown>)
      : null
  );
  const candidates: unknown[] = [
    extra?.['status_api'],
    extra?.['statusApi'],
    raw['status_api'],
    raw['statusApi']
  ];
  for (const v of candidates) {
    if (v == null || v === '') {
      continue;
    }
    const s = String(v).trim();
    if (s) {
      return s;
    }
  }
  return null;
}

/** Índice de entregas justificadas (`extra.status_api` com «justif») para cruzar user-actions × deliveries. */
export interface ExecutiveJustifiedDeliveryLookup {
  keys: Set<string>;
  deliveryIds: Set<string>;
}

function addExecutiveJustifiedLookupKey(keys: Set<string>, raw: unknown): void {
  const key = String(raw ?? '').trim();
  if (key) {
    keys.add(key);
  }
}

/** Monta índice a partir de user-actions finalizadas com `extra.status_api` contendo «justif». */
export function buildExecutiveJustifiedDeliveryLookup(
  actions: Game4uUserActionModel[]
): ExecutiveJustifiedDeliveryLookup {
  const keys = new Set<string>();
  const deliveryIds = new Set<string>();

  for (const a of actions || []) {
    if (!isGame4uUserActionFinalizedStatus(a.status) || !isGame4uUserActionJustified(a)) {
      continue;
    }

    const did = String(a.delivery_id ?? '').trim();
    if (did) {
      deliveryIds.add(did);
      addExecutiveJustifiedLookupKey(keys, did);
      const empPrefix = did.split('-')[0]?.trim();
      if (empPrefix) {
        addExecutiveJustifiedLookupKey(keys, empPrefix);
      }
    }

    addExecutiveJustifiedLookupKey(keys, a.integration_id);
    addExecutiveJustifiedLookupKey(keys, a.client_id);
    addExecutiveJustifiedLookupKey(keys, readGame4uExtraCnpj(a));
    addExecutiveJustifiedLookupKey(keys, readGame4uUserActionTitle(a));
    addExecutiveJustifiedLookupKey(keys, readGame4uProcessTitleFromUserAction(a));
    const empId =
      typeof a.integration_id === 'string' || typeof a.integration_id === 'number'
        ? a.integration_id
        : typeof a.client_id === 'string' || typeof a.client_id === 'number'
          ? a.client_id
          : undefined;
    addExecutiveJustifiedLookupKey(
      keys,
      executiveDeliveryDistinctKey({
        emp_id: empId,
        delivery_id: did,
        delivery_title: readGame4uUserActionTitle(a)
      })
    );
  }

  return { keys, deliveryIds };
}

/** Conta tarefas finalizadas excluindo as justificadas via `extra.status_api`. */
export function countExecutiveFinishedTasksFromUserActions(
  actions: Game4uUserActionModel[]
): { total: number; justified: number; judged: number } {
  let total = 0;
  let justified = 0;
  for (const a of actions || []) {
    if (!isGame4uUserActionFinalizedStatus(a.status)) {
      continue;
    }
    total += 1;
    if (isGame4uUserActionJustified(a)) {
      justified += 1;
    }
  }
  return { total, justified, judged: total - justified };
}

export function isGame4uDeliveryRowJustified(
  row: Game4uReportsFinishedDeliveryRow,
  lookup?: ExecutiveJustifiedDeliveryLookup
): boolean {
  if (parseGame4uAtrasoJustificado(readGame4uDeliveryRowStatusApi(row))) {
    return true;
  }
  if (!lookup) {
    return false;
  }

  const did = (row.delivery_id ?? '').trim();
  if (did && lookup.deliveryIds.has(did)) {
    return true;
  }

  const distinctKey = executiveDeliveryDistinctKey(row);
  if (distinctKey && lookup.keys.has(distinctKey)) {
    return true;
  }

  if (row.emp_id != null) {
    const emp = String(row.emp_id).trim();
    if (emp && lookup.keys.has(emp)) {
      return true;
    }
  }

  const title = (row.delivery_title ?? '').trim();
  if (title && lookup.keys.has(title)) {
    return true;
  }

  return false;
}

/** @deprecated Preferir {@link buildExecutiveJustifiedDeliveryLookup}. */
export function buildJustifiedDeliveryKeysFromUserActions(
  actions: Game4uUserActionModel[]
): Set<string> {
  return buildExecutiveJustifiedDeliveryLookup(actions).keys;
}

export type Game4uFinishedPrazoStatus = 'on_time' | 'late' | 'unknown';

/** Converte `dt_prazo` (`YYYY-MM-DD`) para início do dia no calendário local. */
export function parseGame4uDtPrazoToLocalDayStartMs(dt?: string): number | null {
  if (!dt?.trim()) {
    return null;
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt.trim());
  if (!ymd) {
    return null;
  }
  const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Compara a data de finalização com o prazo da entrega/tarefa.
 * Finalização no mesmo dia do prazo ou antes = `on_time`; depois = `late`.
 */
export function resolveGame4uFinishedPrazoStatus(
  dtPrazo?: string,
  finishedAtMs?: number
): Game4uFinishedPrazoStatus {
  const prazoMs = parseGame4uDtPrazoToLocalDayStartMs(dtPrazo);
  if (prazoMs == null || finishedAtMs == null || !Number.isFinite(finishedAtMs) || finishedAtMs <= 0) {
    return 'unknown';
  }
  const finished = new Date(finishedAtMs);
  const finishedDayMs = new Date(
    finished.getFullYear(),
    finished.getMonth(),
    finished.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  return finishedDayMs <= prazoMs ? 'on_time' : 'late';
}

/** User-action finalizada (participação / “tarefas concluídas” ao nível de linha). */
export function isGame4uUserActionFinalizedStatus(status: unknown): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  return FINAL.includes(s as Game4uUserActionStatus);
}

/** Soma `points` das user-actions cujo `status` está em `statuses` (comparação case-insensitive). */
export function sumGame4uActionPointsByStatus(
  actions: Game4uUserActionModel[],
  statuses: Game4uUserActionStatus[]
): number {
  const set = new Set(statuses.map(s => String(s).trim().toUpperCase()));
  let sum = 0;
  for (const a of actions) {
    const st = String(a.status ?? '').trim().toUpperCase();
    if (set.has(st)) {
      sum += Math.floor(Number(a.points) || 0);
    }
  }
  return Math.floor(sum);
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

/** Apenas dígitos — para agrupar linhas pelo mesmo CPF/CNPJ em `extra.cnpj`. */
export function normalizeGame4uCpfCnpjDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Agrupa linhas «clientes atendidos no mês» sem duplicar a mesma entrega/cliente:
 * 1) `delivery_id` (uma linha por entrega); 2) senão CPF/CNPJ em `extra.cnpj`; 3) senão chave de participação.
 */
export function getGame4uAtendidosGroupKey(a: Game4uUserActionModel): string | null {
  const did =
    a.delivery_id != null && String(a.delivery_id).trim() !== '' ? String(a.delivery_id).trim() : '';
  if (did) {
    return `d:${did}`;
  }
  const ec = readGame4uExtraCnpj(a);
  if (ec) {
    const digits = normalizeGame4uCpfCnpjDigits(ec);
    if (digits.length >= 11) {
      return `c:${digits}`;
    }
    if (ec.trim()) {
      return `c:${ec.trim()}`;
    }
  }
  const pk = getGame4uParticipationRowKey(a);
  return pk ? `p:${pk}` : null;
}

/**
 * Chave estável para CRM/enriquecimento (`enrichCnpjListFull`): mantém o primeiro
 * `integration_id` / `client_id` / CNPJ em extra / `delivery_id` encontrado no grupo.
 */
export function pickGame4uAtendidosRepresentativeKey(
  previous: string | undefined,
  a: Game4uUserActionModel
): string {
  const prev = (previous || '').trim();
  if (prev) {
    return prev;
  }
  const integ = asString(a.integration_id).trim();
  if (integ) {
    return integ;
  }
  const cid = asString(a.client_id).trim();
  if (cid) {
    return cid;
  }
  const ec = readGame4uExtraCnpj(a);
  if (ec) {
    const d = normalizeGame4uCpfCnpjDigits(ec);
    return d || ec.trim();
  }
  const dlv = a.delivery_id != null ? String(a.delivery_id).trim() : '';
  if (dlv) {
    return dlv;
  }
  return '';
}

/**
 * Competência «concluído no mês» para lista de clientes: `finished_at`, senão `updated_at`, senão `created_at`.
 * Evita excluir ações que a API marca como finalizadas mas sem `finished_at`.
 */
export function getGame4uUserActionFinishedOrFallbackMs(a: Game4uUserActionModel): number | null {
  const f = parseExtraDrPrazoToUtcMs((a as Record<string, unknown>)['finished_at']);
  if (f != null) {
    return f;
  }
  const u = parseExtraDrPrazoToUtcMs(a.updated_at);
  if (u != null) {
    return u;
  }
  return parseExtraDrPrazoToUtcMs(a.created_at);
}

/**
 * User-action pertence à mesma linha «clientes atendidos» aberta no modal de detalhe
 * (critérios alinhados ao agrupamento da lista + chave representativa).
 */
export function game4uActionMatchesParticipacaoModalRow(
  a: Game4uUserActionModel,
  row: { cnpj: string; deliveryId?: string; delivery_extra_cnpj?: string }
): boolean {
  const did = row.deliveryId?.trim();
  if (did && String(a.delivery_id ?? '').trim() === did) {
    return true;
  }
  const rowEc = row.delivery_extra_cnpj?.trim();
  const aEc = readGame4uExtraCnpj(a);
  if (rowEc && aEc && normalizeGame4uCpfCnpjDigits(rowEc) === normalizeGame4uCpfCnpjDigits(aEc)) {
    return true;
  }
  const rep = row.cnpj?.trim();
  if (!rep) {
    return false;
  }
  if (getGame4uParticipationRowKey(a) === rep) {
    return true;
  }
  if (pickGame4uAtendidosRepresentativeKey('', a) === rep) {
    return true;
  }
  if (rep.length >= 11 && aEc && normalizeGame4uCpfCnpjDigits(rep) === normalizeGame4uCpfCnpjDigits(aEc)) {
    return true;
  }
  return false;
}

/**
 * CNPJ em `extra.cnpj` em documentos Game4U (user-action ou delivery).
 */
export function readGame4uExtraCnpjFromRecord(rec: Record<string, unknown>): string | null {
  const ex = rec['extra'];
  if (!ex || typeof ex !== 'object') {
    return null;
  }
  const v = (ex as Record<string, unknown>)['cnpj'];
  if (v == null || v === '') {
    return null;
  }
  const s = String(v).trim();
  return s || null;
}

/**
 * CNPJ em `extra.cnpj` na user-action (entrega), útil para distinguir linhas quando `delivery_title` se repete.
 */
export function readGame4uExtraCnpj(a: Game4uUserActionModel): string | null {
  return readGame4uExtraCnpjFromRecord(a as Record<string, unknown>);
}

function parseGame4uIsoMs(v: unknown): number | null {
  if (v == null || v === '') {
    return null;
  }
  if (typeof v === 'object' && v !== null && '$date' in (v as object)) {
    return parseGame4uIsoMs((v as { $date: unknown }).$date);
  }
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/**
 * Data exibida na lista/gráfico de atividades (modal): conclusão (`finished_at`), senão criação (`created_at`).
 */
function game4uUserActionListTimestampMs(a: Game4uUserActionModel): number {
  return parseGame4uIsoMs(a.finished_at) ?? parseGame4uIsoMs(a.created_at) ?? 0;
}

/** Mantém ações cujo instantâneo de lista (finished_at ou created_at) cai no mês calendário. */
function filterGame4uActionsByListTimestampMonth(
  actions: Game4uUserActionModel[],
  month?: Date
): Game4uUserActionModel[] {
  if (!month) {
    return actions;
  }
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return actions.filter(a => {
    const t = game4uUserActionListTimestampMs(a);
    return t > 0 && t >= start && t <= end;
  });
}

/**
 * Modal «tarefas pendentes»: alinhado a `GET /game/reports/user-actions?dt_prazo_*`.
 * Filtra pelo **mês de calendário do prazo** (`dt_prazo` na raiz ou `extra.dt_prazo` / `extra.dr_prazo`),
 * não por `created_at` (senão linhas com prazo no mês mas criação antiga sumiam).
 * Sem prazo parseável: mantém a linha (resposta já veio filtrada pelo backend).
 */
function filterGame4uActionsByDtPrazoCalendarMonth(
  actions: Game4uUserActionModel[],
  month: Date
): Game4uUserActionModel[] {
  const ty = month.getFullYear();
  const tm = month.getMonth();
  return actions.filter(a => {
    const top = typeof a.dt_prazo === 'string' ? a.dt_prazo.trim() : '';
    if (top) {
      const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(top);
      if (ymd) {
        const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
        if (!Number.isNaN(d.getTime())) {
          return d.getFullYear() === ty && d.getMonth() === tm;
        }
      }
      const t = Date.parse(top);
      if (!Number.isNaN(t)) {
        const d = new Date(t);
        return d.getFullYear() === ty && d.getMonth() === tm;
      }
    }
    const ex = readGame4uExtraRecord(a);
    if (ex) {
      const ms = parseExtraDrPrazoToUtcMs(ex['dt_prazo'] ?? ex['dr_prazo']);
      if (ms != null) {
        const d = new Date(ms);
        return d.getFullYear() === ty && d.getMonth() === tm;
      }
    }
    return true;
  });
}

/** Modo de filtro por mês na lista de atividades do modal (Game4U). */
export type ActivityListMonthFilterMode = 'listTimestamp' | 'dtPrazo' | 'none';

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

function readGame4uExtraRecord(a: Game4uUserActionModel): Record<string, unknown> | null {
  const ex = a['extra'];
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
    return ex as Record<string, unknown>;
  }
  if (typeof ex === 'string' && ex.trim()) {
    try {
      const parsed: unknown = JSON.parse(ex);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // extra não é JSON — ignorar
    }
  }
  return null;
}

/**
 * Parseia `extra.dr_prazo` (ISO, `$date`, epoch ms ou s) para instante UTC em ms.
 */
export function parseExtraDrPrazoToUtcMs(dr: unknown): number | null {
  if (dr == null || dr === '') {
    return null;
  }
  if (typeof dr === 'number' && Number.isFinite(dr)) {
    const ms = dr < 1e12 ? dr * 1000 : dr;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof dr === 'object' && dr !== null && '$date' in (dr as object)) {
    return parseGame4uIsoMs((dr as { $date: unknown }).$date);
  }
  return parseGame4uIsoMs(dr);
}

/** `extra.dt_prazo` (ou legado `extra.dr_prazo`) no mesmo mês calendário que `month`. */
export function isGame4uActionExtraDrPrazoInCalendarMonth(a: Game4uUserActionModel, month: Date): boolean {
  const ex = readGame4uExtraRecord(a);
  if (!ex) {
    return false;
  }
  const ms = parseExtraDrPrazoToUtcMs(ex['dt_prazo'] ?? ex['dr_prazo']);
  if (ms == null) {
    return false;
  }
  const d = new Date(ms);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

/**
 * Pontos a somar à **meta** do circular do mês: user-actions **PENDING** com `extra.dt_prazo` no mês do filtro
 * (fallback: `extra.dr_prazo`) que ainda não entram na competência usual (`delivery_id` / `created_at`), para não duplicar.
 */
export function computeGame4uDrPrazoMetaBoost(actions: Game4uUserActionModel[], month: Date): number {
  const inCompetence = filterGame4uActionsByCompetenceMonth(actions, month);
  const competenceIds = new Set(inCompetence.map(a => String(a.id)));
  let sum = 0;
  for (const a of actions) {
    const st = String(a.status ?? '').toUpperCase();
    if (st !== 'PENDING') {
      continue;
    }
    if (!isGame4uActionExtraDrPrazoInCalendarMonth(a, month)) {
      continue;
    }
    if (competenceIds.has(String(a.id))) {
      continue;
    }
    sum += Math.floor(Number(a.points) || 0);
  }
  return sum;
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
  month?: Date,
  opts?: { monthFilter?: ActivityListMonthFilterMode }
): ActivityListItem[] {
  const mode = opts?.monthFilter ?? 'listTimestamp';
  const scoped =
    !month || mode === 'none'
      ? actions
      : mode === 'dtPrazo'
        ? filterGame4uActionsByDtPrazoCalendarMonth(actions, month)
        : filterGame4uActionsByListTimestampMonth(actions, month);
  return scoped.map(a => {
    const dp =
      typeof a.dt_prazo === 'string' && a.dt_prazo.trim() ? a.dt_prazo.trim() : undefined;
    const riscoMulta = parseGame4uRiscoMulta(a.risco_multa);
    const atrasoJustificado = parseGame4uAtrasoJustificado(readGame4uExtraStatusApi(a));
    return {
      id: a.id,
      title: (a.action_title as string) || 'Ação',
      delivery_title: (a.delivery_title as string) || undefined,
      ...(dp ? { dt_prazo: dp } : {}),
      ...(riscoMulta ? { risco_multa: true } : {}),
      ...(atrasoJustificado ? { atraso_justificado: true } : {}),
      points: Math.floor(Number(a.points) || PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG),
      created: game4uUserActionListTimestampMs(a),
      player: asString(a.user_email),
      cnpj: asString(a.integration_id) || undefined
    };
  });
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
): {
  cnpj: string;
  actionCount: number;
  delivery_title?: string;
  delivery_extra_cnpj?: string;
}[] {
  const byId = new Map<
    string,
    { actionCount: number; delivery_title?: string; delivery_extra_cnpj?: string }
  >();
  for (const list of lists) {
    for (const d of list) {
      const id = String(d.id);
      const cur = byId.get(id) || { actionCount: 0 };
      cur.actionCount += 1;
      const label = readDeliveryTitle(d);
      if (label) {
        cur.delivery_title = label;
      }
      const ec = readGame4uExtraCnpjFromRecord(d as Record<string, unknown>);
      if (ec && !cur.delivery_extra_cnpj) {
        cur.delivery_extra_cnpj = ec;
      }
      byId.set(id, cur);
    }
  }
  return [...byId.entries()].map(([cnpj, v]) => {
    const row: {
      cnpj: string;
      actionCount: number;
      delivery_title?: string;
      delivery_extra_cnpj?: string;
    } = {
      cnpj,
      actionCount: v.actionCount
    };
    if (v.delivery_title) {
      row.delivery_title = v.delivery_title;
    }
    if (v.delivery_extra_cnpj) {
      row.delivery_extra_cnpj = v.delivery_extra_cnpj;
    }
    return row;
  });
}

/** `delivery_id` tipo `EmpID-YYYY-MM-DD` para cruzamento com gamificação. */
export function buildGame4uDeliveryIdFromEmpId(empId: string | number, month: Date): string {
  const y = month.getFullYear();
  const m = String(month.getMonth() + 1).padStart(2, '0');
  return `${empId}-${y}-${m}-01`;
}

/** Título do processo/entrega em user-action (`attributes.delivery_title` ou topo). */
export function readGame4uProcessTitleFromUserAction(a: Game4uUserActionModel): string {
  const raw = a as Record<string, unknown>;
  const attrs = raw['attributes'];
  if (attrs != null && typeof attrs === 'object') {
    const nested = (attrs as Record<string, unknown>)['delivery_title'];
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }
  const top = a.delivery_title;
  if (typeof top === 'string' && top.trim()) {
    return top.trim();
  }
  return '';
}

/** Título exibido da user-action (`title`, `action_title`, `attributes.acao`, …). */
export function readGame4uUserActionTitle(a: Game4uUserActionModel): string {
  const raw = a as Record<string, unknown>;
  const top = raw['title'];
  if (typeof top === 'string' && top.trim()) {
    return top.trim();
  }
  const actionTitle = a.action_title;
  if (typeof actionTitle === 'string' && actionTitle.trim()) {
    return actionTitle.trim();
  }
  const attrs = raw['attributes'];
  if (attrs != null && typeof attrs === 'object') {
    const acao = (attrs as Record<string, unknown>)['acao'];
    if (typeof acao === 'string' && acao.trim()) {
      return acao.trim();
    }
  }
  const processTitle = readGame4uProcessTitleFromUserAction(a);
  if (processTitle) {
    return processTitle;
  }
  return 'Sem título';
}

export interface ExecutiveTopProcessRow {
  deliveryTitle: string;
  tasksTotal: number;
  deliveriesCount: number;
  onTimePct: number | null;
  pct: number;
}

/** Top processos finalizados agregados diretamente de `GET /game/reports/user-actions`. */
export function aggregateExecutiveTopProcessesFromUserActions(
  actions: Game4uUserActionModel[]
): { top: ExecutiveTopProcessRow[]; distinctProcesses: number } {
  type Acc = { tasks: number; clientKeys: Set<string>; onTime: number; late: number };
  const byTitle = new Map<string, Acc>();

  for (const a of actions || []) {
    const st = a.status;
    if (st !== 'DONE' && st !== 'DELIVERED' && st !== 'PAID') {
      continue;
    }
    const title = readGame4uUserActionTitle(a);
    const acc = byTitle.get(title) ?? { tasks: 0, clientKeys: new Set<string>(), onTime: 0, late: 0 };
    acc.tasks += 1;

    const clientKey = String(
      a.integration_id ?? a.client_id ?? readGame4uExtraCnpj(a) ?? a.delivery_id ?? ''
    ).trim();
    if (clientKey) {
      acc.clientKeys.add(clientKey);
    }

    if (!isGame4uUserActionJustified(a)) {
      const finishedMs = getGame4uUserActionFinishedOrFallbackMs(a);
      const prazoStatus = resolveGame4uFinishedPrazoStatus(
        typeof a.dt_prazo === 'string' ? a.dt_prazo : undefined,
        finishedMs ?? undefined
      );
      if (prazoStatus === 'on_time') {
        acc.onTime += 1;
      } else if (prazoStatus === 'late') {
        acc.late += 1;
      }
    }
    byTitle.set(title, acc);
  }

  const totalTasks = [...byTitle.values()].reduce((s, v) => s + v.tasks, 0);
  const top = [...byTitle.entries()]
    .map(([deliveryTitle, v]) => {
      const judged = v.onTime + v.late;
      return {
        deliveryTitle,
        tasksTotal: v.tasks,
        deliveriesCount: v.clientKeys.size,
        onTimePct: judged > 0 ? Math.round((v.onTime / judged) * 1000) / 10 : null,
        pct: totalTasks > 0 ? Math.round((v.tasks / totalTasks) * 1000) / 10 : 0
      };
    })
    .sort((a, b) => b.tasksTotal - a.tasksTotal)
    .slice(0, 6);

  return { top, distinctProcesses: byTitle.size };
}

/** Métricas agregadas de entregas finalizadas para ranking executivo (jogador ou equipa). */
export interface ExecutiveDeliveryRankingAgg {
  tasksTotal: number;
  deliveriesCount: number;
  judgedDeliveriesCount: number;
  onTimeDeliveries: number;
  clientsCount: number;
  onTimeDeliveryPct: number | null;
  onTimePct: number | null;
}

/** Agrega linhas de `finished/deliveries/cached` num único candidato a ranking. */
export function aggregateExecutiveDeliveryRowsForRanking(
  rows: Game4uReportsFinishedDeliveryRow[],
  options?: { justifiedLookup?: ExecutiveJustifiedDeliveryLookup }
): ExecutiveDeliveryRankingAgg {
  const safeRows = (rows || []).filter(r => r != null && Math.floor(Number(r.tasks_total) || 0) > 0);
  const clients = new Set<string>();
  let tasksTotal = 0;
  let deliveriesCount = 0;
  let judgedDeliveriesCount = 0;
  let onTimeDeliveries = 0;
  let onTimeWeighted = 0;
  let tasksWithPct = 0;

  for (const row of safeRows) {
    const tasks = Math.floor(Number(row.tasks_total) || 0);
    if (tasks <= 0) {
      continue;
    }
    const justified = isGame4uDeliveryRowJustified(row, options?.justifiedLookup);
    tasksTotal += tasks;
    deliveriesCount += 1;
    const clientKey = executiveDeliveryDistinctKey(row);
    if (clientKey) {
      clients.add(clientKey);
    }
    if (justified) {
      continue;
    }
    judgedDeliveriesCount += 1;
    if (deliveryRowCountsAsOnTime(row)) {
      onTimeDeliveries += 1;
    }
    const otp = row.on_time_pct;
    if (otp != null && Number.isFinite(Number(otp))) {
      onTimeWeighted += Number(otp) * tasks;
      tasksWithPct += tasks;
    }
  }

  return {
    tasksTotal,
    deliveriesCount,
    judgedDeliveriesCount,
    onTimeDeliveries,
    clientsCount: clients.size,
    onTimeDeliveryPct:
      judgedDeliveriesCount > 0
        ? Math.round((onTimeDeliveries / judgedDeliveriesCount) * 1000) / 10
        : null,
    onTimePct:
      tasksWithPct > 0 ? Math.round((onTimeWeighted / tasksWithPct) * 10) / 10 : null
  };
}

/** Candidato ao ranking executivo de jogadores (destaque / atenção). */
export interface ExecutivePlayerRankCandidate {
  email: string;
  deliveriesCount: number;
  onTimeDeliveries: number;
  onTimeDeliveryPct: number | null;
  /** Entregas elegíveis para métricas de prazo (exclui justificadas). */
  judgedDeliveriesCount?: number;
}

export interface PartitionExecutivePlayerRankingsOptions {
  minDeliveriesForAttention?: number;
  maxOnTimePctForAttention?: number;
  topCount?: number;
  attentionCount?: number;
}

/**
 * Separa destaques (mais entregas no prazo) e jogadores que precisam de atenção (menor % no prazo).
 * Quem entra na lista de atenção não aparece no ranking de destaques.
 */
export function partitionExecutivePlayerRankings<T extends ExecutivePlayerRankCandidate>(
  playerArray: T[],
  options: PartitionExecutivePlayerRankingsOptions = {}
): { top: T[]; attention: T[] } {
  const minDeliveries = options.minDeliveriesForAttention ?? 3;
  const maxOnTimePct = options.maxOnTimePctForAttention ?? 90;
  const topCount = options.topCount ?? 5;
  const attentionCount = options.attentionCount ?? 5;

  const judgedDeliveries = (p: T): number => p.judgedDeliveriesCount ?? p.deliveriesCount;

  const compareByOnTimeDeliveriesDesc = (a: T, b: T): number => {
    if (b.onTimeDeliveries !== a.onTimeDeliveries) {
      return b.onTimeDeliveries - a.onTimeDeliveries;
    }
    const pctA = a.onTimeDeliveryPct ?? -1;
    const pctB = b.onTimeDeliveryPct ?? -1;
    if (pctB !== pctA) {
      return pctB - pctA;
    }
    return judgedDeliveries(b) - judgedDeliveries(a);
  };

  const compareNeedsAttention = (a: T, b: T): number => {
    const pctA = a.onTimeDeliveryPct ?? 0;
    const pctB = b.onTimeDeliveryPct ?? 0;
    if (pctA !== pctB) {
      return pctA - pctB;
    }
    const lateA = judgedDeliveries(a) - a.onTimeDeliveries;
    const lateB = judgedDeliveries(b) - b.onTimeDeliveries;
    if (lateB !== lateA) {
      return lateB - lateA;
    }
    return judgedDeliveries(b) - judgedDeliveries(a);
  };

  const isEligibleForAttention = (p: T): boolean =>
    judgedDeliveries(p) >= minDeliveries &&
    p.onTimeDeliveryPct != null &&
    p.onTimeDeliveryPct < maxOnTimePct;

  const attention = [...playerArray]
    .filter(isEligibleForAttention)
    .sort(compareNeedsAttention)
    .slice(0, attentionCount);

  const attentionEmails = new Set(attention.map(p => p.email));

  const top = playerArray
    .filter(p => judgedDeliveries(p) > 0 && !attentionEmails.has(p.email))
    .sort(compareByOnTimeDeliveriesDesc)
    .slice(0, topCount);

  return { top, attention };
}

/**
 * Cliente atendido no mês: delivery com pelo menos uma tarefa DONE/DELIVERED no mês (`dt_prazo`).
 * No cache, `tasks_total` / `tasks_on_time` referem-se a esse mês; sem contadores, confia no filtro da API legada.
 */
export function deliveryRowHasFinishedTaskInMonth(row: Game4uReportsFinishedDeliveryRow): boolean {
  const extra = row as unknown as Record<string, unknown>;
  const hasMonthTaskCounters =
    row.tasks_total != null ||
    row.tasks_on_time != null ||
    extra['tasks_finished'] != null ||
    extra['month_tasks_finished'] != null ||
    extra['finished_tasks_count'] != null;

  if (!hasMonthTaskCounters) {
    return true;
  }

  const total = Math.floor(Number(row.tasks_total) || 0);
  const onTime = Math.floor(Number(row.tasks_on_time) || 0);
  if (total > 0 || onTime > 0) {
    return true;
  }

  for (const key of ['tasks_finished', 'month_tasks_finished', 'finished_tasks_count', 'tasks_done']) {
    if (Math.floor(Number(extra[key]) || 0) > 0) {
      return true;
    }
  }
  return false;
}

function readOnTimePctFromDeliveryRow(row: Game4uReportsFinishedDeliveryRow): number | null {
  const raw = row.on_time_pct;
  if (raw == null || (typeof raw === 'string' && String(raw).trim() === '')) {
    return null;
  }
  let n = Number(raw);
  if (!Number.isFinite(n)) {
    return null;
  }
  if (n > 0 && n <= 1) {
    n = n * 100;
  }
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/**
 * Entrega (linha do cache) considerada no prazo: todas as tarefas do mês na entrega
 * finalizadas no prazo (`tasks_on_time >= tasks_total`) ou `on_time_pct` = 100%.
 */
export function deliveryRowCountsAsOnTime(row: Game4uReportsFinishedDeliveryRow): boolean {
  const total = Math.floor(Number(row.tasks_total) || 0);
  if (total <= 0) {
    return false;
  }
  const onTimeTasks = Math.floor(Number(row.tasks_on_time) || 0);
  if (onTimeTasks > 0) {
    return onTimeTasks >= total;
  }
  const pct = readOnTimePctFromDeliveryRow(row);
  return pct != null && pct >= 100;
}

/** Participação a partir de `GET /game/reports/finished/deliveries` ou `…/deliveries/cached`. */
export function mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows(
  rows: Game4uReportsFinishedDeliveryRow[],
  month?: Date
): {
  cnpj: string;
  actionCount: number;
  processCount: number;
  delivery_title?: string;
  deliveryId?: string;
  porcEntregas?: number;
  entrega?: number;
  fromGameReportsDeliveries?: boolean;
  fromCachedDeliveries?: boolean;
  loadTasksViaGameReports?: boolean;
  gamificacaoEmpIdUsado?: string | number;
}[] {
  const out: {
    cnpj: string;
    actionCount: number;
    processCount: number;
    delivery_title?: string;
    deliveryId?: string;
    porcEntregas?: number;
    entrega?: number;
    fromGameReportsDeliveries?: boolean;
    fromCachedDeliveries?: boolean;
    loadTasksViaGameReports?: boolean;
    gamificacaoEmpIdUsado?: string | number;
  }[] = [];
  const seen = new Set<string>();
  const filterByMonthFinished = month != null;
  for (const row of rows || []) {
    if (filterByMonthFinished && !deliveryRowHasFinishedTaskInMonth(row)) {
      continue;
    }
    const title = row.delivery_title?.trim() || '';
    let did = row.delivery_id?.trim() || '';
    if (!did && row.emp_id != null && month != null) {
      did = buildGame4uDeliveryIdFromEmpId(row.emp_id, month);
    }
    const dedupeKey = did || title;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const pct = readOnTimePctFromDeliveryRow(row);
    const hasCachedPct = pct != null;
    out.push({
      cnpj: did ? `g4u-rpt:${did}` : `g4u-rpt:${title}`,
      actionCount: Math.floor(Number(row.tasks_total) || 0),
      processCount: 1,
      delivery_title: title || undefined,
      ...(did ? { deliveryId: did } : {}),
      ...(hasCachedPct ? { porcEntregas: pct, entrega: pct } : {}),
      ...(row.emp_id != null ? { gamificacaoEmpIdUsado: row.emp_id } : {}),
      fromGameReportsDeliveries: true,
      ...(hasCachedPct ? { fromCachedDeliveries: true } : {}),
      loadTasksViaGameReports: true
    });
  }
  return out;
}

/**
 * Indica se deve pedir outra página de `finished/deliveries/cached`.
 * Com `total` conhecido, usa `nextOffset < total` (não exige página “cheia” após filtro no cliente).
 */
export function hasMoreFinishedDeliveriesCachedPage(
  received: number,
  limit: number,
  nextOffset: number,
  total?: number,
  explicitHasMore?: boolean
): boolean {
  if (explicitHasMore === false) {
    return false;
  }
  if (explicitHasMore === true) {
    return true;
  }
  const lim = Math.max(1, Math.floor(limit));
  const rec = Math.max(0, Math.floor(received));
  const next = Math.max(0, Math.floor(nextOffset));
  if (typeof total === 'number' && Number.isFinite(total)) {
    const tot = Math.floor(total);
    if (next < tot) {
      return true;
    }
    // Algumas respostas enviam `total` = tamanho da página atual; página cheia ainda pode ter mais dados.
    if (rec >= lim && next >= tot) {
      return true;
    }
    return false;
  }
  return rec >= lim;
}

/**
 * «Clientes atendidos» Game4U: uma linha por `delivery_id` com pelo menos uma user-action **DONE** ou **DELIVERED**
 * (exclui entregas só com PENDING/DOING no período).
 */
export function mapGame4uUserActionsToParticipacaoCnpjRows(actions: Game4uUserActionModel[]): {
  cnpj: string;
  actionCount: number;
  processCount: number;
  delivery_title?: string;
  deliveryId?: string;
  delivery_extra_cnpj?: string;
}[] {
  const byDel = new Map<
    string,
    { count: number; hasDeliveredAction: boolean; title?: string; extraCnpj?: string }
  >();
  for (const a of actions) {
    const st = a.status;
    if (st !== 'DONE' && st !== 'DELIVERED') {
      continue;
    }
    const did = String(a.delivery_id ?? '').trim();
    if (!did) {
      continue;
    }
    const row = byDel.get(did) ?? { count: 0, hasDeliveredAction: false };
    row.count++;
    if (st === 'DELIVERED') {
      row.hasDeliveredAction = true;
    }
    if (!row.title) {
      const t = String(a.delivery_title ?? a.action_title ?? '').trim();
      if (t) {
        row.title = t;
      }
    }
    if (!row.extraCnpj) {
      const integ = asString(a.integration_id).trim();
      if (integ) {
        row.extraCnpj = integ;
      } else {
        const ec = readGame4uExtraCnpjFromRecord(a as Record<string, unknown>);
        if (ec) {
          row.extraCnpj = ec;
        }
      }
    }
    byDel.set(did, row);
  }
  return [...byDel.entries()].map(([deliveryId, v]) => {
    const row: {
      cnpj: string;
      actionCount: number;
      processCount: number;
      delivery_title?: string;
      deliveryId?: string;
      delivery_extra_cnpj?: string;
    } = {
      cnpj: deliveryId,
      actionCount: v.count,
      processCount: v.hasDeliveredAction ? 1 : 0,
      deliveryId
    };
    if (v.title) {
      row.delivery_title = v.title;
    }
    if (v.extraCnpj) {
      row.delivery_extra_cnpj = v.extraCnpj;
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
