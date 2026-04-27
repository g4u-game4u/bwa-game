import * as fs from 'fs';
import * as path from 'path';
import { loadRepoEnv, envStr } from './loadEnv';

/** Same logic as `gamificacao-delivery-empid.util.ts` in the Angular app. */
function extractGamificacaoEmpIdFromDeliveryKey(key: string): string | null {
  const s = String(key || '').trim();
  if (!s) {
    return null;
  }
  const m = s.match(/^(.+)-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const y = Number(m[2]);
  const mo = Number(m[3]);
  const d = Number(m[4]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  const prefix = m[1];
  if (/^\d+$/.test(prefix)) {
    return prefix;
  }
  const parts = prefix.split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (p && /^\d+$/.test(p)) {
      return p;
    }
  }
  return null;
}

function digitsOnly(cnpj: string | null | undefined): string {
  return String(cnpj ?? '').replace(/\D/g, '');
}

function stripLeadingZerosNumericId(id: string): string {
  const t = String(id || '').trim();
  if (!/^\d+$/.test(t)) {
    return t;
  }
  return t.replace(/^0+/, '') || '0';
}

function empIdsMatch(a: string, b: string): boolean {
  const ta = String(a || '').trim();
  const tb = String(b || '').trim();
  if (ta === tb) {
    return true;
  }
  if (/^\d+$/.test(ta) && /^\d+$/.test(tb)) {
    return stripLeadingZerosNumericId(ta) === stripLeadingZerosNumericId(tb);
  }
  return false;
}

function joinUrl(base: string, segment: string): string {
  const b = base.replace(/\/+$/, '');
  const s = segment.startsWith('/') ? segment : `/${segment}`;
  return `${b}${s}`;
}

function defaultOutDir(): string {
  const here = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(here, '..', '..');
  return path.join(repoRoot, 'regras-de-negocio-scrips', 'get-companies-by-level', 'out');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): {
  help: boolean;
  skipDeliveries: boolean;
  applyDeliveries: boolean;
  maxPuts: number;
  allPuts: boolean;
  maxDeliveryPages: number;
  dryRun: boolean;
  reuseJson: boolean;
  outDir: string;
  progressEvery: number;
  putDelayMs: number;
} {
  let help = false;
  let skipDeliveries = false;
  let applyDeliveries = false;
  let maxPuts = 1;
  let allPuts = false;
  let maxDeliveryPages = 0;
  let dryRun = false;
  let reuseJson = false;
  let outDir = defaultOutDir();
  let progressEvery = 0;
  let putDelayMs = 0;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--skip-deliveries') {
      skipDeliveries = true;
    } else if (a === '--apply-deliveries') {
      applyDeliveries = true;
    } else if (a === '--all-puts') {
      allPuts = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--reuse-json') {
      reuseJson = true;
    } else if (a === '--max-puts' && argv[i + 1]) {
      maxPuts = Math.max(0, parseInt(argv[++i], 10));
    } else if (a === '--max-delivery-pages' && argv[i + 1]) {
      maxDeliveryPages = Math.max(0, parseInt(argv[++i], 10));
    } else if (a === '--progress-every' && argv[i + 1]) {
      progressEvery = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === '--put-delay-ms' && argv[i + 1]) {
      putDelayMs = Math.max(0, parseInt(argv[++i], 10));
    } else if (a === '--out-dir' && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    }
  }
  if (allPuts) {
    maxPuts = Number.MAX_SAFE_INTEGER;
  }
  return {
    help,
    skipDeliveries,
    applyDeliveries,
    maxPuts,
    allPuts,
    maxDeliveryPages,
    dryRun,
    reuseJson,
    outDir,
    progressEvery,
    putDelayMs
  };
}

function readJsonFile<T>(file: string): T {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as T;
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function extractPortalToken(body: Record<string, unknown>): string {
  const candidates = [
    body.token,
    body.access_token,
    body.accessToken,
    body.access,
    (body.data as Record<string, unknown>)?.token,
    (body.data as Record<string, unknown>)?.access_token
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim();
    }
  }
  throw new Error('Portal login: no token in response keys: ' + Object.keys(body).join(', '));
}

async function portalLogin(base: string, email: string, password: string): Promise<string> {
  const url = joinUrl(base, '/api/autenticacao/obter-token-acesso/');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: password })
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Portal login ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return extractPortalToken(body);
}

type UnknownRecord = Record<string, unknown>;

function pickStr(obj: UnknownRecord, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
    const lower = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase());
    if (lower != null) {
      const vv = obj[lower];
      if (vv != null && String(vv).trim() !== '') {
        return String(vv).trim();
      }
    }
  }
  return '';
}

function normalizePortalCompany(raw: UnknownRecord): {
  cnpj: string;
  razao_social: string;
  classificacao: string;
  uf: string;
  forma_de_tributacao: string;
  cliente_em_onboarding: unknown;
  cliente_em_risco: unknown;
} | null {
  const cnpj = pickStr(raw, ['cnpj', 'CNPJ', 'cnpj_empresa']);
  if (!digitsOnly(cnpj)) {
    return null;
  }
  return {
    cnpj: digitsOnly(cnpj),
    razao_social: pickStr(raw, ['razao_social', 'razaoSocial', 'RazaoSocial', 'nome', 'nome_fantasia']),
    classificacao: pickStr(raw, ['classificacao', 'classificacao_cliente', 'Classificacao']),
    uf: pickStr(raw, ['uf', 'UF', 'estado']),
    forma_de_tributacao: pickStr(raw, ['forma_de_tributacao', 'formaDeTributacao', 'forma_tributacao']),
    cliente_em_onboarding: raw.cliente_em_onboarding ?? raw.clienteEmOnboarding ?? null,
    cliente_em_risco: raw.cliente_em_risco ?? raw.clienteEmRisco ?? null
  };
}

function extractArrayFromListResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object') {
    const o = body as UnknownRecord;
    for (const k of ['results', 'data', 'items', 'empresas', 'rows', 'list']) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v;
      }
    }
  }
  return [];
}

function extractNextUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const o = body as UnknownRecord;
  const next = o.next ?? o.next_page_url;
  if (typeof next === 'string' && next.trim().startsWith('http')) {
    return next.trim();
  }
  return null;
}

/** Portal BWA `listar-empresas`: `{ items, has_next, next_cursor, ... }`. */
function parsePortalCursorPage(body: unknown): {
  items: UnknownRecord[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  if (!body || typeof body !== 'object') {
    return { items: [], hasMore: false, nextCursor: null };
  }
  const o = body as UnknownRecord;
  const raw = o.items;
  const items = Array.isArray(raw)
    ? (raw.filter(x => x && typeof x === 'object') as UnknownRecord[])
    : (extractArrayFromListResponse(body).filter(x => x && typeof x === 'object') as UnknownRecord[]);
  const nc = o.next_cursor ?? o.nextCursor;
  const nextCursor = typeof nc === 'string' && nc.trim() !== '' ? nc.trim() : null;
  const hasNextFlag = o.has_next === true || o.hasNext === true;
  const hasMore = hasNextFlag && nextCursor != null;
  return { items, hasMore, nextCursor };
}

function buildListarEmpresasUrl(
  base: string,
  limit: number,
  cursorQueryParam: string,
  cursorValue: string | null
): string {
  const u = new URL(joinUrl(base, '/api/empresas/listar-empresas'));
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('ativa_na_bwa', 'true');
  if (cursorValue) {
    u.searchParams.set(cursorQueryParam, cursorValue);
  }
  return u.toString();
}

async function portalFetchJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Portal GET non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`Portal GET ${res.status}: ${text.slice(0, 600)}`);
  }
  return json;
}

async function fetchAllPortalCompanies(
  base: string,
  token: string,
  limit: number
): Promise<UnknownRecord[]> {
  const all: UnknownRecord[] = [];
  const cursorParam =
    envStr('PORTAL_BWA_EMPRESAS_CURSOR_PARAM', 'portal_bwa_empresas_cursor_param') || 'cursor';

  const firstUrl = buildListarEmpresasUrl(base, limit, cursorParam, null);
  let body = await portalFetchJson(firstUrl, token);
  const o0 = body && typeof body === 'object' ? (body as UnknownRecord) : null;
  const usesCursorPagination =
    o0 != null &&
    Array.isArray(o0.items) &&
    (typeof o0.has_next === 'boolean' || typeof o0.hasNext === 'boolean');

  if (usesCursorPagination) {
    const seenCursors = new Set<string>();
    let currentBody: unknown = body;
    for (let guard = 0; guard < 10000; guard++) {
      const page = parsePortalCursorPage(currentBody);
      for (const r of page.items) {
        all.push(r);
      }
      if (!page.hasMore || !page.nextCursor) {
        break;
      }
      if (seenCursors.has(page.nextCursor)) {
        console.warn(
          'Portal listar-empresas: next_cursor repetido; interrompendo paginação para evitar loop.'
        );
        break;
      }
      seenCursors.add(page.nextCursor);
      const nextUrl = buildListarEmpresasUrl(base, limit, cursorParam, page.nextCursor);
      currentBody = await portalFetchJson(nextUrl, token);
    }
    return all;
  }

  const seenUrls = new Set<string>();
  const initial = joinUrl(base, `/api/empresas/listar-empresas/?limit=${limit}&ativa_na_bwa=true`);
  let next = extractNextUrl(body);

  if (next) {
    let currentUrl: string | null = initial;
    let currentBody: unknown = body;
    while (currentUrl) {
      if (seenUrls.has(currentUrl)) {
        break;
      }
      seenUrls.add(currentUrl);
      const rows = extractArrayFromListResponse(currentBody);
      for (const r of rows) {
        if (r && typeof r === 'object') {
          all.push(r as UnknownRecord);
        }
      }
      const nxt = extractNextUrl(currentBody);
      if (!nxt) {
        break;
      }
      if (seenUrls.has(nxt)) {
        break;
      }
      currentUrl = nxt;
      currentBody = await portalFetchJson(nxt, token);
    }
    return all;
  }

  const firstRows = extractArrayFromListResponse(body);
  for (const r of firstRows) {
    if (r && typeof r === 'object') {
      all.push(r as UnknownRecord);
    }
  }
  if (firstRows.length === 0) {
    for (let offset = 0; offset < 500000; offset += limit) {
      const url = joinUrl(
        base,
        `/api/empresas/listar-empresas/?limit=${limit}&ativa_na_bwa=true&offset=${offset}`
      );
      const offBody = await portalFetchJson(url, token);
      const rows = extractArrayFromListResponse(offBody);
      if (rows.length === 0) {
        break;
      }
      for (const r of rows) {
        if (r && typeof r === 'object') {
          all.push(r as UnknownRecord);
        }
      }
      if (rows.length < limit) {
        break;
      }
    }
    return all;
  }
  if (firstRows.length < limit) {
    return all;
  }

  for (let page = 2; page < 5000; page++) {
    const url = joinUrl(
      base,
      `/api/empresas/listar-empresas/?limit=${limit}&ativa_na_bwa=true&page=${page}`
    );
    const pageBody = await portalFetchJson(url, token);
    const rows = extractArrayFromListResponse(pageBody);
    if (rows.length === 0) {
      break;
    }
    for (const r of rows) {
      if (r && typeof r === 'object') {
        all.push(r as UnknownRecord);
      }
    }
    if (rows.length < limit) {
      break;
    }
  }

  return all;
}

function extractGamificacaoRows(body: unknown): UnknownRecord[] {
  if (Array.isArray(body)) {
    return body as UnknownRecord[];
  }
  if (body && typeof body === 'object') {
    const o = body as UnknownRecord;
    for (const k of ['data', 'result', 'items', 'empresas', 'rows']) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v as UnknownRecord[];
      }
    }
  }
  return [];
}

async function fetchGamificacao(url: string, apiToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-token': apiToken
    }
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Gamificação GET non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`Gamificação GET ${res.status}: ${text.slice(0, 600)}`);
  }
  return json;
}

function gamificacaoEmpId(row: UnknownRecord): string {
  const v = row.EmpID ?? row.empId ?? row.empid;
  if (v == null) {
    return '';
  }
  return String(v).trim();
}

function gamificacaoCnpjDigits(row: UnknownRecord): string {
  const raw = row.CNPJ ?? row.cnpj;
  return digitsOnly(raw != null ? String(raw) : '');
}

type CompanyCompleto = {
  empId: string;
  classificacao: string;
  cnpj: string;
  razao_social: string;
  uf: string;
  forma_de_tributacao: string;
  cliente_em_onboarding: unknown;
  cliente_em_risco: unknown;
};

function buildCompanyCompleto(
  portalRows: UnknownRecord[],
  gamRows: UnknownRecord[]
): CompanyCompleto[] {
  const byCnpj = new Map<string, { empId: string }>();
  for (const g of gamRows) {
    const d = gamificacaoCnpjDigits(g);
    const emp = gamificacaoEmpId(g);
    if (d.length >= 11 && emp) {
      byCnpj.set(d, { empId: emp });
    }
  }

  const out: CompanyCompleto[] = [];
  for (const raw of portalRows) {
    const norm = normalizePortalCompany(raw);
    if (!norm) {
      continue;
    }
    const hit = byCnpj.get(norm.cnpj);
    if (!hit) {
      continue;
    }
    out.push({
      empId: hit.empId,
      classificacao: norm.classificacao,
      cnpj: norm.cnpj,
      razao_social: norm.razao_social,
      uf: norm.uf,
      forma_de_tributacao: norm.forma_de_tributacao,
      cliente_em_onboarding: norm.cliente_em_onboarding,
      cliente_em_risco: norm.cliente_em_risco
    });
  }
  return out;
}

function indexCompletoByEmpId(rows: CompanyCompleto[]): Map<string, CompanyCompleto> {
  const m = new Map<string, CompanyCompleto>();
  for (const r of rows) {
    const e = String(r.empId || '').trim();
    if (!e) {
      continue;
    }
    m.set(e, r);
    if (/^\d+$/.test(e)) {
      m.set(stripLeadingZerosNumericId(e), r);
    }
  }
  return m;
}

function findCompletoForDeliveryEmpId(
  byEmp: Map<string, CompanyCompleto>,
  deliveryEmpId: string
): CompanyCompleto | undefined {
  const t = String(deliveryEmpId || '').trim();
  if (!t) {
    return undefined;
  }
  let hit = byEmp.get(t);
  if (hit) {
    return hit;
  }
  if (/^\d+$/.test(t)) {
    hit = byEmp.get(stripLeadingZerosNumericId(t));
    if (hit) {
      return hit;
    }
    for (const [, row] of byEmp) {
      if (empIdsMatch(row.empId, t)) {
        return row;
      }
    }
  }
  return undefined;
}

async function game4uLogin(
  base: string,
  clientId: string,
  email: string,
  password: string
): Promise<string> {
  const url = joinUrl(base, '/auth/login');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: clientId
    },
    body: JSON.stringify({ email, password })
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Game4U login ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  const token =
    (body.access_token as string) ||
    (body.accessToken as string) ||
    (body.token as string) ||
    '';
  if (!token) {
    throw new Error('Game4U login OK but no access_token in response keys: ' + Object.keys(body).join(','));
  }
  return token;
}

type ParsedDeliveryList = {
  items: UnknownRecord[];
  total?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
};

function normalizeDeliveryListJson(json: unknown): ParsedDeliveryList {
  if (Array.isArray(json)) {
    const items = json.filter(x => x && typeof x === 'object') as UnknownRecord[];
    return { items };
  }
  if (json && typeof json === 'object') {
    const o = json as UnknownRecord;
    if (Array.isArray(o.items)) {
      const items = o.items.filter(x => x && typeof x === 'object') as UnknownRecord[];
      const total = typeof o.total === 'number' ? o.total : undefined;
      const totalPages = typeof o.totalPages === 'number' ? o.totalPages : undefined;
      const page = typeof o.page === 'number' ? o.page : undefined;
      const limit = typeof o.limit === 'number' ? o.limit : undefined;
      return { items, total, totalPages, page, limit };
    }
  }
  const items = extractArrayFromListResponse(json).filter(
    x => x && typeof x === 'object'
  ) as UnknownRecord[];
  return { items };
}

async function game4uFetchDeliveryList(
  url: string,
  clientId: string,
  bearer: string,
  labelForErrors: string
): Promise<ParsedDeliveryList> {
  if (!bearer || !bearer.trim()) {
    throw new Error('Game4U: token vazio após login; não é possível chamar a API.');
  }
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      client_id: clientId,
      Authorization: `Bearer ${bearer.trim()}`
    }
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Game4U GET ${labelForErrors} non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`Game4U GET ${labelForErrors} ${res.status}: ${text.slice(0, 600)}`);
  }
  return normalizeDeliveryListJson(json);
}

function deliveriesPageSizeFromEnv(): number {
  const raw = envStr('GAME4U_DELIVERIES_PAGE_SIZE', 'game4u_deliveries_page_size');
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Percorre páginas de deliveries (uma página em memória de cada vez).
 * - Sem `GAME4U_DELIVERIES_PAGE_SIZE`: um GET sem query; aceita resposta em array ou `{ items, ... }`.
 * - Com `GAME4U_DELIVERIES_PAGE_SIZE`: por defeito `?page=&limit=` (limit 1–500 na API); resposta
 *   `{ items, total, page, limit, totalPages }`. Modo legado: `GAME4U_DELIVERIES_PAGINATION=offset`.
 */
async function* game4uIterateDeliveryPages(
  base: string,
  clientId: string,
  bearer: string
): AsyncGenerator<UnknownRecord[], void, unknown> {
  const listPath =
    envStr('GAME4U_DELIVERIES_LIST_PATH', 'game4u_deliveries_list_path') || '/delivery';
  const pageSize = deliveriesPageSizeFromEnv();
  if (!pageSize) {
    const urlStr = joinUrl(base, listPath);
    console.log('[Game4U] GET', urlStr, '(sem query; Bearer)');
    const parsed = await game4uFetchDeliveryList(urlStr, clientId, bearer, 'delivery');
    console.log(
      '[Game4U]   →',
      parsed.items.length,
      'delivery(ies)',
      parsed.total != null ? `total=${parsed.total}` : ''
    );
    yield parsed.items;
    return;
  }

  const pagination = (
    envStr('GAME4U_DELIVERIES_PAGINATION', 'game4u_deliveries_pagination') || 'page'
  ).toLowerCase();
  const limit = Math.min(Math.max(pageSize, 1), 500);
  const pageQuery =
    envStr('GAME4U_DELIVERIES_PAGE_QUERY_PARAM', 'game4u_deliveries_page_query_param') || 'page';
  const limitQuery =
    envStr('GAME4U_DELIVERIES_LIMIT_QUERY_PARAM', 'game4u_deliveries_limit_query_param') || 'limit';

  if (pagination === 'offset') {
    const offsetParam =
      envStr('GAME4U_DELIVERIES_OFFSET_PARAM', 'game4u_deliveries_offset_param') || 'offset';
    const limitParam =
      envStr('GAME4U_DELIVERIES_LIMIT_PARAM', 'game4u_deliveries_limit_param') || 'limit';
    for (let offset = 0; ; offset += limit) {
      const u = new URL(joinUrl(base, listPath));
      u.searchParams.set(offsetParam, String(offset));
      u.searchParams.set(limitParam, String(limit));
      const urlStr = u.toString();
      console.log('[Game4U] GET', urlStr);
      const parsed = await game4uFetchDeliveryList(urlStr, clientId, bearer, 'delivery');
      console.log('[Game4U]   → offset', offset, '→', parsed.items.length, 'linhas');
      yield parsed.items;
      if (parsed.items.length === 0 || parsed.items.length < limit) {
        break;
      }
    }
    return;
  }

  let pageNum = 1;
  for (let guard = 0; guard < 200000; guard++) {
    const u = new URL(joinUrl(base, listPath));
    u.searchParams.set(pageQuery, String(pageNum));
    u.searchParams.set(limitQuery, String(limit));
    const urlStr = u.toString();
    console.log('[Game4U] GET', urlStr);
    const parsed = await game4uFetchDeliveryList(urlStr, clientId, bearer, 'delivery');
    const tp = parsed.totalPages;
    console.log(
      '[Game4U]   →',
      parsed.items.length,
      'items',
      parsed.total != null ? `total=${parsed.total}` : '',
      tp != null ? `page=${pageNum}/${tp}` : `page=${pageNum}`
    );
    yield parsed.items;
    if (parsed.items.length === 0) {
      break;
    }
    if (tp != null && pageNum >= tp) {
      break;
    }
    if (tp == null && parsed.items.length < limit) {
      break;
    }
    pageNum += 1;
  }
}

async function game4uPutDelivery(
  base: string,
  clientId: string,
  bearer: string,
  id: string,
  body: unknown,
  opts: { quiet: boolean }
): Promise<void> {
  const itemBase =
    (envStr('GAME4U_DELIVERY_ITEM_PATH', 'game4u_delivery_item_path') || '/delivery').replace(/\/+$/, '');
  const url = joinUrl(base, `${itemBase}/${encodeURIComponent(id)}`);
  if (!opts.quiet) {
    console.log('[Game4U] PUT', url);
  }
  if (!bearer || !bearer.trim()) {
    throw new Error('Game4U: token vazio; não é possível PUT delivery.');
  }
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      client_id: clientId,
      Authorization: `Bearer ${bearer.trim()}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Game4U PUT ${itemBase}/${id} ${res.status}: ${text.slice(0, 800)}`);
  }
  const preview = text.length ? text.slice(0, 200) : '(empty body)';
  if (!opts.quiet) {
    console.log(`[Game4U]   ← ${res.status} ${preview}`);
  }
}

/**
 * A API Nest rejeita `id`, `created_at`, `client_id`, etc. no PUT — só o DTO permitido (ex.: `extra`).
 */
function buildDeliveryPutBody(delivery: UnknownRecord, companyFields: CompanyCompleto): UnknownRecord {
  const prevExtra =
    delivery.extra && typeof delivery.extra === 'object' && !Array.isArray(delivery.extra)
      ? (delivery.extra as UnknownRecord)
      : {};
  const extraFields: UnknownRecord = {
    classificacao: companyFields.classificacao,
    cnpj: companyFields.cnpj,
    razao_social: companyFields.razao_social,
    uf: companyFields.uf,
    forma_de_tributacao: companyFields.forma_de_tributacao,
    cliente_em_onboarding: companyFields.cliente_em_onboarding,
    cliente_em_risco: companyFields.cliente_em_risco,
    empId: companyFields.empId
  };
  return { extra: { ...prevExtra, ...extraFields } };
}

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run company-levels:sync -- [options]
  Or step 4 only (reads out/*.json): npm run company-levels:step4 -- [same options]

  (default)          Steps 1–3 only; writes JSON under get-companies-by-level/out/
  --apply-deliveries Step 4: POST admin /auth/login → GET /delivery → PUT /delivery/{id}
  --skip-deliveries  Force skip step 4 even if --apply-deliveries (same as default without --apply)
  --max-puts <n>     Max PUTs (default 1; 0 = sem limite de PUTs)
  --all-puts         Sem limite de PUTs (equiv. max muito alto)
  --max-delivery-pages <n> Parar após n páginas de GET /delivery (teste de paginação)
  --progress-every <n> Log a cada N PUTs com sucesso (default: 200 se env GAME4U_DELIVERIES_PAGE_SIZE>0, senão 1)
  --put-delay-ms <n> Pausa em ms entre PUTs (alivia API/BD em corridas longas)
  --dry-run          Step 4: log planned PUT body, no PUT
  --reuse-json       Read portal + gamificação JSON from out/; skip portal/gamificação GETs
  --out-dir <path>   Output directory (default: regras-de-negocio-scrips/get-companies-by-level/out)

Env — Portal BWA:
  PORTAL_BWA_API_URL, PORTAL_BWA_LOGIN_EMAIL, PORTAL_BWA_LOGIN_PASSWORD
  PORTAL_BWA_EMPRESAS_CURSOR_PARAM (opcional): nome do query param para next_cursor (default: cursor)

Env — Gamificação:
  GAMIFICACAO_API_URL, GAMIFICACAO_API_TOKEN (header x-api-token)

Env — Game4U (step 4):
  G4U_API_BASE or BACKEND_URL_BASE (host da API)
  CLIENT_ID
  Credenciais admin (POST /auth/login, depois Bearer em GET/PUT):
    GAME4U_ADMIN_LOGIN_EMAIL + GAME4U_ADMIN_LOGIN_PASSWORD (preferidos), ou
    G4U_ADMIN_EMAIL + G4U_ADMIN_PASSWORD, ou GAME4U_LOGIN_EMAIL + GAME4U_LOGIN_PASSWORD
  GAME4U_DELIVERIES_LIST_PATH (opcional): GET listagem (default /delivery)
  GAME4U_DELIVERIES_PAGE_SIZE (opcional): limite por página 1–500 (ex. 500); com paginação ativa:
    Por defeito GET ?page=&limit= e resposta { items, total, page, limit, totalPages }
  GAME4U_DELIVERIES_PAGINATION (opcional): page (default) | offset — em offset usa OFFSET_PARAM/LIMIT_PARAM
  GAME4U_DELIVERIES_PAGE_QUERY_PARAM (default page), GAME4U_DELIVERIES_LIMIT_QUERY_PARAM (default limit)
  GAME4U_DELIVERY_ITEM_PATH (opcional): prefixo PUT por id (default /delivery)`);
    process.exit(0);
  }

  const outDir = args.outDir;
  const portalJsonPath = path.join(outDir, 'portal-empresas.json');
  const gamJsonPath = path.join(outDir, 'gamificacao-empresas.json');
  const completoPath = path.join(outDir, 'company-completo.json');

  let portalRaw: UnknownRecord[] = [];
  let gamBody: unknown;

  if (args.reuseJson) {
    const portalFile = readJsonFile<unknown>(portalJsonPath);
    portalRaw = extractArrayFromListResponse(portalFile) as UnknownRecord[];
    gamBody = readJsonFile(gamJsonPath);
    console.log('Reuse-json: portal rows', portalRaw.length);
  } else {
    const portalBase = envStr('PORTAL_BWA_API_URL', 'portal_bwa_api_url');
    const portalEmail = envStr('PORTAL_BWA_LOGIN_EMAIL', 'portal_bwa_login_email');
    const portalPassword = envStr('PORTAL_BWA_LOGIN_PASSWORD', 'portal_bwa_login_password');
    if (!portalBase || !portalEmail || !portalPassword) {
      throw new Error('Missing PORTAL_BWA_API_URL, PORTAL_BWA_LOGIN_EMAIL, PORTAL_BWA_LOGIN_PASSWORD');
    }
    const token = await portalLogin(portalBase, portalEmail, portalPassword);
    console.log('Portal: token OK, fetching companies...');
    portalRaw = await fetchAllPortalCompanies(portalBase, token, 100);
    const portalNormalized = portalRaw.map(normalizePortalCompany).filter(Boolean);
    writeJson(portalJsonPath, portalNormalized);
    console.log('Wrote', portalJsonPath, 'count', portalNormalized.length);

    const gamUrl = envStr('GAMIFICACAO_API_URL', 'gamificacao_api_url');
    const gamToken = envStr('GAMIFICACAO_API_TOKEN', 'gamificacao_api_token');
    if (!gamUrl || !gamToken) {
      throw new Error('Missing GAMIFICACAO_API_URL or GAMIFICACAO_API_TOKEN');
    }
    gamBody = await fetchGamificacao(gamUrl, gamToken);
    writeJson(gamJsonPath, gamBody);
    console.log('Wrote', gamJsonPath);
  }

  const gamRows = extractGamificacaoRows(gamBody);
  const portalForMerge = args.reuseJson
    ? (readJsonFile(portalJsonPath) as UnknownRecord[])
    : (readJsonFile(portalJsonPath) as unknown[]).map(x => x as UnknownRecord);

  const completo = buildCompanyCompleto(portalForMerge, gamRows);
  writeJson(completoPath, completo);
  console.log('Wrote', completoPath, 'merged count', completo.length);

  const runStep4 = args.applyDeliveries && !args.skipDeliveries;
  if (!runStep4) {
    console.log('Step 4 skipped (use --apply-deliveries to run).');
    process.exit(0);
  }

  const g4uBase = envStr('G4U_API_BASE', 'g4u_api_base', 'BACKEND_URL_BASE', 'backend_url_base');
  const clientId = envStr('CLIENT_ID', 'client_id');
  const email = envStr(
    'GAME4U_ADMIN_LOGIN_EMAIL',
    'game4u_admin_login_email',
    'G4U_ADMIN_EMAIL',
    'GAME4U_LOGIN_EMAIL',
    'MIGRATION_G4U_EMAIL'
  );
  const password = envStr(
    'GAME4U_ADMIN_LOGIN_PASSWORD',
    'game4u_admin_login_password',
    'G4U_ADMIN_PASSWORD',
    'GAME4U_LOGIN_PASSWORD',
    'MIGRATION_G4U_PASSWORD'
  );
  if (!g4uBase || !clientId || !email || !password) {
    throw new Error(
      'Step 4: missing G4U_API_BASE/BACKEND_URL_BASE, CLIENT_ID, e credenciais admin (ex.: GAME4U_ADMIN_LOGIN_EMAIL + GAME4U_ADMIN_LOGIN_PASSWORD ou GAME4U_LOGIN_EMAIL + GAME4U_LOGIN_PASSWORD)'
    );
  }

  console.log('[Game4U] POST', joinUrl(g4uBase, '/auth/login'), '| client_id:', clientId, '| admin:', email);
  const bearer = await game4uLogin(g4uBase, clientId, email, password);
  console.log(
    '[Game4U] Login admin OK; Bearer token:',
    bearer.length,
    'caracteres (Authorization em GET /delivery e PUT /delivery/{id})'
  );

  const byEmp = indexCompletoByEmpId(completo);
  const pageSize = deliveriesPageSizeFromEnv();
  const progressEnv = parseInt(envStr('GAME4U_PUT_PROGRESS_EVERY', 'game4u_put_progress_every') || '', 10);
  const progressEvery =
    args.progressEvery > 0
      ? args.progressEvery
      : Number.isFinite(progressEnv) && progressEnv > 0
        ? progressEnv
        : pageSize > 0
          ? 200
          : 1;
  const putDelayMs =
    args.putDelayMs > 0
      ? args.putDelayMs
      : parseInt(envStr('GAME4U_PUT_DELAY_MS', 'game4u_put_delay_ms') || '0', 10) || 0;

  let puts = 0;
  let scanned = 0;
  let skippedNoEmpId = 0;
  let skippedNoMatch = 0;
  let deliveryPagesDone = 0;

  for await (const deliveries of game4uIterateDeliveryPages(g4uBase, clientId, bearer)) {
    deliveryPagesDone += 1;
    if (deliveries.length === 0 && scanned === 0) {
      console.warn(
        '[Game4U] Primeira página vazia. Confira BASE, LIST_PATH e paginação (GAME4U_DELIVERIES_PAGE_SIZE).'
      );
    }
    for (const d of deliveries) {
      const putLimitReached = args.maxPuts > 0 && puts >= args.maxPuts;
      if (putLimitReached) {
        break;
      }
      scanned += 1;
      const id = d.id != null ? String(d.id).trim() : '';
      if (!id) {
        continue;
      }
      const deliveryEmpId = extractGamificacaoEmpIdFromDeliveryKey(id);
      if (!deliveryEmpId) {
        skippedNoEmpId += 1;
        continue;
      }
      const row = findCompletoForDeliveryEmpId(byEmp, deliveryEmpId);
      if (!row) {
        skippedNoMatch += 1;
        continue;
      }
      const payload = buildDeliveryPutBody(d, row);
      const loudPut =
        progressEvery <= 1 ||
        puts === 0 ||
        (puts + 1) % progressEvery === 0;
      const quietPuts = !loudPut;

      if (args.dryRun) {
        const itemBase =
          (envStr('GAME4U_DELIVERY_ITEM_PATH', 'game4u_delivery_item_path') || '/delivery').replace(/\/+$/, '');
        const dryUrl = joinUrl(g4uBase, `${itemBase}/${encodeURIComponent(id)}`);
        if (loudPut) {
          console.log('[dry-run] PUT', dryUrl, JSON.stringify(payload, null, 2).slice(0, 2000));
        }
        puts += 1;
        continue;
      }
      await game4uPutDelivery(g4uBase, clientId, bearer, id, payload, { quiet: quietPuts });
      if (loudPut) {
        console.log('[Game4U] PUT ok', id, 'empId', row.empId, '| total PUTs:', puts + 1);
      }
      puts += 1;
      if (putDelayMs > 0) {
        await sleepMs(putDelayMs);
      }
    }
    const putLimitReachedOuter = args.maxPuts > 0 && puts >= args.maxPuts;
    if (putLimitReachedOuter) {
      break;
    }
    if (args.maxDeliveryPages > 0 && deliveryPagesDone >= args.maxDeliveryPages) {
      console.log('[Game4U] Paragem: --max-delivery-pages', args.maxDeliveryPages);
      break;
    }
    console.log(
      '[Game4U] progresso: página GET',
      deliveryPagesDone,
      '| scanned=',
      scanned,
      'PUTs=',
      puts,
      'sem match empId=',
      skippedNoMatch,
      'id sem competência=',
      skippedNoEmpId
    );
  }

  console.log(
    'Step 4 done. PUTs:',
    puts,
    'scanned:',
    scanned,
    'skipped (sem empId no id):',
    skippedNoEmpId,
    'skipped (sem company-completo):',
    skippedNoMatch
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
