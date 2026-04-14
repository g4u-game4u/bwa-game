#!/usr/bin/env node
/**
 * Runner para api-scripts.config.json — executa um script por vez com logs detalhados.
 *
 * Uso (na raiz do repositório):
 *   node regras-de-negocio-scrips/run-api-scripts.mjs help
 *   node regras-de-negocio-scrips/run-api-scripts.mjs login
 *   node regras-de-negocio-scrips/run-api-scripts.mjs seed-action-templates
 *   node regras-de-negocio-scrips/run-api-scripts.mjs seed-teams-users
 *   node regras-de-negocio-scrips/run-api-scripts.mjs zoho-stages
 *   node regras-de-negocio-scrips/run-api-scripts.mjs zoho-cobranca-stages
 *   node regras-de-negocio-scrips/run-api-scripts.mjs zoho-tasks
 *   node regras-de-negocio-scrips/run-api-scripts.mjs zoho-pipeline-probe
 *   node regras-de-negocio-scrips/run-api-scripts.mjs probe-game-action-process
 *
 * Env (.env na raiz):
 *   G4U_API_BASE (opcional, default do config)
 *   CLIENT_ID ou client_id (opcional, default revisaprev)
 *   G4U_ADMIN_EMAIL, G4U_ADMIN_PASSWORD — login Game4U API
 *   G4U_ACCESS_TOKEN — se já tiver token, pula login
 *   ZOHO_* e ZOHO_MODIFIED_FROM / ZOHO_MODIFIED_TO — fluxos Zoho
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { stdin as stdinIo, stdout as stdoutIo } from 'process';
import { createInterface } from 'readline/promises';
import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
loadDotenv({ path: join(ROOT, '.env') });

const CONFIG_PATH = join(__dirname, 'api-scripts.config.json');
const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const ZOHO_CRM_ACTION_MAP_PATH = join(ROOT, 'src/app/config/zoho-crm-action-map.json');
let zohoCrmActionMapCache = null;

function loadZohoCrmActionMap() {
  if (zohoCrmActionMapCache) return zohoCrmActionMapCache;
  if (!existsSync(ZOHO_CRM_ACTION_MAP_PATH)) {
    console.warn(
      `${colors.yellow}Mapa stage/tag → action template ausente: ${ZOHO_CRM_ACTION_MAP_PATH}${colors.reset}`
    );
    zohoCrmActionMapCache = {
      stageTitleToActionTemplateId: {},
      stageResponsibleTeamOverrides: {},
      tagFlowTitleToActionTemplateId: {}
    };
    return zohoCrmActionMapCache;
  }
  zohoCrmActionMapCache = JSON.parse(readFileSync(ZOHO_CRM_ACTION_MAP_PATH, 'utf8'));
  return zohoCrmActionMapCache;
}

/** action_id: env G4U_ZOHO_STAGE_ACTION_ID (override global) ou chave = novo nome do Stage no Zoho. */
function resolveActionTemplateIdForZohoStage(newStageName, map) {
  const envOverride = process.env.G4U_ZOHO_STAGE_ACTION_ID?.trim();
  if (envOverride) return envOverride;
  const k = String(newStageName || '').trim();
  if (!k) return null;
  return map.stageTitleToActionTemplateId?.[k] ?? null;
}

/** Lookup de utilizador Zoho (Owner, etc.): considera preenchido se tiver id, name ou email. */
function zohoUserLookupFilled(lookup) {
  if (!lookup || typeof lookup !== 'object') return false;
  return Boolean(lookup.id || lookup.name || lookup.email || lookup.Email);
}

function zohoUserLookupEmail(lookup) {
  if (!lookup || typeof lookup !== 'object') return null;
  const e = lookup.email ?? lookup.Email;
  const s = e != null ? String(e).trim() : '';
  return s || null;
}

/** API name no CRM pode variar; cobrir Respons_vel_Jur e Jur_dico_Respons_vel. */
function getZohoJuridicoResponsibleLookup(deal) {
  return deal?.Respons_vel_Jur ?? deal?.Jur_dico_Respons_vel ?? null;
}

/** Deals/search por vezes devolve só o nome (string); GET do registo pode trazer lookup { id, email }. */
function zohoJuridicoResponsiblePresent(jur) {
  if (jur == null) return false;
  if (typeof jur === 'string') return Boolean(String(jur).trim());
  if (typeof jur === 'object') return zohoUserLookupFilled(jur);
  return false;
}

function zohoPickJurLookupFromDealRow(row) {
  if (!row || typeof row !== 'object') return null;
  return row.Respons_vel_Jur ?? row.Jur_dico_Respons_vel ?? null;
}

async function zohoGetDealRowCached(dealId, oauthToken, fields, cacheMap) {
  const key = String(dealId);
  if (cacheMap.has(key)) return cacheMap.get(key);
  const url = `${ZOHO_CRM_API_BASE}/crm/v8/Deals/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`;
  await sleep(55);
  const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${oauthToken}` } });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    cacheMap.set(key, null);
    return null;
  }
  const row = Array.isArray(j?.data) ? j.data[0] : j?.data ?? null;
  cacheMap.set(key, row);
  return row;
}

async function zohoResolveJuridicoResponsibleEmail(
  jur,
  dealId,
  oauthToken,
  zohoUserEmailCache,
  dealRowCache,
  taskActivityForOwnerFallback
) {
  let lookup = jur;
  if (typeof jur === 'string' && String(jur).trim()) {
    const full = await zohoGetDealRowCached(
      dealId,
      oauthToken,
      'Respons_vel_Jur,Jur_dico_Respons_vel',
      dealRowCache
    );
    const expanded = zohoPickJurLookupFromDealRow(full);
    if (expanded && typeof expanded === 'object') lookup = expanded;
  }
  if (lookup && typeof lookup === 'object') {
    return zohoResolveUserEmailFromLookup(lookup, oauthToken, zohoUserEmailCache);
  }
  if (typeof jur === 'string' && String(jur).trim()) {
    const fb =
      process.env.G4U_ZOHO_JUR_STRING_FALLBACK_EMAIL?.trim() ||
      process.env.G4U_ZOHO_FALLBACK_USER_EMAIL?.trim() ||
      null;
    if (fb) return fb;
    const taskOwner = taskActivityForOwnerFallback?.Owner;
    if (taskOwner && typeof taskOwner === 'object') {
      const fromTask = await zohoResolveUserEmailFromLookup(taskOwner, oauthToken, zohoUserEmailCache);
      if (fromTask) return fromTask;
    }
    console.warn(
      `${colors.yellow}deal ${dealId}: Jurídico veio como texto e GET do deal não devolveu lookup com id — use Owner da task, env G4U_ZOHO_JUR_STRING_FALLBACK_EMAIL ou campo utilizador no CRM.${colors.reset}`
    );
  }
  return null;
}

function normalizeZohoPicklistLabel(s) {
  return String(s ?? '')
    .trim()
    .normalize('NFC');
}

/** Deals/search pode devolver Pipeline como string ou como objeto (name, display_value, …). */
function zohoPicklistDisplayString(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (typeof raw === 'object') {
    const s =
      raw.name ??
      raw.display_value ??
      raw.displayValue ??
      raw.reference_value ??
      raw.actual_value ??
      raw.value;
    if (s != null) return String(s).trim();
  }
  return '';
}

function getZohoDealPipelineName(deal) {
  return normalizeZohoPicklistLabel(zohoPicklistDisplayString(deal?.Pipeline));
}

/** Rótulo do layout no body do deal (para conferir com critério Layout.display_label). */
function getZohoDealLayoutDisplayLabel(deal) {
  const L = deal?.Layout;
  if (L == null) return '';
  if (typeof L === 'string' || typeof L === 'number') {
    return normalizeZohoPicklistLabel(L);
  }
  if (typeof L === 'object') {
    const raw =
      L.display_label ??
      L.displayLabel ??
      L.name ??
      zohoPicklistDisplayString(L);
    return normalizeZohoPicklistLabel(raw);
  }
  return '';
}

/** Concessão/Cobrança exigem lookup financeiro; Qualidade não (só CS). */
function dealRequiresFinanceiroLookupForStagePost(deal) {
  const pipe = getZohoDealPipelineName(deal);
  const m = cfg.zoho.dealsSearch?.pipelineFilter?.requireFinanceiroLookupForStagePostByPipeline;
  if (!m || typeof m !== 'object') return true;
  if (!pipe) return true;
  if (Object.prototype.hasOwnProperty.call(m, pipe)) return Boolean(m[pipe]);
  for (const k of Object.keys(m)) {
    if (normalizeZohoPicklistLabel(k) === pipe) return Boolean(m[k]);
  }
  return true;
}

/** Pipelines em que o POST por stage usa sempre e-mail do Owner (ignora stages financeiros do mapa). */
function stagePostUsesOwnerEmailOnlyPipeline(deal) {
  const pipe = getZohoDealPipelineName(deal);
  const list = cfg.zoho.dealsSearch?.pipelineFilter?.stagePostUsesOwnerEmailOnlyPipelines;
  if (!Array.isArray(list) || !pipe) return false;
  return list.some((x) => normalizeZohoPicklistLabel(x) === pipe);
}

/**
 * cs → Owner (CS); financeiro → Financeiro_Respons_vel.
 * @returns {'cs'|'financeiro'}
 */
function resolveResponsibleTeamForZohoStage(newStageName, map, deal) {
  if (deal && stagePostUsesOwnerEmailOnlyPipeline(deal)) return 'cs';
  const k = String(newStageName || '').trim();
  const o = map.stageResponsibleTeamOverrides?.[k];
  if (o === 'financeiro' || o === 'cs') return o;
  return 'cs';
}

function isGameActionProcessResponseOk(apiRes) {
  if (!apiRes?.ok || !apiRes.json || typeof apiRes.json !== 'object') return false;
  return apiRes.json.error !== true;
}

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(section, msg, data) {
  console.log(`\n${colors.cyan}━━ ${section} ━━${colors.reset}`);
  if (msg) console.log(msg);
  if (data !== undefined) dump(data);
}

function dump(obj, maxLen = 12000) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  if (s.length > maxLen) {
    console.log(s.slice(0, maxLen) + `\n${colors.dim}… [truncado ${s.length - maxLen} chars]${colors.reset}`);
  } else {
    console.log(s);
  }
}

/** Aviso explícito após cada operação (timestamp + progresso). */
function announceDone(index, total, title, statusOk, statusCode, snippet) {
  const ts = new Date().toISOString();
  const mark = statusOk ? colors.green : colors.red;
  console.log(
    `\n${mark}▶▶ [${index}/${total}] Fim da operação — ${ts}${colors.reset}\n` +
      `   ${title} → HTTP ${statusCode} ${statusOk ? 'OK' : 'FALHOU'}`
  );
  if (snippet !== undefined && snippet !== null) {
    console.log(colors.dim + '   Resposta (trecho):' + colors.reset);
    dump(snippet, 1500);
  }
}

async function maybePauseBetweenOps(argv) {
  if (!argv.includes('--pause')) return;
  const rl = createInterface({ input: stdinIo, output: stdoutIo });
  await rl.question(`${colors.yellow}[pause] Enter para próxima operação…${colors.reset} `);
  rl.close();
}

function getBaseUrl() {
  const u = process.env[cfg.api.baseUrlEnv] || cfg.api.baseUrl;
  return u.replace(/\/$/, '');
}

function getClientId() {
  for (const k of cfg.api.clientIdEnvKeys || []) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return cfg.api.clientIdDefault || 'revisaprev';
}

let cachedToken = process.env.G4U_ACCESS_TOKEN?.trim() || null;

async function game4uFetch(path, { method = 'GET', body, token } = {}) {
  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    client_id: getClientId(),
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  const t = token ?? cachedToken;
  if (t) headers.Authorization = `Bearer ${t}`;

  const init = { method, headers };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  const location = res.headers.get('Location') || res.headers.get('location') || null;
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    json,
    raw: text,
    location
  };
}

/** Resposta da API ao tentar PENDING com entrega/atividade em CANCELLED. */
function game4uIsCancelledToPendingTransitionError(apiRes) {
  const parts = [];
  if (apiRes?.json != null) {
    parts.push(
      typeof apiRes.json === 'string' ? apiRes.json : JSON.stringify(apiRes.json)
    );
  }
  if (apiRes?.raw) parts.push(String(apiRes.raw));
  return /state transition from cancelled to pending not found/i.test(parts.join('\n'));
}

async function game4uPostDeliveryRestore(deliveryId, userEmail) {
  const em =
    (userEmail && String(userEmail).trim()) ||
    process.env.G4U_ZOHO_FALLBACK_USER_EMAIL?.trim() ||
    '';
  if (!em) {
    return {
      ok: false,
      status: 0,
      json: {
        message:
          'game4uPostDeliveryRestore: falta user_email no payload e env G4U_ZOHO_FALLBACK_USER_EMAIL'
      },
      raw: ''
    };
  }
  const path = `/game/delivery/${encodeURIComponent(String(deliveryId))}/restore`;
  return game4uFetch(path, { method: 'POST', body: { user_email: em } });
}

/**
 * POST /game/action/process; enquanto a resposta for "CANCELLED to PENDING", restore da delivery e nova tentativa.
 * Limite: env G4U_ZOHO_CANCELLED_PENDING_RESTORE_MAX (default 10, máx. 20).
 */
async function game4uActionProcessWithRestoreOnCancelledPending(path, method, body) {
  const rawMax = parseInt(process.env.G4U_ZOHO_CANCELLED_PENDING_RESTORE_MAX?.trim() || '10', 10);
  const maxRestoreCycles = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(rawMax, 20) : 10;
  const deliveryId = body?.delivery_id;

  let pr = await game4uFetch(path, { method, body });
  let cycle = 0;

  while (
    !isGameActionProcessResponseOk(pr) &&
    game4uIsCancelledToPendingTransitionError(pr) &&
    deliveryId != null &&
    deliveryId !== '' &&
    cycle < maxRestoreCycles
  ) {
    cycle += 1;
    console.warn(
      `${colors.yellow}game/action/process: CANCELLED→PENDING (ciclo ${cycle}/${maxRestoreCycles}) — ` +
        `POST /game/delivery/${deliveryId}/restore e nova tentativa.${colors.reset}`
    );
    const rs = await game4uPostDeliveryRestore(deliveryId, body?.user_email);
    log(
      `POST /game/delivery/${deliveryId}/restore (ciclo ${cycle})`,
      `status ${rs.status}`,
      rs.json
    );
    await sleep(100 + Math.min(cycle * 40, 400));
    pr = await game4uFetch(path, { method, body });
  }

  return pr;
}

function buildZohoStableIntegrationId(dealId, actionTemplateId) {
  return `zoho-deal-${dealId}-action-${actionTemplateId}`;
}

/** integration_id estável por deal + template (fluxo Jurídico / tags). */
function buildZohoJurStableIntegrationId(dealId, actionTemplateId) {
  return `zoho-deal-${dealId}-jur-action-${actionTemplateId}`;
}

function unwrapGame4uUserActionSearchItems(apiRes) {
  const j = apiRes?.json;
  if (!j) return [];
  if (Array.isArray(j.items)) return j.items;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

function buildGame4uUserActionSearchQuery(deliveryId, status, opts = {}) {
  const c = cfg.game4uUserActionSearch || {};
  const path = c.path || '/user-action/search';
  const envLim = process.env.G4U_USER_ACTION_SEARCH_LIMIT?.trim();
  const baseLimit = Number(c.defaultLimit) || 100;
  const parsedEnv = envLim ? parseInt(envLim, 10) : NaN;
  let limit =
    opts.limit != null && Number(opts.limit) > 0
      ? Number(opts.limit)
      : Number.isFinite(parsedEnv) && parsedEnv > 0
        ? parsedEnv
        : baseLimit;
  limit = Math.min(Math.max(limit, 1), 500);
  const start = c.createdAtStartDefault || '2000-01-01T00:00:00.000Z';
  const end = new Date().toISOString();
  const page = opts.page != null ? String(opts.page) : '1';
  const dismissed =
    opts.dismissed !== undefined && opts.dismissed !== null ? String(opts.dismissed) : 'false';
  const qs = new URLSearchParams({
    created_at_start: start,
    created_at_end: end,
    dismissed,
    limit: String(limit),
    status: String(status || 'PENDING')
  });
  if (deliveryId && c.filterByDeliveryId !== false) {
    qs.set('delivery_id', String(deliveryId));
  }
  if (opts.pageToken) {
    qs.set('page_token', String(opts.pageToken));
  } else {
    qs.set('page', page);
  }
  return { path: `${path}?${qs.toString()}`, limit };
}

/**
 * Todas as páginas de /user-action/search para um delivery+status (evita perder linhas além do limit).
 * Respeita G4U_USER_ACTION_SEARCH_MAX_PAGES (default 80).
 */
async function game4uFetchUserActionSearchAllItems(deliveryId, status, opts = {}) {
  const maxPages = Math.min(
    Math.max(parseInt(process.env.G4U_USER_ACTION_SEARCH_MAX_PAGES?.trim() || '80', 10), 1),
    200
  );
  const all = [];
  let page = 1;
  let pageToken = null;
  let lastRes = { ok: false, status: 0, json: null };

  for (let iter = 0; iter < maxPages; iter++) {
    const { path, limit } = buildGame4uUserActionSearchQuery(deliveryId, status, {
      ...opts,
      page,
      pageToken
    });
    const r = await game4uFetch(path);
    lastRes = r;
    const j = r.json;
    const chunk = unwrapGame4uUserActionSearchItems(r);
    all.push(...chunk);

    const nextTok =
      j && typeof j === 'object'
        ? j.next_page_token ?? j.nextPageToken ?? j.Next_Page_Token ?? null
        : null;
    if (nextTok) {
      pageToken = String(nextTok);
      continue;
    }
    pageToken = null;

    const totalPages = j?.total_pages ?? j?.totalPages;
    const curPage = typeof j?.page === 'number' ? j.page : page;
    if (typeof totalPages === 'number' && typeof curPage === 'number' && curPage < totalPages) {
      page = curPage + 1;
      continue;
    }

    if (!chunk.length || chunk.length < limit) {
      break;
    }
    page += 1;
  }

  return { items: all, lastRes };
}

async function game4uFetchPendingUserActionsForDelivery(deliveryId) {
  const { path } = buildGame4uUserActionSearchQuery(deliveryId, 'PENDING');
  return game4uFetch(path);
}

/**
 * Junta PENDING + CANCELLED (e opcionalmente outros) para achar created_at ao fechar estágio (DONE).
 * Env G4U_USER_ACTION_DONE_LOOKUP_STATUSES=CANCELLED (default junta PENDING+CANCELLED).
 */
async function game4uFetchUserActionsForDoneLookup(deliveryId) {
  const extra = String(process.env.G4U_USER_ACTION_DONE_LOOKUP_STATUSES || 'CANCELLED')
    .split(/[,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const want = new Set(['PENDING', ...extra]);
  const includeDismissed =
    String(process.env.G4U_USER_ACTION_DONE_LOOKUP_INCLUDE_DISMISSED || '')
      .trim()
      .match(/^(1|true|yes)$/i) != null;

  const mergedById = new Map();
  let lastOk = false;
  let lastStatus = 0;

  async function mergeStatusPages(st, dismissedFlag) {
    const { items, lastRes } = await game4uFetchUserActionSearchAllItems(deliveryId, st, {
      dismissed: dismissedFlag
    });
    if (lastRes.ok) lastOk = true;
    lastStatus = lastRes.status;
    for (const it of items) {
      if (it?.id != null && String(it.id).trim()) {
        mergedById.set(String(it.id), it);
      } else {
        const k = `${it?.integration_id ?? ''}|${it?.action_template_id ?? it?.action_id ?? ''}|${it?.created_at ?? ''}`;
        mergedById.set(k, it);
      }
    }
  }

  for (const st of want) {
    await mergeStatusPages(st, 'false');
    if (includeDismissed) {
      await mergeStatusPages(st, 'true');
    }
  }

  return {
    ok: lastOk,
    status: lastStatus,
    json: { items: [...mergedById.values()] }
  };
}

function findPendingUserActionToClose(items, deliveryId, stableIntegrationId, actionTemplateId) {
  const did = String(deliveryId);
  const tid = String(actionTemplateId);
  const narrowed = items.filter((it) => String(it.delivery_id) === did);
  const matchesTemplate = (it) => String(it.action_template_id || it.action_id || '') === tid;

  const exact = narrowed.find(
    (it) => String(it.integration_id) === String(stableIntegrationId) && matchesTemplate(it)
  );
  if (exact) return exact;

  const pool = narrowed.filter(matchesTemplate);
  if (!pool.length) return null;

  const dealPrefix = `zoho-deal-${did}-`;
  const scored = pool.map((it) => {
    const integ = String(it.integration_id || '');
    const legacyTimeline = integ.startsWith(dealPrefix) && integ.includes('-timeline-');
    const t = Date.parse(String(it.created_at || ''));
    const ts = Number.isFinite(t) ? t : 0;
    return { it, legacyTimeline, ts };
  });
  scored.sort((a, b) => {
    if (a.legacyTimeline !== b.legacyTimeline) return a.legacyTimeline ? -1 : 1;
    return b.ts - a.ts;
  });
  return scored[0].it;
}

function stageNameCompletesDelivery(stageName) {
  const list = cfg.zoho?.stagesThatCompleteDelivery;
  if (!Array.isArray(list) || !stageName) return false;
  const n = normalizeZohoPicklistLabel(stageName);
  return list.some((s) => normalizeZohoPicklistLabel(s) === n);
}

/** Se /user-action/search não devolver created_at, usar audited_time da transição (Stage old mapeado = concluído). */
function zohoStageDoneAllowAuditedWhenSearchMiss() {
  const e = String(process.env.G4U_ZOHO_STAGE_DONE_USE_AUDITED_WHEN_SEARCH_MISS || '').trim().toLowerCase();
  if (e === '0' || e === 'false' || e === 'no') return false;
  const c = cfg.zoho?.stagePostToGame4u?.allowDoneUsingAuditedWhenSearchMiss;
  if (c === false) return false;
  return true;
}

async function game4uPostDeliveryCompleteIfConfigured(deliveryId, finishedAt) {
  const gc = cfg.gameDeliveryComplete || {};
  const tmpl = gc.pathTemplate || '/game/delivery/{{deliveryId}}/complete';
  const path = tmpl.replace('{{deliveryId}}', encodeURIComponent(String(deliveryId)));
  const method = gc.method || 'POST';
  return game4uFetch(path, { method, body: { finished_at: finishedAt } });
}

function mapZohoTaskStatusToGame4uStatus(rawStatus) {
  const s = String(rawStatus ?? '').trim();
  if (!s) return 'PENDING';
  const table = cfg.zoho?.jurActivitiesFromZoho?.zohoTaskStatusToGame4uStatus;
  if (table && typeof table === 'object') {
    if (Object.prototype.hasOwnProperty.call(table, s)) return table[s];
    for (const [k, v] of Object.entries(table)) {
      if (k.toLowerCase() === s.toLowerCase()) return v;
    }
  }
  if (/conclu|done|complet|fechad|closed/i.test(s)) return 'DONE';
  return 'PENDING';
}

function extractZohoActivitiesChronologicalList(json) {
  if (!json || typeof json !== 'object') return [];
  if (Array.isArray(json.data)) return json.data;
  for (const v of Object.values(json)) {
    if (!Array.isArray(v) || !v.length) continue;
    const el = v[0];
    if (
      el &&
      typeof el === 'object' &&
      (el.Subject != null || el.subject != null || el.Status != null || el.status != null)
    ) {
      return v;
    }
  }
  return [];
}

function zohoActivityTaskStatus(activity) {
  if (!activity || typeof activity !== 'object') return '';
  const cands = [
    activity.Status,
    activity.status,
    activity.Task_Status,
    activity.task_status,
    activity.$status,
    activity.Task_Info?.Status
  ];
  for (const c of cands) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return '';
}

/**
 * Correspondência tag do mapa ↔ atividade Zoho: texto completo no JSON, ou sufixo "Tag: …" / título antes de "- Tag:"
 * alinhado ao campo Subject (ex.: Subject "Análise Inicial imediata" ↔ Tag: Análise Inicial).
 */
function zohoActivityMatchesTagFlowKey(activity, tagFlowKey) {
  if (!activity || !tagFlowKey) return false;
  const blob = JSON.stringify(activity);
  if (blob.includes(tagFlowKey)) return true;
  const subj = String(activity.Subject ?? activity.subject ?? '').trim();
  if (!subj) return false;
  const subjl = subj.toLowerCase();
  const tagM = String(tagFlowKey).match(/Tag:\s*(.+)$/i);
  if (tagM) {
    const label = tagM[1].trim();
    if (label.length >= 2 && subjl.includes(label.toLowerCase())) return true;
  }
  const beforeTag = String(tagFlowKey).split(/\s*-\s*Tag:/i)[0].replace(/^\*\s*/, '').trim();
  if (beforeTag.length >= 5 && subjl.includes(beforeTag.toLowerCase())) return true;
  return false;
}

/** Ordenação estável entre atividades (Modified → Created). */
function zohoActivitySortTimeMs(activity) {
  if (!activity || typeof activity !== 'object') return 0;
  const raw =
    activity.Modified_Time ||
    activity.modified_time ||
    activity.Created_Time ||
    activity.created_time ||
    '';
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : 0;
}

/** Texto após "Tag: …" (ou a chave inteira) para desempate de especificidade. */
function zohoTagFlowLabelForSort(tagFlowKey) {
  const m = String(tagFlowKey).match(/Tag:\s*(.+)$/i);
  return m ? m[1].trim() : String(tagFlowKey).trim();
}

/**
 * Uma atividade pode casar com várias chaves (ex.: label "Protocolo" dentro de Subject
 * "Agendar Protocolo"). Prioriza o maior comprimento do texto "Tag: …" e, em empate, a
 * chave completa — evita escolher "Protocolo" quando existe "Agendar Protocolo".
 */
function zohoBestTagMatchForActivity(activity, map) {
  const tagMap = map.tagFlowTitleToActionTemplateId || {};
  let bestKey = null;
  let bestActionId = null;
  let bestLabelLen = -1;
  let bestKeyLen = -1;
  for (const [tagFlowKey, actionId] of Object.entries(tagMap)) {
    if (!zohoActivityMatchesTagFlowKey(activity, tagFlowKey)) continue;
    const labelLen = zohoTagFlowLabelForSort(tagFlowKey).length;
    const keyLen = String(tagFlowKey).length;
    if (labelLen > bestLabelLen || (labelLen === bestLabelLen && keyLen > bestKeyLen)) {
      bestLabelLen = labelLen;
      bestKeyLen = keyLen;
      bestKey = tagFlowKey;
      bestActionId = actionId;
    }
  }
  if (!bestKey || bestActionId == null) return null;
  return { tagFlowKey: bestKey, actionId: String(bestActionId) };
}

function zohoActivityDedupeKey(activity, indexInList) {
  if (activity?.id != null && String(activity.id).trim()) return `id:${String(activity.id)}`;
  return `idx:${indexInList}`;
}

/**
 * Para cada action_template_id em tagFlowTitleToActionTemplateId, a atividade mais recente
 * cuja melhor correspondência de tag (mais específica) é exatamente esse template.
 * Evita perder tags quando a última atividade global casa só com outro template; evita
 * dois POSTs para a mesma tarefa Zoho por colisão "Protocolo" vs "Agendar Protocolo".
 */
function findLatestActivitiesPerJurActionTemplate(activityList, map) {
  const tagMap = map.tagFlowTitleToActionTemplateId || {};
  const keysByAction = new Map();
  for (const [tagFlowKey, actionId] of Object.entries(tagMap)) {
    const aid = String(actionId);
    if (!keysByAction.has(aid)) keysByAction.set(aid, []);
    keysByAction.get(aid).push(tagFlowKey);
  }
  for (const keys of keysByAction.values()) {
    keys.sort((a, b) => b.length - a.length);
  }
  if (!Array.isArray(activityList) || !keysByAction.size) return [];

  const bestByActivity = new Map();
  for (let i = 0; i < activityList.length; i++) {
    const a = activityList[i];
    if (!a || typeof a !== 'object') continue;
    const bm = zohoBestTagMatchForActivity(a, map);
    if (bm) bestByActivity.set(zohoActivityDedupeKey(a, i), bm);
  }

  const hits = [];
  for (const [actionId] of keysByAction) {
    let activity = null;
    let tagFlowKey = null;
    for (let i = activityList.length - 1; i >= 0; i--) {
      const a = activityList[i];
      if (!a || typeof a !== 'object') continue;
      const bm = bestByActivity.get(zohoActivityDedupeKey(a, i));
      if (!bm || bm.actionId !== String(actionId)) continue;
      activity = a;
      tagFlowKey = bm.tagFlowKey;
      break;
    }
    if (activity && tagFlowKey) hits.push({ activity, tagFlowKey, actionId });
  }
  hits.sort((x, y) => zohoActivitySortTimeMs(x.activity) - zohoActivitySortTimeMs(y.activity));
  return hits;
}

function isFinanceStageName(stageName, map, deal) {
  return resolveResponsibleTeamForZohoStage(stageName, map, deal) === 'financeiro';
}

function financeStageEligibleForDeal(deal) {
  if (zohoUserLookupFilled(deal.Financeiro_Respons_vel)) return true;
  if (zohoAllowMissingFinanceiroForStagePost() && zohoFinanceiroStageFallbackToOwnerEmail()) return true;
  return false;
}

async function resolveEmailForZohoStageTeam(stageName, deal, map, token, zohoUserEmailCache) {
  const team = resolveResponsibleTeamForZohoStage(stageName, map, deal);
  const primaryLookup = team === 'financeiro' ? deal.Financeiro_Respons_vel : deal.Owner;
  let resolvedEmail = await zohoResolveUserEmailFromLookup(primaryLookup, token, zohoUserEmailCache);
  if (!resolvedEmail && team === 'financeiro' && zohoFinanceiroStageFallbackToOwnerEmail()) {
    resolvedEmail = await zohoResolveUserEmailFromLookup(deal.Owner, token, zohoUserEmailCache);
  }
  if (!resolvedEmail) {
    const fb = process.env.G4U_ZOHO_FALLBACK_USER_EMAIL?.trim();
    if (fb) resolvedEmail = fb;
  }
  return resolvedEmail;
}

/**
 * Payload POST /game/action/process — PENDING (abrir) ou DONE (fechar estágio anterior).
 * integration_id estável: zoho-deal-{dealId}-action-{actionTemplateId}
 */
function buildGameProcessPayloadZohoStageProcess({
  deal,
  actionId,
  userEmail,
  status,
  integrationId,
  createdAt,
  finishedAt,
  oldVal,
  newVal,
  audited,
  integrationComment,
  dismissed
}) {
  const email =
    (typeof userEmail === 'string' && userEmail.trim()) ||
    process.env.G4U_ZOHO_FALLBACK_USER_EMAIL?.trim() ||
    null;
  const msg =
    integrationComment ||
    (status === 'PENDING'
      ? `Zoho CRM: Stage "${oldVal ?? ''}" → "${newVal ?? ''}"`
      : '');
  const comments = msg
    ? [
        {
          id: 0,
          message: msg,
          created_by: 'zoho-crm',
          created_at: audited,
          type: 'integration'
        }
      ]
    : [];
  const payload = {
    status,
    user_email: email,
    action_id: actionId,
    delivery_id: String(deal.id),
    delivery_title: String(deal.Deal_Name || '').trim() || `Deal ${deal.id}`,
    created_at: createdAt || audited,
    integration_id: integrationId,
    comments,
    approved: false,
    approved_by: null,
    dismissed: dismissed === true
  };
  if (status === 'DONE' && finishedAt) payload.finished_at = finishedAt;
  return payload;
}

function userIdFromLocation(loc) {
  if (!loc) return null;
  const s = String(loc);
  const m =
    s.match(/\/user\/([0-9a-f-]{36})/i) ||
    s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

/** Corpo único de usuário (ex.: POST /user com `data`/`user` embrulhando o registro). */
function unwrapUserJson(json) {
  if (!json || typeof json !== 'object') return null;
  return json.data ?? json.user ?? json;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectSeedEmailsFromConfig() {
  const raw = [];
  const phases = cfg.seedUsersOrdered?.phases || [];
  for (const ph of phases) {
    if (Array.isArray(ph.users)) {
      for (const u of ph.users) {
        if (u?.email) raw.push(String(u.email).trim().toLowerCase());
      }
    }
    if (ph.phase === 'assign_team_leaders' && Array.isArray(ph.items)) {
      for (const it of ph.items) {
        if (it?.leaderEmail) raw.push(String(it.leaderEmail).trim().toLowerCase());
      }
    }
  }
  return [...new Set(raw)];
}

function getSupabaseUrl() {
  const u = process.env.SUPABASE_URL?.trim();
  return u ? u.replace(/\/$/, '') : '';
}

function getSupabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  );
}

/** Remove usuários do Auth cujo e-mail está no seed (não remove G4U_ADMIN_EMAIL). */
async function deleteSupabaseAuthUsersForSeed(argv) {
  const dry = argv.includes('--dry-run');
  const base = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!base || !key) {
    throw new Error(
      'Para --reset-supabase-auth defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_SECRET (ou SUPABASE_SERVICE_ROLE_KEY)'
    );
  }
  let targets = new Set(collectSeedEmailsFromConfig());
  const adminLogin = process.env.G4U_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminLogin) targets.delete(adminLogin);

  log(
    'reset-supabase-auth',
    `${dry ? '[dry-run] ' : ''}Alvo: ${targets.size} e-mails (exceto admin login).`
  );

  let page = 1;
  const perPage = 200;
  let deleted = 0;
  while (page < 500) {
    const url = `${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const text = await r.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { _raw: text };
    }
    if (!r.ok) {
      log('Supabase admin users', `status ${r.status}`, json);
      throw new Error(`Listagem Auth admin falhou: ${r.status}`);
    }
    const users = Array.isArray(json.users) ? json.users : [];
    if (!users.length) break;

    for (const u of users) {
      const em = String(u.email || '').toLowerCase();
      if (!em || !targets.has(em)) continue;
      if (dry) {
        console.log(`${colors.dim}[dry-run] DELETE Auth ${em} (${u.id})${colors.reset}`);
        continue;
      }
      const dr = await fetch(`${base}/auth/v1/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      if (dr.ok || dr.status === 204) {
        deleted++;
        log('Supabase DELETE user', em, { id: u.id, status: dr.status });
      } else {
        const t = await dr.text();
        let j2;
        try {
          j2 = JSON.parse(t);
        } catch {
          j2 = t;
        }
        console.error(`${colors.red}Falha DELETE Auth ${em}${colors.reset}`, j2);
      }
      await sleep(150);
    }

    if (users.length < perPage) break;
    page++;
    await sleep(200);
  }

  log('reset-supabase-auth', dry ? 'Nada removido (dry-run).' : `Removidos: ${deleted} (Auth).`);
}

/** UUID do perfil Game4U do token atual (admin) — usado como leader_id inicial dos times. */
async function getBootstrapLeaderIdFromAuthUser() {
  const r = await game4uFetch('/auth/user');
  log('GET /auth/user', `status ${r.status}`, r.json);
  if (!r.ok) {
    throw new Error(`GET /auth/user falhou (${r.status}). Use um token de usuário que exista na tabela user do Game4U.`);
  }
  const j = r.json;
  const id = j?.id || j?.user?.id || j?.data?.id || j?.user_id;
  if (!id) {
    throw new Error(
      'GET /auth/user não retornou id. O admin precisa ter registro na API /user para usar como líder temporário dos times.'
    );
  }
  return id;
}

async function updateTeamLeaderSafe(teamId, leaderId, { opIndex, opTotal, title, argv }) {
  const r = await game4uFetch(`/team/${encodeURIComponent(teamId)}`, {
    method: 'PUT',
    body: { leader_id: leaderId }
  });
  log(`${title || 'PUT /team'}`, `status ${r.status}`, r.json);
  announceDone(opIndex, opTotal, title || `PUT /team/${teamId}`, r.ok, r.status, r.json);
  await maybePauseBetweenOps(argv);
  return r.ok;
}

async function loadAllUsersFromApi() {
  const r = await game4uFetch('/user');
  if (!r.ok) return [];
  const j = r.json;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.items)) return j.items;
  if (Array.isArray(j?.data)) return j.data;
  return [];
}

/** Alguns ambientes não populam GET /user; lista via /user/search paginado. */
async function loadUsersViaSearchPaginated({ maxPages = 30 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      page: String(page),
      limit: '100',
      use_pagination: 'true'
    });
    const r = await game4uFetch(`/user/search?${q}`);
    if (!r.ok) break;
    const items = r.json?.items || r.json?.data?.items;
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    const totalPages = parseInt(String(r.json?.totalPages ?? '1'), 10);
    if (Number.isFinite(totalPages) && page >= totalPages) break;
  }
  return all;
}

function userRecordEmailNorm(u) {
  const raw = u?.email ?? u?.user_email ?? u?.userEmail ?? '';
  return String(raw).trim().toLowerCase();
}

/** Normaliza texto para comparar nomes Zoho ↔ Game4U (acentos, vírgulas, espaços). */
function normalizePersonNameForMatch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Assinatura independente da ordem "Nome Sobrenome" vs "Sobrenome, Nome". */
function personNameMatchSignature(s) {
  const n = normalizePersonNameForMatch(s);
  if (!n) return '';
  const stop = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return n
    .split(' ')
    .filter((t) => t.length > 0 && !stop.has(t))
    .sort()
    .join(' ');
}

/** Zoho por vezes traz login tipo michelle.franco em vez do nome completo. */
function coerceZohoUserLabelForNameMatch(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes('@')) s = s.split('@')[0].trim();
  if (/^[a-z0-9._-]+$/i.test(s) && /[._-]/.test(s)) {
    s = s.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return s;
}

function game4uUserDisplayName(u) {
  if (!u || typeof u !== 'object') return '';
  const fn = u.full_name ?? u.fullName ?? u.name ?? u.display_name ?? u.displayName;
  if (fn && String(fn).trim()) return String(fn).trim();
  const parts = [u.first_name ?? u.firstName, u.last_name ?? u.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return '';
}

function extractGame4uUserTeamIds(u) {
  if (!u || typeof u !== 'object') return [];
  const out = [];
  if (u.team_id != null && String(u.team_id).trim()) out.push(String(u.team_id).trim());
  if (u.teamId != null && String(u.teamId).trim()) out.push(String(u.teamId).trim());
  const teams = u.teams ?? u.team;
  if (Array.isArray(teams)) {
    for (const t of teams) {
      if (typeof t === 'string' && t.trim()) out.push(t.trim());
      else if (t && typeof t === 'object') {
        const id = t.id ?? t._id ?? t.team_id;
        if (id != null && String(id).trim()) out.push(String(id).trim());
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Índice full_name (G4U) ↔ e-mail. Prioriza utilizadores do time "Financeiro" (config teamsDefinition).
 * G4U_ZOHO_FINANCEIRO_NAME_MATCH_ALL_TEAMS=0 — só o time Financeiro.
 */
async function buildGame4uZohoDisplayNameEmailResolver() {
  let users = await loadAllUsersFromApi();
  if (!users.length) users = await loadUsersViaSearchPaginated({ maxPages: 50 });
  const teamNameToId = await loadTeamNameToId();
  const finDef = cfg.teamsDefinition?.find((t) => t.key === 'financeiro');
  const financeiroTeamId = finDef?.apiTeamName ? teamNameToId.get(finDef.apiTeamName) : null;

  const bySigFinance = new Map();
  const bySigAll = new Map();

  function addToMap(map, sig, email) {
    if (!sig || !email) return;
    const em = String(email).trim().toLowerCase();
    if (!em) return;
    if (!map.has(sig)) map.set(sig, []);
    map.get(sig).push(em);
  }

  for (const u of users) {
    const dn = game4uUserDisplayName(u);
    const em = userRecordEmailNorm(u);
    if (!dn || !em) continue;
    const sig = personNameMatchSignature(dn);
    if (!sig) continue;
    addToMap(bySigAll, sig, em);
    const tids = extractGame4uUserTeamIds(u);
    if (financeiroTeamId && tids.includes(String(financeiroTeamId))) {
      addToMap(bySigFinance, sig, em);
    }
  }

  function pickUnique(sig, bucket, label) {
    const arr = bucket.get(sig);
    if (!arr?.length) return null;
    const uniq = [...new Set(arr)];
    if (uniq.length === 1) return uniq[0];
    console.warn(
      `${colors.yellow}Match nome → e-mail (${label}): assinatura "${sig}" é ambígua (${uniq.length} e-mails).${colors.reset}`
    );
    return null;
  }

  const allowAllTeams = !['0', 'false', 'off', 'no'].includes(
    String(process.env.G4U_ZOHO_FINANCEIRO_NAME_MATCH_ALL_TEAMS ?? '1').trim().toLowerCase()
  );

  return {
    resolveByDisplayName(zohoDisplayName) {
      const coerced = coerceZohoUserLabelForNameMatch(zohoDisplayName);
      const sig = personNameMatchSignature(coerced);
      if (!sig) return null;
      let email = pickUnique(sig, bySigFinance, 'time Financeiro');
      if (email) return email;
      if (allowAllTeams) {
        email = pickUnique(sig, bySigAll, 'todos os times');
        if (email) {
          console.log(
            `${colors.dim}Match nome "${zohoDisplayName}" → ${email} (G4U: utilizador não está no time Financeiro ou time não foi resolvido).${colors.reset}`
          );
        }
      }
      return email;
    },
    debugCounts: { users: users.length, financeiroTeamId: financeiroTeamId || null }
  };
}

async function ensureToken() {
  if (cachedToken) {
    log('Auth', `${colors.dim}Usando G4U_ACCESS_TOKEN do ambiente.${colors.reset}`);
    return cachedToken;
  }
  const email = process.env[cfg.auth.adminCredentialsEnv.email];
  const password = process.env[cfg.auth.adminCredentialsEnv.password];
  if (!email || !password) {
    throw new Error(
      'Defina G4U_ACCESS_TOKEN ou G4U_ADMIN_EMAIL + G4U_ADMIN_PASSWORD no .env'
    );
  }
  const r = await game4uFetch(cfg.auth.login.path, {
    method: cfg.auth.login.method,
    body: { email, password },
    token: null
  });
  log('POST /auth/login', `status ${r.status}`, r.json);
  if (!r.ok) throw new Error(`Login falhou: ${r.status}`);
  const token =
    r.json?.access_token ||
    r.json?.data?.access_token ||
    r.json?.token?.access_token;
  if (!token) throw new Error('Resposta de login sem access_token reconhecido');
  cachedToken = token;
  return token;
}

/** Objeto de critérios no formato da API (valores string). */
function defaultAxesCriteria() {
  return {
    complexity: '0',
    importance: '1',
    executionTime: '0',
    seniorityLevel: '0'
  };
}

function isAxesCriteriaShape(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (Array.isArray(o.rubrics)) return false;
  return (
    'complexity' in o ||
    'importance' in o ||
    'executionTime' in o ||
    'seniorityLevel' in o
  );
}

function scalarToCriteriaString(val, defaultStr) {
  if (val == null || val === '') return defaultStr;
  const n = Number(val);
  if (Number.isNaN(n)) return defaultStr;
  return String(n);
}

/** Normaliza para o shape esperado no PUT (strings numéricas). */
function normalizeAxesCriteriaStrings(o) {
  return {
    complexity: scalarToCriteriaString(o?.complexity, '0'),
    importance:
      o?.importance != null && o.importance !== ''
        ? scalarToCriteriaString(o.importance, '1')
        : '1',
    executionTime: scalarToCriteriaString(o?.executionTime, '0'),
    seniorityLevel: scalarToCriteriaString(o?.seniorityLevel, '0')
  };
}

/** Converte rubricas legadas (peso/valor/criterio) para o objeto de eixos. */
function rubricsToAxesCriteria(rubrics) {
  const axes = defaultAxesCriteria();
  if (!Array.isArray(rubrics)) return axes;
  for (const r of rubrics) {
    const v = String(Number(r?.valor) || 0);
    const label = String(r?.criterio || '').toLowerCase();
    const peso = Number(r?.peso) || 0;
    if (peso === 3 || label.includes('complex')) {
      axes.complexity = v;
    } else if (label.includes('tempo') || label.includes('execução') || label.includes('execucao')) {
      axes.executionTime = v;
    } else if (label.includes('senior')) {
      axes.seniorityLevel = v;
    } else if (label.includes('import')) {
      axes.importance = v;
    }
  }
  return axes;
}

/** Aceita string JSON, array, { rubrics }, ou objeto de eixos já no formato novo. */
function criteriaToAxesCriteria(criteria) {
  if (criteria == null) return defaultAxesCriteria();
  if (typeof criteria === 'string') {
    try {
      return criteriaToAxesCriteria(JSON.parse(criteria));
    } catch {
      return defaultAxesCriteria();
    }
  }
  if (Array.isArray(criteria)) {
    return rubricsToAxesCriteria(criteria);
  }
  if (typeof criteria === 'object' && Array.isArray(criteria.rubrics)) {
    return rubricsToAxesCriteria(criteria.rubrics);
  }
  if (isAxesCriteriaShape(criteria)) {
    return normalizeAxesCriteriaStrings(criteria);
  }
  return defaultAxesCriteria();
}

/** Pontos = (complexity × 3) × importance × executionTime × seniorityLevel (peso 3 na complexidade). */
function computePointsFromAxesCriteria(axes) {
  const c = Number(axes.complexity) || 0;
  const i = Number(axes.importance) || 0;
  const e = Number(axes.executionTime) || 0;
  const s = Number(axes.seniorityLevel) || 0;
  return c * 3 * i * e * s;
}

function transformActionTemplateRow(row) {
  const out = { ...row };
  delete out.client_id;
  delete out.updated_at;
  let crit = out.criteria;
  if (typeof crit === 'string') {
    try {
      crit = JSON.parse(crit);
    } catch (e) {
      console.warn(`${colors.yellow}criteria inválido JSON em ${out.id}:${colors.reset}`, e.message);
      crit = null;
    }
  }
  out.criteria = criteriaToAxesCriteria(crit);
  out.points = computePointsFromAxesCriteria(out.criteria);
  if (out.integration_id === undefined) out.integration_id = null;
  return out;
}

function parseUsersMd(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length < 5) continue;
    const fullName = parts[0].trim();
    const email = parts[1].trim().toLowerCase();
    const password = parts[2];
    const area = parts[3].trim();
    const access = parts[4].trim();
    map.set(email, { fullName, email: parts[1].trim(), password, area, access });
  }
  return map;
}

function pickUserRecordId(u) {
  if (!u || typeof u !== 'object') return null;
  const v = u.id ?? u._id ?? u.user_id;
  return v != null && v !== '' ? String(v) : null;
}

/** Após POST /user, a API pode demorar a indexar; tentativas com backoff curto. */
async function resolveUserIdAfterCreate(email, { maxAttempts = 5 } = {}) {
  const delays = [250, 500, 1000, 1500, 2000];
  for (let i = 0; i < maxAttempts; i++) {
    const id = await findUserIdByEmail(email, { verbose: false, listFallback: true });
    if (id) return id;
    if (i < maxAttempts - 1) await sleep(delays[Math.min(i, delays.length - 1)]);
  }
  return null;
}

async function findUserIdByEmail(email, { verbose = true, listFallback = true } = {}) {
  const norm = email.trim().toLowerCase();

  const q = new URLSearchParams({
    email: email.trim(),
    limit: '50',
    use_pagination: 'false'
  });
  const r = await game4uFetch(`/user/search?${q}`);
  if (verbose) log(`GET /user/search email=${email}`, `status ${r.status}`, r.json);

  let items = r.json?.items || r.json?.data?.items;
  if (!Array.isArray(items) && Array.isArray(r.json) && r.json[0]?.email) {
    items = r.json;
  }
  if (Array.isArray(items)) {
    const hit = items.find((u) => userRecordEmailNorm(u) === norm);
    if (hit) {
      const id = pickUserRecordId(hit);
      if (id) return id;
    }
    if (items.length === 1) {
      const id = pickUserRecordId(items[0]);
      if (id) return id;
    }
  }

  if (!listFallback) return null;

  const tryResolveFromLists = async () => {
    let all = await loadAllUsersFromApi();
    if (!all.length) {
      all = await loadUsersViaSearchPaginated();
    }
    if (!all.length) {
      await sleep(800);
      all = await loadAllUsersFromApi();
    }
    if (!all.length) {
      all = await loadUsersViaSearchPaginated();
    }
    return all.find((x) => userRecordEmailNorm(x) === norm);
  };

  let u = await tryResolveFromLists();
  let id = pickUserRecordId(u);
  if (verbose && id) {
    log(`Lista de usuários (GET /user ou /user/search paginado)`, `match email=${email}`, { id });
  }
  return id || null;
}

async function loadTeamNameToId() {
  const r = await game4uFetch('/team');
  log('GET /team', `status ${r.status}`, r.json);
  if (!r.ok) return new Map();
  const list = Array.isArray(r.json) ? r.json : r.json?.items || [];
  const m = new Map();
  for (const t of list) {
    const name = t.name || t.title;
    const id = t.id || t._id;
    if (name && id != null) m.set(String(name).trim(), String(id));
  }
  return m;
}

async function createUserSafe(payload, { opIndex = 1, opTotal = 1, argv = [] } = {}) {
  const r = await game4uFetch('/user', { method: 'POST', body: payload });
  log(`POST /user ${payload.email}`, `status ${r.status}`, r.json);
  announceDone(
    opIndex,
    opTotal,
    `POST /user ${payload.email}`,
    r.ok,
    r.status,
    r.json
  );
  await maybePauseBetweenOps(argv);
  if (r.ok) {
    let id =
      pickUserRecordId(unwrapUserJson(r.json)) ||
      pickUserRecordId(r.json) ||
      userIdFromLocation(r.location);
    if (!id) {
      id = await resolveUserIdAfterCreate(payload.email);
    }
    if (!id) {
      id = await findUserIdByEmail(payload.email, { verbose: true });
    }
    if (!id) {
      console.warn(
        `${colors.yellow}POST /user OK mas sem id — não resolveu via corpo/Location nem GET /user/search.${colors.reset}`,
        payload.email
      );
    }
    return { ok: true, id, response: r.json };
  }
  if (r.status === 400 || r.status === 409) {
    const msg = String(r.json?.message || '').toLowerCase();
    if (msg.includes('rate limit')) {
      return { ok: false, response: r.json, status: r.status, rateLimited: true };
    }
    let id = await resolveUserIdAfterCreate(payload.email, { maxAttempts: 4 });
    if (!id) id = await findUserIdByEmail(payload.email, { verbose: false });
    if (id) {
      log(`  (usuário já existe)`, payload.email, { id });
      return { ok: true, id, existed: true, response: r.json };
    }
  }
  return { ok: false, response: r.json, status: r.status };
}

function resolveTeamFunifierId(item) {
  if (item?.funifier_id != null && String(item.funifier_id).trim()) {
    return String(item.funifier_id).trim();
  }
  const k = item?.funifierIdEnv;
  if (k && process.env[k]?.trim()) return process.env[k].trim();
  return null;
}

async function createTeamSafe(
  name,
  leaderId,
  { opIndex = 1, opTotal = 1, argv = [], funifier_id } = {}
) {
  const body = { name, leader_id: leaderId };
  if (funifier_id) body.funifier_id = funifier_id;
  const r = await game4uFetch('/team', { method: 'POST', body });
  log(`POST /team ${name}`, `status ${r.status}`, r.json);
  announceDone(opIndex, opTotal, `POST /team ${name}`, r.ok, r.status, r.json);
  await maybePauseBetweenOps(argv);
  if (r.ok) {
    const id = r.json?.id || r.json?._id;
    return { ok: true, id };
  }
  return { ok: false, response: r.json, status: r.status };
}

async function cmdLogin(argv = []) {
  cachedToken = null;
  delete process.env.G4U_ACCESS_TOKEN;
  const t = await ensureToken();
  announceDone(1, 1, 'POST /auth/login', true, 200, { access_token: `${t.slice(0, 32)}…` });
  await maybePauseBetweenOps(argv);
  console.log(`\n${colors.green}Token obtido (${t.slice(0, 24)}…). Exporte para reutilizar:${colors.reset}`);
  console.log(`set G4U_ACCESS_TOKEN=${t}`);
}

function argInt(argv, flag, defaultValue) {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return defaultValue;
  const n = parseInt(argv[i + 1], 10);
  return Number.isFinite(n) ? n : defaultValue;
}

async function cmdSeedActionTemplates(argv) {
  const dry = argv.includes('--dry-run');
  const from = argInt(argv, '--from', 0);
  const limit = argInt(argv, '--limit', Number.MAX_SAFE_INTEGER);

  if (!dry) await ensureToken();
  else console.log(`${colors.yellow}[dry-run] Sem login / sem chamadas HTTP.${colors.reset}\n`);
  const file = join(__dirname, 'revisaprev-action-template.json');
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const slice =
    limit >= Number.MAX_SAFE_INTEGER ? rows.slice(from) : rows.slice(from, from + limit);
  log('seed-action-templates', `Total arquivo: ${rows.length}, executando: ${slice.length} (from=${from})`);

  let ok = 0;
  let fail = 0;
  const total = slice.length;
  const stopOnError = argv.includes('--stop-on-error');
  let n = 0;
  for (const row of slice) {
    n++;
    const body = transformActionTemplateRow(row);
    if (dry) {
      log('DRY', body.id, { title: body.title, points: body.points });
      announceDone(n, total, `[dry-run] ${body.id}`, true, '-', { title: body.title });
      await maybePauseBetweenOps(argv);
      continue;
    }
    const r = await game4uFetch('/action', { method: 'POST', body });
    console.log(
      `${r.ok ? colors.green : colors.red}POST /action ${body.id} → ${r.status}${colors.reset}`
    );
    if (!r.ok) dump(r.json);
    announceDone(n, total, `POST /action ${body.id}`, r.ok, r.status, r.ok ? r.json : r.json);
    await maybePauseBetweenOps(argv);
    if (r.ok) ok++;
    else {
      fail++;
      if (stopOnError && !r.ok) {
        console.log(
          `${colors.yellow}[stop-on-error] Interrompendo após falha em ${body.id}.${colors.reset}`
        );
        break;
      }
    }
  }
  console.log(
    `\nResumo: ${dry ? `${total} itens simulados (dry-run)` : `${ok} OK, ${fail} falhas`}`
  );
}

async function runPhaseUsers(users, passwordMap, teamNameToId, argv) {
  const total = users.length;
  let idx = 0;
  for (const u of users) {
    idx++;
    const emailKey = u.email.trim().toLowerCase();
    const pwdRow = passwordMap.get(emailKey);
    const password =
      pwdRow?.password || process.env.G4U_SEED_DEFAULT_PASSWORD;
    if (!password) {
      console.error(`${colors.red}Sem senha para ${u.email} (users md ou G4U_SEED_DEFAULT_PASSWORD)${colors.reset}`);
      continue;
    }
    let teamId;
    if (u.teamKey) {
      const def = cfg.teamsDefinition.find((t) => t.key === u.teamKey);
      const name = def?.apiTeamName;
      teamId = name ? teamNameToId.get(name) : undefined;
      if (!teamId) {
        console.warn(`${colors.yellow}Time não resolvido para teamKey=${u.teamKey} (${name}) — criando sem team_id${colors.reset}`);
      }
    }
    const payload = {
      email: u.email.trim(),
      password,
      full_name: u.fullName,
      user_role: u.userRole
    };
    if (teamId != null && teamId !== '') payload.team_id = String(teamId);
    const avKey = cfg.seedDefaultAvatarUrlEnv || 'G4U_SEED_AVATAR_URL';
    const avatarUrl = u.avatarUrl || cfg.seedDefaultAvatarUrl || process.env[avKey];
    if (avatarUrl) payload.avatar_url = avatarUrl;
    const created = await createUserSafe(payload, { opIndex: idx, opTotal: total, argv });
    if (created?.rateLimited) {
      await sleep(2000);
      await createUserSafe(payload, { opIndex: idx, opTotal: total, argv });
    } else {
      await sleep(400);
    }
  }
}

function isTeamLeadersPhase(phaseName) {
  return phaseName === 'team_leaders' || phaseName === 'team_leaders_before_teams';
}

async function cmdSeedTeamsUsers(argv) {
  const phaseFilter = argv.includes('--phase')
    ? argv[argv.indexOf('--phase') + 1]
    : 'all';

  await ensureToken();

  if (argv.includes('--reset-supabase-auth')) {
    await deleteSupabaseAuthUsersForSeed(argv);
  }

  const mdPath = join(__dirname, cfg.passwordSourceFile);
  if (!existsSync(mdPath)) throw new Error(`Arquivo não encontrado: ${mdPath}`);
  const passwordMap = parseUsersMd(mdPath);

  const phases = cfg.seedUsersOrdered.phases;
  let teamNameToId = new Map();
  let bootstrapLeaderId;

  for (const phase of phases) {
    if (phaseFilter !== 'all' && phase.phase !== phaseFilter) continue;

    log('Fase', phase.phase, phase.note || '');

    if (phase.phase === 'teams_bootstrap') {
      if (!bootstrapLeaderId) {
        bootstrapLeaderId = await getBootstrapLeaderIdFromAuthUser();
      }
      teamNameToId = await loadTeamNameToId();
      const tTotal = phase.items.length;
      let tIdx = 0;
      for (const item of phase.items) {
        tIdx++;
        if (teamNameToId.has(item.name)) {
          log('Team exists', item.name, teamNameToId.get(item.name));
          announceDone(
            tIdx,
            tTotal,
            `SKIP POST /team ${item.name} (já existe)`,
            true,
            '-',
            { id: teamNameToId.get(item.name) }
          );
          await maybePauseBetweenOps(argv);
          continue;
        }
        const funifierId = resolveTeamFunifierId(item);
        await createTeamSafe(item.name, bootstrapLeaderId, {
          opIndex: tIdx,
          opTotal: tTotal,
          argv,
          funifier_id: funifierId || undefined
        });
        await sleep(300);
      }
      teamNameToId = await loadTeamNameToId();
    }

    if (phase.phase === 'admin_users' || isTeamLeadersPhase(phase.phase)) {
      teamNameToId = await loadTeamNameToId();
      await runPhaseUsers(phase.users, passwordMap, teamNameToId, argv);
    }

    if (phase.phase === 'teams') {
      const listable = await loadUsersViaSearchPaginated({ maxPages: 5 });
      if (!listable.length) {
        const fromGet = await loadAllUsersFromApi();
        log(
          'Fase teams (legado)',
          `Usuários listáveis: ${listable.length} (search) / ${fromGet.length} (GET /user). Prefira teams_bootstrap no config.`
        );
      }
      teamNameToId = await loadTeamNameToId();
      const tTotal = phase.items.length;
      let tIdx = 0;
      for (const item of phase.items) {
        tIdx++;
        const ref = item.leaderEmailRef?.trim();
        if (!ref) continue;
        const leaderId = await findUserIdByEmail(ref);
        if (!leaderId) {
          console.error(`${colors.red}Líder não encontrado: ${ref}${colors.reset}`);
          continue;
        }
        if (teamNameToId.has(item.name)) {
          log('Team exists', item.name, teamNameToId.get(item.name));
          announceDone(
            tIdx,
            tTotal,
            `SKIP POST /team ${item.name} (já existe)`,
            true,
            '-',
            { id: teamNameToId.get(item.name) }
          );
          await maybePauseBetweenOps(argv);
          continue;
        }
        const funifierId = resolveTeamFunifierId(item);
        await createTeamSafe(item.name, leaderId, {
          opIndex: tIdx,
          opTotal: tTotal,
          argv,
          funifier_id: funifierId || undefined
        });
      }
      teamNameToId = await loadTeamNameToId();
    }

    if (phase.phase === 'players_and_remaining') {
      teamNameToId = await loadTeamNameToId();
      await runPhaseUsers(phase.users, passwordMap, teamNameToId, argv);
    }

    if (phase.phase === 'assign_team_leaders') {
      teamNameToId = await loadTeamNameToId();
      const tTotal = phase.items.length;
      let tIdx = 0;
      for (const item of phase.items) {
        tIdx++;
        const teamId = teamNameToId.get(item.teamName);
        if (!teamId) {
          console.error(`${colors.red}Time não encontrado: ${item.teamName}${colors.reset}`);
          continue;
        }
        const leaderId = await findUserIdByEmail(item.leaderEmail.trim(), { verbose: tIdx === 1 });
        if (!leaderId) {
          console.error(`${colors.red}Líder não encontrado: ${item.leaderEmail}${colors.reset}`);
          continue;
        }
        await updateTeamLeaderSafe(teamId, leaderId, {
          opIndex: tIdx,
          opTotal: tTotal,
          title: `PUT /team ${item.teamName} leader=${item.leaderEmail}`,
          argv
        });
        await sleep(300);
      }
    }
  }

  log('Final', 'Mapa nome→id times', Object.fromEntries(teamNameToId));
}

function buildZohoFormBody() {
  const cid = process.env.ZOHO_CLIENT_ID;
  const sec = process.env.ZOHO_CLIENT_SECRET;
  const rt = process.env.ZOHO_REFRESH_TOKEN;
  if (!cid || !sec || !rt) {
    throw new Error('Defina ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET e ZOHO_REFRESH_TOKEN');
  }
  const p = new URLSearchParams();
  p.set('grant_type', 'refresh_token');
  p.set('client_id', cid);
  p.set('client_secret', sec);
  p.set('refresh_token', rt);
  return p;
}

/** Lê ZOHO_MODIFIED_FROM/TO; aceita typo ZOHO_MOVIFIED_* se o canônico estiver vazio. */
function zohoModifiedTimeRange() {
  const kf = cfg.zoho.dealsSearch.dateRangeEnv.from;
  const kt = cfg.zoho.dealsSearch.dateRangeEnv.to;
  const from =
    process.env[kf]?.trim() || process.env.ZOHO_MOVIFIED_FROM?.trim() || '';
  const to =
    process.env[kt]?.trim() || process.env.ZOHO_MOVIFIED_TO?.trim() || '';
  return { from, to, kf, kt };
}

/** zoho-tasks: restringir Deals/search a abril (Modified_Time), p.ex. para testar na API local. */
function isZohoTasksAprilDealsOnly(argv) {
  if (argv?.includes('--zoho-tasks-april-deals')) return true;
  const e = String(process.env.G4U_ZOHO_TASKS_APRIL_DEALS || '').trim().toLowerCase();
  return e === '1' || e === 'true' || e === 'yes' || e === 'on';
}

function parseZohoTasksAprilYear(argv) {
  const envY = process.env.G4U_ZOHO_TASKS_APRIL_YEAR?.trim();
  if (envY && /^\d{4}$/.test(envY)) return parseInt(envY, 10);
  const yi = argv?.indexOf('--zoho-tasks-april-year');
  if (yi >= 0 && argv[yi + 1] && /^\d{4}$/.test(String(argv[yi + 1]).trim())) {
    return parseInt(String(argv[yi + 1]).trim(), 10);
  }
  return new Date().getUTCFullYear();
}

/** Abril completo (UTC) para critério Modified_Time:between no Deals/search. */
function zohoAprilDealsModifiedBetweenUtc(year) {
  const raw = Number(year);
  const y =
    Number.isFinite(raw) && raw >= 2000 && raw <= 2100 ? Math.trunc(raw) : new Date().getUTCFullYear();
  return {
    from: `${y}-04-01T00:00:00+00:00`,
    to: `${y}-04-30T23:59:59+00:00`,
    year: y
  };
}

/**
 * Intervalo Modified_Time para zoho-tasks (env ou filtro abril).
 * @returns {{ from: string, to: string, kf: string, kt: string, aprilYear: number|null }}
 */
function zohoTasksResolveSearchRange(argv) {
  let { from, to, kf, kt } = zohoModifiedTimeRange();
  let aprilYear = null;
  if (isZohoTasksAprilDealsOnly(argv)) {
    const y = parseZohoTasksAprilYear(argv);
    const apr = zohoAprilDealsModifiedBetweenUtc(y);
    from = apr.from;
    to = apr.to;
    aprilYear = apr.year;
  } else if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} (ou alias ZOHO_MOVIFIED_FROM / ZOHO_MOVIFIED_TO se usar o typo)`);
  }
  return { from, to, kf, kt, aprilYear };
}

function pushZohoDebugSample(arr, entry, max = 10) {
  if (!Array.isArray(arr) || arr.length >= max) return;
  arr.push(entry);
}

/** Atribuir pontos ao Owner da task Zoho em vez do responsável jur do deal (fallback para jur do deal). */
function isZohoTasksPreferTaskOwnerEmail(argv) {
  if (argv?.includes('--zoho-tasks-task-owner-email')) return true;
  const e = String(process.env.G4U_ZOHO_JUR_TASK_USER_EMAIL || '').trim().toLowerCase();
  return e === 'owner' || e === 'task_owner' || e === '1' || e === 'true' || e === 'yes';
}

/**
 * E-mail para POST jur: Owner da task (se preferTaskOwner e lookup OK) ou responsável jur do deal.
 */
async function zohoResolveEmailForJurHit(
  jur,
  dealId,
  token,
  zohoUserEmailCache,
  zohoDealRowCacheForJur,
  hitActivity,
  preferTaskOwner
) {
  if (preferTaskOwner && hitActivity?.Owner && typeof hitActivity.Owner === 'object') {
    const fromOwner = await zohoResolveUserEmailFromLookup(hitActivity.Owner, token, zohoUserEmailCache);
    if (fromOwner) return fromOwner;
  }
  return zohoResolveJuridicoResponsibleEmail(
    jur,
    dealId,
    token,
    zohoUserEmailCache,
    zohoDealRowCacheForJur,
    hitActivity
  );
}

/** Search Records v8: GET .../Deals/search?criteria=...&page=&per_page= (per_page máx. 200). */
function buildZohoDealsSearchUrl(criteria, page = 1) {
  const perPage = Math.min(
    parseInt(String(cfg.zoho.dealsSearch.defaultPerPage ?? 200), 10) || 200,
    200
  );
  const u = new URL(cfg.zoho.dealsSearch.baseUrl);
  u.searchParams.set('criteria', criteria);
  u.searchParams.set('page', String(page));
  u.searchParams.set('per_page', String(perPage));
  const fields = cfg.zoho.dealsSearch.searchIncludeFields;
  if (typeof fields === 'string' && fields.trim()) {
    u.searchParams.set('fields', fields.trim());
  }
  return u.toString();
}

function zohoCriteriaModifiedBetween(from, to) {
  const tmpl =
    cfg.zoho.dealsSearch.criteriaTemplate || '(Modified_Time:between:{{from}},{{to}})';
  return tmpl.replace(/\{\{from\}\}/g, from).replace(/\{\{to\}\}/g, to);
}

/** Vírgulas e parênteses no valor de critério Zoho Search precisam de escape (\\, \\( \\)). */
function escapeZohoSearchCriteriaValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/,/g, '\\,');
}

function isZohoPipelineFilterEnabled(argv) {
  if (argv?.includes('--zoho-ignore-pipeline-filter')) return false;
  const env = process.env.ZOHO_DEALS_PIPELINE_FILTER?.trim().toLowerCase();
  if (env === '0' || env === 'false' || env === 'off') return false;
  if (env === '1' || env === 'true' || env === 'on') return true;
  const pf = cfg.zoho.dealsSearch?.pipelineFilter;
  return Boolean(pf && pf.enabled !== false);
}

function buildZohoPipelineCriteriaOrClause() {
  const pf = cfg.zoho.dealsSearch?.pipelineFilter;
  const field =
    process.env.ZOHO_DEALS_PIPELINE_FIELD?.trim() || pf?.fieldApiName || 'Pipeline';
  const names = Array.isArray(pf?.allowedDisplayNames) ? pf.allowedDisplayNames : [];
  if (!names.length) return '';
  return names
    .map((n) => `(${field}:equals:${escapeZohoSearchCriteriaValue(n)})`)
    .join(' or ');
}

/** Um único pipeline (valor de picklist) + intervalo Modified_Time — para probes e validação. */
function buildZohoSinglePipelineSearchCriteria(pipelineDisplayName, from, to) {
  const pf = cfg.zoho.dealsSearch?.pipelineFilter;
  const field =
    process.env.ZOHO_DEALS_PIPELINE_FIELD?.trim() || pf?.fieldApiName || 'Pipeline';
  const timePart = zohoCriteriaModifiedBetween(from, to);
  const pipe = `(${field}:equals:${escapeZohoSearchCriteriaValue(String(pipelineDisplayName || '').trim())})`;
  return `((${timePart}) and ${pipe})`;
}

/**
 * Modified_Time + filtro em Layout.display_label (ou ZOHO_PROBE_LAYOUT_FIELD). Sem filtro de Pipeline.
 * operator: "equals" | "not_equal" (Zoho CRM v8 search).
 */
function buildZohoTimeAndLayoutDisplayLabelCriteria(from, to, operator, layoutDisplayLabel) {
  const timePart = zohoCriteriaModifiedBetween(from, to);
  const layoutField =
    process.env.ZOHO_PROBE_LAYOUT_FIELD?.trim() || 'Layout.display_label';
  const op = operator === 'not_equal' ? 'not_equal' : 'equals';
  const val = escapeZohoSearchCriteriaValue(String(layoutDisplayLabel ?? '').trim());
  const layoutClause = `(${layoutField}:${op}:${val})`;
  return `((${timePart}) and ${layoutClause})`;
}

function zohoProbeMiniPipelineHistogramLines(deals, maxBuckets = 18) {
  const h = new Map();
  for (const d of deals) {
    const p = getZohoDealPipelineName(d) || '(sem pipeline legível)';
    h.set(p, (h.get(p) || 0) + 1);
  }
  const sorted = [...h.entries()].sort((a, b) => b[1] - a[1]);
  const lines = sorted.slice(0, maxBuckets).map(([n, c]) => `    ${String(c).padStart(5)}\t${n}`);
  return { lines, totalBuckets: sorted.length, sorted };
}

/**
 * Critério completo do Deals/search: intervalo Modified_Time + opcionalmente pipelines permitidos.
 */
function zohoDealsSearchCriteria(from, to, argv) {
  const timePart = zohoCriteriaModifiedBetween(from, to);
  if (!isZohoPipelineFilterEnabled(argv)) return timePart;
  const pipeOr = buildZohoPipelineCriteriaOrClause();
  if (!pipeOr) return timePart;
  return `((${timePart}) and (${pipeOr}))`;
}

/**
 * Timeline v8: URL inicial com sort_by, per_page, filters (audited_time between), include_inner_details; páginas
 * seguintes via page_token (ver zohoFetchMergedDealTimeline).
 * @see https://www.zoho.com/crm/developer/docs/api/v8/timeline-of-a-record.html
 */
function buildZohoDealActivitiesChronologicalUrl(dealId) {
  const ac = cfg.zoho.dealActivitiesChronological || {};
  const base = String(ac.pathTemplate || '').replace('{{dealId}}', String(dealId));
  const fields = ac.fieldsQueryParam;
  if (!base) return base;
  if (!fields || !String(fields).trim()) return base;
  const u = new URL(base);
  u.searchParams.set('fields', String(fields).trim());
  return u.toString();
}

function buildZohoDealTimelineUrl(dealId, auditedFrom, auditedTo) {
  const base = cfg.zoho.dealTimelineStages.pathTemplate.replace('{{dealId}}', String(dealId));
  const u = new URL(base);
  const filtersObj = {
    comparator: 'between',
    field: { api_name: 'audited_time' },
    value: [auditedFrom, auditedTo]
  };
  u.searchParams.set('sort_by', 'audited_time');
  u.searchParams.set('per_page', '200');
  u.searchParams.set(
    'include_inner_details',
    'field_history.data_type, field_history.field_label, field_history.enable_colour_code, field_history.pick_list_values, done_by.type__s, done_by.profile'
  );
  u.searchParams.set('filters', JSON.stringify(filtersObj));
  return u.toString();
}

/**
 * Janela audited_time do __timeline mais larga que só Modified_Time do search:
 * inclui transições de Stage (CS vs Financeiro) para montar DONE com o utilizador certo.
 * Env: ZOHO_TIMELINE_AUDITED_FROM / ZOHO_TIMELINE_AUDITED_TO sobrepõem;
 * ZOHO_TIMELINE_EXTRA_DAYS_BACK (default 0 = igual ao Modified_Time do search; ex. 730 para recuar o início);
 * dealTimelineStages.stageHistoryAuditedFromNotBefore (opcional): max(início calculado, esta data).
 * Fim: ZOHO_TIMELINE_AUDITED_TO ou ZOHO_MODIFIED_TO; opcional ZOHO_TIMELINE_EXTEND_TO_NOW=1 alarga o fim até agora
 * (algumas orgs Zoho devolvem __timeline vazio se o between incluir instante futuro — use com cuidado).
 */
function argvFlagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return null;
  const v = argv[i + 1];
  if (!v || String(v).startsWith('--')) return null;
  return String(v).trim();
}

/** Caminho absoluto ou relativo à raiz do repositório. */
function resolvePathFromRepoRoot(p) {
  const s = String(p || '').trim();
  if (!s) return null;
  if (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s)) return s;
  return join(ROOT, s);
}

function parseCsvLineBasic(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Lê coluna deal_id (ou fallback) do CSV do diff Zoho×Game4U — uma linha por id único.
 * @param {{ onlyFoundNo?: boolean }} opts — só linhas com found_in_game4u = no (divergência diff).
 */
function readDealIdsFromDiffCsv(csvPathRel, opts = {}) {
  const abs = resolvePathFromRepoRoot(csvPathRel);
  if (!abs || !existsSync(abs)) {
    throw new Error(`Arquivo CSV não encontrado: ${csvPathRel} → ${abs || '(inválido)'}`);
  }
  const text = readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/).filter((ln) => ln.length > 0);
  if (!lines.length) return [];
  const headerCells = parseCsvLineBasic(lines[0]).map((h) =>
    h.replace(/^\ufeff/, '').trim().toLowerCase()
  );
  let col = headerCells.findIndex((h) => h === 'deal_id');
  if (col < 0) col = headerCells.findIndex((h) => h.includes('deal') && h.includes('id'));
  if (col < 0) col = 4;
  const colFoundNo =
    opts.onlyFoundNo === true ? headerCells.findIndex((h) => h === 'found_in_game4u') : -1;
  const seen = new Set();
  const ids = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLineBasic(lines[li]);
    if (colFoundNo >= 0) {
      const fv = (cells[colFoundNo] ?? '').trim().toLowerCase();
      if (fv !== 'no') continue;
    }
    const raw = (cells[col] ?? '').trim().replace(/^"|"$/g, '');
    const m = raw.match(/(\d{10,})/);
    const id = m ? m[1] : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Filtro opcional: só transições Stage cujo audited_time cai no intervalo (ex. abril = transições vistas nesse mês). */
function parseTransitionAuditedBoundsFromArgv(argv) {
  const mo = argvFlagValue(argv, '--zoho-transitions-only-month');
  if (mo) {
    const m = /^(\d{4})-(\d{2})$/.exec(mo);
    if (m) {
      const y = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (y >= 2000 && y <= 2100 && month >= 1 && month <= 12) {
        const start = new Date(Date.UTC(y, month - 1, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(y, month, 0, 23, 59, 59, 999));
        return { from: start.toISOString(), to: end.toISOString(), label: mo };
      }
    }
    throw new Error(`--zoho-transitions-only-month esperado YYYY-MM, recebido: ${mo}`);
  }
  const from = argvFlagValue(argv, '--zoho-transition-audited-from');
  const to = argvFlagValue(argv, '--zoho-transition-audited-to');
  if (from && to) return { from, to, label: `${from}..${to}` };
  return null;
}

function filterStageHitsByAuditedWindow(hits, bounds) {
  if (!bounds || !Array.isArray(hits) || !hits.length) return hits;
  const t0 = Date.parse(bounds.from);
  const t1 = Date.parse(bounds.to);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return hits;
  return hits.filter((hit) => {
    const at = Date.parse(String(hit.row?.audited_time ?? hit.row?.Audited_Time ?? ''));
    if (Number.isNaN(at)) return false;
    return at >= t0 && at <= t1;
  });
}

const TAREFAS_POR_TIMES_XLSX_PATH = join(__dirname, 'Tarefas por times.xlsx');

/** Texto estável para cruzar Stage Zoho ↔ células da planilha (case e acentos). */
function tarefasPorTimesNormLoose(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Categoria da planilha → chave alinhada a cfg.teamsDefinition[].key */
function excelCategoryToTeamKey(cat) {
  const x = tarefasPorTimesNormLoose(cat);
  if (!x) return null;
  if (x === 'cs') return 'cs';
  if (x === 'juridico') return 'juridico';
  if (x === 'financeiro') return 'financeiro';
  return null;
}

/** Parte principal do nome do serviço (antes de sufixos " - Tag: …"). */
function stripTarefasServicoStem(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const cut = s.split(/\s+-\s+Tag\s*:/i)[0];
  return cut.trim();
}

/**
 * Linhas { servico, categoriaTeamKey } a partir de `Tarefas por times.xlsx` (colunas Nome do Serviço, Categoria).
 * Requer pacote `xlsx` (devDependency na raiz do repo).
 */
function loadTarefasPorTimesRowsFromXlsx() {
  if (!existsSync(TAREFAS_POR_TIMES_XLSX_PATH)) {
    console.warn(
      `${colors.yellow}Planilha de times por tarefa não encontrada: ${TAREFAS_POR_TIMES_XLSX_PATH}${colors.reset}`
    );
    return [];
  }
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (e) {
    console.warn(
      `${colors.yellow}Pacote 'xlsx' não disponível — instale na raiz (npm i -D xlsx) para validação abril planilha×time. ${e?.message || e}${colors.reset}`
    );
    return [];
  }
  const wb = XLSX.readFile(TAREFAS_POR_TIMES_XLSX_PATH);
  const name = wb.SheetNames?.[0];
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
  const out = [];
  for (const r of rows) {
    const serv =
      r['Nome do Serviço'] ??
      r['Nome do Servico'] ??
      r['nome_do_servico'] ??
      r['servico'] ??
      '';
    const cat = r['Categoria'] ?? r['categoria'] ?? '';
    const teamKey = excelCategoryToTeamKey(cat);
    const stem = stripTarefasServicoStem(serv);
    if (!stem || !teamKey) continue;
    out.push({ servicoStem: tarefasPorTimesNormLoose(stem), teamKey });
  }
  return out;
}

/**
 * Devolve função (stageTitle) => teamKey | null — compara título do Stage com a coluna Nome do Serviço (stem).
 */
function buildTarefasPorTimesStageCategoryLookup(tableRows) {
  const rows = Array.isArray(tableRows) ? tableRows.filter((x) => x?.servicoStem && x?.teamKey) : [];
  return function lookupStageTeamCategory(stageTitle) {
    const st = tarefasPorTimesNormLoose(stageTitle);
    if (!st) return null;
    let bestKey = null;
    let bestScore = 0;
    for (const { servicoStem: svc, teamKey } of rows) {
      if (!svc) continue;
      let score = 0;
      if (st === svc) {
        score = 100000 + svc.length;
      } else if (st.includes(svc) || svc.includes(st)) {
        const m = Math.min(st.length, svc.length);
        if (m >= 8) score = 5000 + m;
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = teamKey;
      }
    }
    return bestScore > 0 ? bestKey : null;
  };
}

/** Abril: `--zoho-transitions-only-month YYYY-04` (qualquer ano). */
function zohoAprilTransitionTeamDismissEnabled(bounds) {
  if (!bounds?.label) return false;
  return /^\d{4}-04$/.test(String(bounds.label));
}

/**
 * e-mail (normalizado) → teamsDefinition.key do 1º team_id do utilizador que casa com GET /team.
 */
async function buildGame4uEmailToTeamKeyIndex() {
  const map = new Map();
  const teamNameToId = await loadTeamNameToId();
  const teamIdToKey = new Map();
  for (const def of cfg.teamsDefinition || []) {
    const want = String(def?.apiTeamName || '').trim();
    if (!want) continue;
    const wantN = tarefasPorTimesNormLoose(want);
    for (const [nm, id] of teamNameToId.entries()) {
      if (tarefasPorTimesNormLoose(nm) === wantN) {
        teamIdToKey.set(String(id), def.key);
        break;
      }
    }
  }
  let users = await loadAllUsersFromApi();
  if (!users.length) users = await loadUsersViaSearchPaginated({ maxPages: 50 });
  for (const u of users) {
    const em = userRecordEmailNorm(u);
    if (!em) continue;
    const ids = extractGame4uUserTeamIds(u);
    let key = null;
    for (const tid of ids) {
      const k = teamIdToKey.get(String(tid));
      if (k) {
        key = k;
        break;
      }
    }
    if (key) map.set(em, key);
  }
  return map;
}

function shouldDismissForAprilStageTeamMismatch({
  lookupCat,
  emailToTeamKey,
  stageTitle,
  userEmail
}) {
  if (!lookupCat || !emailToTeamKey || !userEmail) return false;
  const cat = lookupCat(stageTitle);
  if (cat == null) return false;
  const em = userRecordEmailNorm({ email: userEmail });
  const userKey = emailToTeamKey.get(em);
  if (userKey == null) return false;
  return cat !== userKey;
}

function zohoTimelineAuditedRangeForStageHistory(modifiedFrom, modifiedTo) {
  const envFrom = process.env.ZOHO_TIMELINE_AUDITED_FROM?.trim();
  const envTo = process.env.ZOHO_TIMELINE_AUDITED_TO?.trim();
  const extendToNow =
    process.env.ZOHO_TIMELINE_EXTEND_TO_NOW === '1' ||
    process.env.ZOHO_TIMELINE_EXTEND_TO_NOW === 'true';
  let fromR = modifiedFrom;
  if (envFrom) {
    fromR = envFrom;
  } else if (modifiedFrom) {
    const extra = parseInt(process.env.ZOHO_TIMELINE_EXTRA_DAYS_BACK || '0', 10);
    const n = Number.isFinite(extra) && extra > 0 ? Math.min(extra, 3650) : 0;
    if (n > 0) {
      const d = new Date(modifiedFrom);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() - n);
        fromR = d.toISOString();
      }
    }
    const notBefore =
      cfg.zoho?.dealTimelineStages?.stageHistoryAuditedFromNotBefore ??
      cfg.zoho?.dealTimelineStages?.stageHistoryAuditedFromFallback;
    if (notBefore && String(notBefore).trim()) {
      const tNb = new Date(String(notBefore).trim()).getTime();
      const tCur = new Date(fromR).getTime();
      if (!Number.isNaN(tNb) && !Number.isNaN(tCur)) {
        fromR = new Date(Math.max(tNb, tCur)).toISOString();
      }
    }
  }
  const nowIso = new Date().toISOString();
  let toR = envTo || modifiedTo || nowIso;
  if (!envTo && extendToNow) {
    try {
      const tTo = new Date(toR).getTime();
      const tNow = new Date(nowIso).getTime();
      if (!Number.isNaN(tTo) && !Number.isNaN(tNow) && tTo < tNow) {
        toR = nowIso;
      }
    } catch {
      toR = nowIso;
    }
  }
  return { from: fromR, to: toR };
}

function zohoDealsSearchMaxPages() {
  const n = parseInt(process.env.ZOHO_DEALS_SEARCH_MAX_PAGES || '500', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : 500;
}

/** Zoho devolve 400 LIMIT_REACHED ao exceder ~2000 registos numa cadeia de search paginado. */
function zohoDealsSearchIsIterationLimitError(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.code === 'LIMIT_REACHED') return true;
  const m = String(data.message || '').toLowerCase();
  return m.includes('maximum response iteration') || m.includes('iteration limit');
}

/**
 * Deals no intervalo: uma pesquisa por cada pipeline em allowedDisplayNames (união por id).
 * Evita um único Deals/search sem pipeline que estoura o limite de iteração da Zoho (~2000).
 */
async function zohoFetchDealsMergedByAllowedPipelines(from, to, token, opts = {}) {
  const quiet = Boolean(opts.quiet);
  const names = cfg.zoho.dealsSearch?.pipelineFilter?.allowedDisplayNames;
  if (!Array.isArray(names) || names.length === 0) {
    const crit = zohoDealsSearchCriteria(from, to, ['--zoho-ignore-pipeline-filter']);
    return zohoFetchAllDealsSearchPages(crit, token, { quiet });
  }
  const byId = new Map();
  for (const name of names) {
    const crit = buildZohoSinglePipelineSearchCriteria(name, from, to);
    const rows = await zohoFetchAllDealsSearchPages(crit, token, { quiet });
    for (const d of rows) {
      if (d && d.id != null) byId.set(String(d.id), d);
    }
  }
  return [...byId.values()];
}

/** Nome do picklist Pipeline para Cobrança (env ou entrada em allowedDisplayNames). */
function zohoCobrancaPipelineDisplayName() {
  const e = process.env.ZOHO_COBRANCA_PIPELINE_NAME?.trim();
  if (e) return e;
  const allowed = cfg.zoho.dealsSearch?.pipelineFilter?.allowedDisplayNames || [];
  const hit = allowed.find((n) => /cobran/i.test(String(n)));
  return hit || 'Cobrança';
}

/**
 * E-mail para PENDING no pipeline Cobrança (normalmente Financeiro_Respons_vel).
 * strictFinanceiroOnly (zoho-cobranca-stages por defeito): não usa Owner nem G4U_ZOHO_FALLBACK_USER_EMAIL —
 * evita registar ações no CS quando o CRM só traz id/nome no lookup. Desligar com G4U_ZOHO_COBRANCA_OWNER_FALLBACK=1.
 */
async function resolveEmailZohoCobrancaGameUser(deal, token, zohoUserEmailCache, opts = {}) {
  const strict = Boolean(opts.strictFinanceiroOnly);
  const resolver = opts.game4uNameResolver;
  let em = await zohoResolveUserEmailFromLookup(deal.Financeiro_Respons_vel, token, zohoUserEmailCache);
  if (!em && resolver) {
    const zohoLabel = await zohoFinanceiroZohoSideDisplayName(
      deal.Financeiro_Respons_vel,
      token,
      zohoUserEmailCache
    );
    if (zohoLabel) {
      em = resolver.resolveByDisplayName(zohoLabel);
      if (em) {
        console.log(
          `${colors.dim}deal ${deal.id}: Financeiro (Zoho) "${zohoLabel}" ↔ nome no Game4U → ${em}${colors.reset}`
        );
      } else {
        console.warn(
          `${colors.yellow}deal ${deal.id}: Financeiro "${zohoLabel}" sem e-mail no CRM nem match de nome no Game4U (full_name / time Financeiro).${colors.reset}`
        );
      }
    }
  }
  if (!em && !strict && zohoFinanceiroStageFallbackToOwnerEmail()) {
    em = await zohoResolveUserEmailFromLookup(deal.Owner, token, zohoUserEmailCache);
    if (em) {
      console.warn(
        `${colors.yellow}deal ${deal.id}: Cobrança PENDING — Financeiro_Respons_vel sem e-mail resolvido; ` +
          `a usar Owner (CS). Corrija o lookup no CRM, a API users, ou use strict só com financeiro. ` +
          `Para forçar este fallback: G4U_ZOHO_COBRANCA_OWNER_FALLBACK=1.${colors.reset}`
      );
    }
  }
  if (!em && !strict) {
    em = process.env.G4U_ZOHO_FALLBACK_USER_EMAIL?.trim() || null;
  }
  return em;
}

function zohoTimelineMaxPages() {
  const n = parseInt(process.env.ZOHO_TIMELINE_MAX_PAGES || '50', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50;
}

function zohoActivitiesChronologicalMaxPages() {
  const n = parseInt(process.env.ZOHO_ACTIVITIES_MAX_PAGES || '50', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50;
}

/**
 * Limite opcional de deals após juntar todas as páginas do search.
 * Sem --max-deals e sem ZOHO_MAX_DEALS → processa todos.
 */
function zohoRunnerMaxDeals(argv) {
  const i = argv.indexOf('--max-deals');
  if (i >= 0 && argv[i + 1] != null) {
    const n = parseInt(argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
    if (Number.isFinite(n) && n === 0) return Number.MAX_SAFE_INTEGER;
  }
  const env = process.env.ZOHO_MAX_DEALS?.trim();
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Deals/search: todas as páginas (info.more_records + page++). opts.quiet: só erros (útil em probes). */
async function zohoFetchAllDealsSearchPages(criteria, token, opts = {}) {
  const quiet = Boolean(opts.quiet);
  const all = [];
  let page = 1;
  const maxPages = zohoDealsSearchMaxPages();
  for (;;) {
    if (page > maxPages) {
      console.warn(
        `${colors.yellow}ZOHO_DEALS_SEARCH_MAX_PAGES (${maxPages}) atingido — parando.${colors.reset}`
      );
      break;
    }
    const url = buildZohoDealsSearchUrl(criteria, page);
    if (page > 1) await sleep(90);
    const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (r.ok && (r.status === 204 || !String(text).trim())) {
        data = { data: [], info: { more_records: false, count: 0 } };
      } else {
        log(`Zoho Deals/search página ${page}`, `status ${r.status} JSON inválido`, {
          _raw: String(text).slice(0, 500)
        });
        break;
      }
    }
    if (!r.ok) {
      if (zohoDealsSearchIsIterationLimitError(data)) {
        console.warn(
          `${colors.yellow}Zoho Deals/search página ${page}: limite de iteração/resposta da API — ` +
            `devolvendo ${all.length} registo(s) já acumulados (reduza o intervalo ou filtre por pipeline).${colors.reset}`
        );
        break;
      }
      log(`Zoho Deals/search página ${page}`, `status ${r.status}`, data);
      break;
    }
    const info = data?.info;
    const compactLog =
      page === 1
        ? data
        : {
            info,
            records_this_page: data?.data?.length,
            first_ids: (data?.data ?? []).slice(0, 3).map((d) => d?.id)
          };
    if (!quiet) {
      log(
        `Zoho Deals/search (página ${page}${info?.more_records ? '+' : ''})`,
        `status ${r.status} criteria=${criteria}` +
          (info
            ? ` | page=${info.page} per_page=${info.per_page} more_records=${info.more_records} count=${info.count}`
            : ''),
        compactLog
      );
    }
    const rows = data?.data ?? [];
    for (const row of rows) {
      if (row && row.id != null) all.push(row);
    }
    if (info?.more_records !== true || rows.length === 0) break;
    page += 1;
  }
  return all;
}

/** __timeline: todas as páginas (page_token) fundidas num único __timeline. */
async function zohoFetchMergedDealTimeline(dealId, from, to, token, bareTimeline) {
  const merged = { __timeline: [] };
  const initialUrl = bareTimeline
    ? cfg.zoho.dealTimelineStages.pathTemplate.replace('{{dealId}}', String(dealId))
    : buildZohoDealTimelineUrl(dealId, from, to);
  let nextUrl = null;
  const maxPages = zohoTimelineMaxPages();
  for (let p = 0; p < maxPages; p++) {
    const fetchUrl = nextUrl ?? initialUrl;
    if (p > 0) await sleep(80);
    const r2 = await fetch(fetchUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const t2 = await r2.text();
    let j2;
    try {
      j2 = JSON.parse(t2);
    } catch {
      j2 = { _raw: t2 };
    }
    const list = j2?.__timeline;
    if (Array.isArray(list)) merged.__timeline.push(...list);
    const info = j2?.info;
    const pageToken = info?.next_page_token ?? info?.Next_Page_Token ?? null;
    if (info?.more_records === true && pageToken) {
      const u = new URL(fetchUrl);
      u.searchParams.set('page_token', String(pageToken));
      nextUrl = u.toString();
    } else {
      break;
    }
  }
  return merged;
}

/** Activities_Chronological: todas as páginas fundidas numa lista de atividades. */
async function zohoFetchAllActivitiesChronologicalForDeal(dealId, token) {
  const all = [];
  const initialUrl = buildZohoDealActivitiesChronologicalUrl(dealId);
  let nextUrl = null;
  const maxPages = zohoActivitiesChronologicalMaxPages();
  for (let p = 0; p < maxPages; p++) {
    const fetchUrl = nextUrl ?? initialUrl;
    if (p > 0) await sleep(55);
    const r2 = await fetch(fetchUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const t2 = await r2.text();
    let j2;
    try {
      j2 = JSON.parse(t2);
    } catch {
      j2 = { _raw: t2 };
    }
    all.push(...extractZohoActivitiesChronologicalList(j2));
    const info = j2?.info;
    const pageToken = info?.next_page_token ?? info?.Next_Page_Token ?? info?.page_token ?? null;
    if (info?.more_records === true && pageToken) {
      const u = new URL(fetchUrl);
      u.searchParams.set('page_token', String(pageToken));
      nextUrl = u.toString();
    } else {
      break;
    }
  }
  return all;
}

/** Zoho __timeline: api_name do picklist de estágio vem como "Stage" ou "stage" conforme org/API. */
function zohoTimelineFieldIsStage(fieldHistoryEntry) {
  const n = String(fieldHistoryEntry?.api_name ?? fieldHistoryEntry?.field?.api_name ?? '')
    .trim()
    .toLowerCase();
  return n === 'stage' || n === 'deal_stage';
}

function zohoParseJsonObjectIfString(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    const j = JSON.parse(t);
    return typeof j === 'object' && j != null ? j : null;
  } catch {
    return null;
  }
}

/**
 * Lê old/new do field_history: prioridade a _value.old / _value.new (Zoho CRM timeline).
 * _value pode vir string JSON; old/new podem ser objetos picklist.
 */
function zohoFieldHistoryStageOldNew(fieldHistoryEntry) {
  let v =
    fieldHistoryEntry?._value ??
    fieldHistoryEntry?.value ??
    fieldHistoryEntry?.field_history?._value ??
    fieldHistoryEntry?.field?.value;

  const parsedFromString = zohoParseJsonObjectIfString(v);
  if (parsedFromString) v = parsedFromString;
  if (v && typeof v === 'object') {
    const oldRaw =
      v.old ?? v.Old ?? v.previous_value ?? v.previous ?? v.before ?? v.from ?? v.old_value;
    const newRaw =
      v.new ?? v.New ?? v.current_value ?? v.current ?? v.after ?? v.to ?? v.new_value;
    return {
      oldVal: zohoPicklistDisplayString(oldRaw),
      newVal: zohoPicklistDisplayString(newRaw)
    };
  }
  return { oldVal: '', newVal: '' };
}

/**
 * Todas as alterações de Stage no __timeline (field_history com api_name stage, qualquer capitalização).
 * timelineIndex = posição da linha no __timeline fundido (desempate quando audited_time empata).
 */
function collectStageChangesFromTimeline(timelineResponse) {
  const list = timelineResponse?.__timeline;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let timelineIndex = 0; timelineIndex < list.length; timelineIndex++) {
    const row = list[timelineIndex];
    const fh = row.field_history;
    if (fh == null) continue;
    const entries = Array.isArray(fh) ? fh : [fh];
    const audited = row.audited_time ?? row.Audited_Time ?? '';
    for (const f of entries) {
      if (!f || typeof f !== 'object') continue;
      if (!zohoTimelineFieldIsStage(f)) continue;
      const { oldVal, newVal } = zohoFieldHistoryStageOldNew(f);
      out.push({ row, field: f, audited_time: audited, oldVal, newVal, timelineIndex });
    }
  }
  return out;
}

/** Transições Stage no __timeline, da mais antiga à mais recente (replay histórico). */
function timelineStageChangesToHitsAsc(timelineResponse) {
  const changes = collectStageChangesFromTimeline(timelineResponse);
  changes.sort((a, b) => {
    const ta = Date.parse(String(a.audited_time)) || 0;
    const tb = Date.parse(String(b.audited_time)) || 0;
    if (ta !== tb) return ta - tb;
    const ia = a.timelineIndex ?? 0;
    const ib = b.timelineIndex ?? 0;
    if (ia !== ib) return ia - ib;
    return String(a.row?.id ?? '').localeCompare(String(b.row?.id ?? ''));
  });
  return changes.map((c) => ({
    row: c.row,
    field: c.field,
    oldVal: c.oldVal ? zohoNormStageLabelForMatch(c.oldVal) || String(c.oldVal).trim() : '',
    newVal: c.newVal ? zohoNormStageLabelForMatch(c.newVal) || String(c.newVal).trim() : ''
  }));
}

function zohoNormStageLabelForMatch(s) {
  return normalizeZohoPicklistLabel(zohoPicklistDisplayString(s));
}

/**
 * Última transição Stage relevante para o deal atual:
 * - Ordena por audited_time (mais recente primeiro), depois timelineIndex (linhas mais à frente no merge).
 * - Se o deal tem Stage, prefere a alteração cujo _value.new coincide com esse Stage (última vez que entrou no estágio atual).
 * - Se new veio vazio mas old veio do _value, usa deal.Stage como new (estágio atual no CRM).
 */
function pickLatestStageChangeFromTimeline(timelineResponse, deal) {
  const changes = collectStageChangesFromTimeline(timelineResponse);
  if (!changes.length) return null;

  const sortDesc = (a, b) => {
    const ta = Date.parse(String(a.audited_time)) || 0;
    const tb = Date.parse(String(b.audited_time)) || 0;
    if (tb !== ta) return tb - ta;
    const ia = a.timelineIndex ?? 0;
    const ib = b.timelineIndex ?? 0;
    if (ib !== ia) return ib - ia;
    const ida = String(a.row?.id ?? '');
    const idb = String(b.row?.id ?? '');
    return idb.localeCompare(ida);
  };

  const dealStageNorm =
    deal && deal.Stage != null && String(zohoPicklistDisplayString(deal.Stage)).trim()
      ? zohoNormStageLabelForMatch(deal.Stage)
      : '';

  let pool = changes;
  if (dealStageNorm) {
    const aligned = changes.filter((c) => zohoNormStageLabelForMatch(c.newVal) === dealStageNorm);
    if (aligned.length) pool = aligned;
  }

  pool.sort(sortDesc);
  const top = pool[0];

  let oldVal = top.oldVal || '';
  let newVal = top.newVal || '';

  if (dealStageNorm) {
    if (!String(newVal).trim()) {
      newVal = dealStageNorm;
    } else if (zohoNormStageLabelForMatch(newVal) !== dealStageNorm) {
      newVal = dealStageNorm;
    }
  }

  oldVal = oldVal ? zohoNormStageLabelForMatch(oldVal) || String(oldVal).trim() : '';
  newVal = newVal ? zohoNormStageLabelForMatch(newVal) || String(newVal).trim() : '';

  return {
    row: top.row,
    field: top.field,
    oldVal,
    newVal
  };
}

/**
 * Normaliza a última transição Stage (old → new) do __timeline para dois POSTs explícitos:
 * 1) DONE com action_id do estágio **anterior** (old)
 * 2) PENDING com action_id do estágio **novo** (new)
 */
function normalizeZohoDealStageTransition(deal, map, hit, opts = {}) {
  let oldVal = hit.oldVal || '';
  let newVal = hit.newVal || '';
  let usedDealStageFallback = false;
  const skipNewFb = Boolean(opts.skipDealStageNewFallback);
  if (!newVal && !skipNewFb && deal.Stage != null && String(deal.Stage).trim()) {
    newVal = normalizeZohoPicklistLabel(deal.Stage);
    usedDealStageFallback = true;
  }
  const auditedAt = hit.row.audited_time || hit.row.Audited_Time || new Date().toISOString();

  const actionIdOld = oldVal ? resolveActionTemplateIdForZohoStage(oldVal, map) : null;
  const actionIdNew = newVal ? resolveActionTemplateIdForZohoStage(newVal, map) : null;

  /**
   * DONE do estágio anterior: basta _value.old (normalizado) mapear no CRM action map.
   * Não exigir actionIdOld !== actionIdNew — vários nomes de Stage distintos partilham o mesmo
   * template (ex.: Análise do CS / Análise Adicional (Jur) → revisaprev_at_005).
   */
  const doneEligible =
    Boolean(actionIdOld && oldVal) &&
    !(isFinanceStageName(oldVal, map, deal) && !financeStageEligibleForDeal(deal));

  const pendingEligible =
    Boolean(actionIdNew && newVal) &&
    !(isFinanceStageName(newVal, map, deal) && !financeStageEligibleForDeal(deal));

  return {
    oldVal,
    newVal,
    auditedAt,
    actionIdOld,
    actionIdNew,
    usedDealStageFallback,
    doneEligible,
    pendingEligible,
    wantCompleteDelivery: stageNameCompletesDelivery(newVal),
    wantStageProcess: Boolean(actionIdOld || actionIdNew)
  };
}

/**
 * E-mail do executor para PENDING do **novo** estágio.
 * zoho-cobranca-stages: Financeiro_Respons_vel só quando o mapa marca o new stage como equipa financeira;
 * estágios CS no pipeline Cobrança usam Owner como no fluxo geral.
 */
async function resolveZohoPendingUserEmailForDealStage(
  deal,
  newVal,
  map,
  token,
  zohoUserEmailCache,
  cobrancaFinanceiroUser,
  resolveCobrancaFinanceiroEmailOnce
) {
  if (cobrancaFinanceiroUser && isFinanceStageName(newVal, map, deal)) {
    return resolveCobrancaFinanceiroEmailOnce(deal);
  }
  return resolveEmailForZohoStageTeam(newVal, deal, map, token, zohoUserEmailCache);
}

async function zohoRefreshToken() {
  const p = buildZohoFormBody();
  const r = await fetch(cfg.zoho.token.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString()
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  log('Zoho token', `status ${r.status}`, json);
  if (!r.ok) throw new Error('Zoho token falhou');
  return json.access_token;
}

const ZOHO_CRM_API_BASE = 'https://www.zohoapis.com';

function zohoStagePostToGame4uOpts() {
  const o = cfg.zoho?.stagePostToGame4u;
  return o && typeof o === 'object' ? o : {};
}

function zohoAllowMissingFinanceiroForStagePost() {
  const e = process.env.G4U_ZOHO_ALLOW_MISSING_FINANCEIRO?.trim().toLowerCase();
  if (e === '0' || e === 'false' || e === 'off') return false;
  if (e === '1' || e === 'true' || e === 'on') return true;
  const o = zohoStagePostToGame4uOpts();
  if (!('allowMissingFinanceiroLookup' in o)) return false;
  return o.allowMissingFinanceiroLookup !== false;
}

function zohoAllowPostWhenJurFilled() {
  const e = process.env.G4U_ZOHO_POST_WITH_JUR?.trim().toLowerCase();
  if (e === '0' || e === 'false' || e === 'off') return false;
  if (e === '1' || e === 'true' || e === 'on') return true;
  const o = zohoStagePostToGame4uOpts();
  if (!('allowPostWhenJuridicoResponsibleSet' in o)) return false;
  return o.allowPostWhenJuridicoResponsibleSet === true;
}

function zohoFinanceiroStageFallbackToOwnerEmail() {
  return zohoStagePostToGame4uOpts().financeiroStageUseOwnerEmailIfFinanceiroHasNoEmail !== false;
}

function zohoCrmUserRecordDisplayName(u) {
  if (!u || typeof u !== 'object') return null;
  const parts = [u.first_name ?? u.First_Name, u.last_name ?? u.Last_Name].filter(
    (x) => x != null && String(x).trim()
  );
  if (parts.length) return parts.map((x) => String(x).trim()).join(' ');
  const full = u.full_name ?? u.Full_Name ?? u.name ?? u.Name;
  if (full && String(full).trim()) return String(full).trim();
  return null;
}

async function zohoFetchCrmUserProfileById(userId, oauthToken) {
  const id = String(userId || '').trim();
  if (!id) return { email: null, displayName: null };
  const paths = [`/crm/v8/users/${id}`, `/crm/v3/users/${id}`, `/crm/v2/users/${id}`];
  for (const p of paths) {
    const r = await fetch(`${ZOHO_CRM_API_BASE}${p}`, {
      headers: { Authorization: `Zoho-oauthtoken ${oauthToken}` }
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const candidates = [];
    if (Array.isArray(j.users)) candidates.push(...j.users);
    if (Array.isArray(j.data)) candidates.push(...j.data);
    if (j.user && typeof j.user === 'object') candidates.push(j.user);
    if (candidates.length === 0 && (j.users?.[0] || j.data?.[0])) {
      candidates.push(j.users?.[0] ?? j.data?.[0]);
    }
    for (const u of candidates) {
      const emRaw = u?.email ?? u?.Email ?? u?.primary_email;
      const email = emRaw && String(emRaw).trim() ? String(emRaw).trim() : null;
      const displayName = zohoCrmUserRecordDisplayName(u);
      if (email || displayName) return { email, displayName };
    }
  }
  return { email: null, displayName: null };
}

async function zohoFetchCrmUserEmailById(userId, oauthToken) {
  const p = await zohoFetchCrmUserProfileById(userId, oauthToken);
  return p.email || null;
}

/**
 * Garante cache[id] = { email, displayName } após GET users Zoho (um pedido por id).
 */
async function zohoEnsureUserProfileInCache(lookup, oauthToken, cache) {
  if (!lookup || typeof lookup !== 'object' || !lookup.id) return null;
  const key = String(lookup.id);
  if (cache.has(key)) return cache.get(key);
  if (zohoStagePostToGame4uOpts().resolveUserEmailViaCrmUsersApi === false) {
    const empty = { email: '', displayName: '' };
    cache.set(key, empty);
    return empty;
  }
  await sleep(55);
  const prof = await zohoFetchCrmUserProfileById(key, oauthToken);
  const row = { email: prof.email || '', displayName: prof.displayName || '' };
  cache.set(key, row);
  return row;
}

/**
 * E-mail no lookup do deal; se vazio e houver id, GET users no CRM (cache por id na execução).
 */
async function zohoResolveUserEmailFromLookup(lookup, oauthToken, cache) {
  const direct = zohoUserLookupEmail(lookup);
  if (direct) return direct;
  if (!lookup || typeof lookup !== 'object' || !lookup.id) return null;
  const key = String(lookup.id);
  if (cache.has(key)) {
    const hit = cache.get(key);
    if (typeof hit === 'string') return hit ? hit : null;
    return hit?.email?.trim() || null;
  }
  const row = await zohoEnsureUserProfileInCache(lookup, oauthToken, cache);
  return row?.email?.trim() || null;
}

/**
 * Nome para cruzar com full_name do Game4U (lookup.name, ou CRM users API).
 */
async function zohoFinanceiroZohoSideDisplayName(lookup, oauthToken, cache) {
  if (typeof lookup === 'string') {
    const s = coerceZohoUserLabelForNameMatch(lookup);
    return s || null;
  }
  if (!lookup || typeof lookup !== 'object') return null;
  const n = lookup.name ?? lookup.Name ?? lookup.full_name ?? lookup.Full_Name;
  if (n && String(n).trim()) {
    const s = coerceZohoUserLabelForNameMatch(String(n).trim());
    return s || null;
  }
  if (!lookup.id) return null;
  const key = String(lookup.id);
  if (cache && !cache.has(key)) {
    await zohoEnsureUserProfileInCache(lookup, oauthToken, cache);
  }
  const row = cache?.get(key);
  if (typeof row === 'string') return null;
  const d = row?.displayName?.trim();
  return d ? coerceZohoUserLabelForNameMatch(d) : null;
}

async function cmdZohoStages(argv) {
  const noPost = argv.includes('--no-post-process');
  const postAllMapped = argv.includes('--post-all-mapped');
  const cobrancaFinanceiroUser = argv.includes('--zoho-cobranca-financeiro-user');
  const pipelineOnlyCobranca = argv.includes('--zoho-pipeline-only-cobranca');
  const cobrancaFinanceiroEmailStrict =
    cobrancaFinanceiroUser &&
    !['1', 'true', 'yes', 'on'].includes(
      String(process.env.G4U_ZOHO_COBRANCA_OWNER_FALLBACK || '').trim().toLowerCase()
    );
  const cobrancaReplayAllTimeline =
    cobrancaFinanceiroUser &&
    (argv.includes('--zoho-cobranca-all-transitions') ||
      process.env.ZOHO_COBRANCA_ALL_TIMELINE_TRANSITIONS === '1');
  const stageReplayAllTimeline =
    !cobrancaFinanceiroUser &&
    (argv.includes('--zoho-stage-replay-all-timeline') ||
      process.env.ZOHO_STAGE_REPLAY_ALL_TIMELINE === '1');
  const transitionAuditedBounds = parseTransitionAuditedBoundsFromArgv(argv);
  const dealIdsCsvRel = argvFlagValue(argv, '--deal-ids-csv');
  const cobrancaGameUserResolveOpts = { strictFinanceiroOnly: cobrancaFinanceiroEmailStrict };
  const map = loadZohoCrmActionMap();
  const { from, to, kf, kt } = zohoModifiedTimeRange();
  if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} (ou alias ZOHO_MOVIFIED_FROM / ZOHO_MOVIFIED_TO se usar o typo)`);
  }
  const criteria = pipelineOnlyCobranca
    ? buildZohoSinglePipelineSearchCriteria(zohoCobrancaPipelineDisplayName(), from, to)
    : zohoDealsSearchCriteria(from, to, argv);
  const token = await zohoRefreshToken();
  const zohoUserEmailCache = new Map();
  const dealRowCacheForCsv = new Map();
  let allDealsFetched;
  if (dealIdsCsvRel) {
    const ids = readDealIdsFromDiffCsv(dealIdsCsvRel, {
      onlyFoundNo: argv.includes('--deal-ids-csv-only-found-no')
    });
    console.log(
      `${colors.cyan}--deal-ids-csv:${colors.reset} ${ids.length} deal_id(s) únicos a hidratar via GET Deals/{id}` +
        (argv.includes('--deal-ids-csv-only-found-no') ? ' (só linhas found_in_game4u=no)' : '')
    );
    const fields =
      String(cfg.zoho?.dealsSearch?.searchIncludeFields || '').trim() ||
      'id,Layout,Pipeline,Stage,Deal_Name,Owner,Financeiro_Respons_vel,Respons_vel_Jur,Jur_dico_Respons_vel';
    allDealsFetched = [];
    for (let ii = 0; ii < ids.length; ii++) {
      if (ii > 0) await sleep(55);
      const row = await zohoGetDealRowCached(ids[ii], token, fields, dealRowCacheForCsv);
      if (row && row.id != null) {
        allDealsFetched.push(row);
      } else {
        console.warn(
          `${colors.yellow}deal_id ${ids[ii]}: GET Deals não devolveu registo — omitido do lote.${colors.reset}`
        );
      }
    }
  } else {
    allDealsFetched = await zohoFetchAllDealsSearchPages(criteria, token);
  }
  if (!allDealsFetched.length) {
    console.warn(
      `${colors.yellow}Nenhum deal (search ou --deal-ids-csv).${colors.reset}`
    );
    return;
  }
  const maxDeals = zohoRunnerMaxDeals(argv);
  const pageDeals = allDealsFetched.slice(0, maxDeals);
  if (pipelineOnlyCobranca && cobrancaFinanceiroUser) {
    console.log(
      `${colors.cyan}zoho-cobranca-stages:${colors.reset} pipeline "${zohoCobrancaPipelineDisplayName()}"; ` +
        `transição timeline: 1º POST DONE (estágio OLD), 2º POST PENDING (estágio NEW); ` +
        `DONE: equipa do OLD (CS=Owner, Fin=Financeiro_Respons_vel); ` +
        `PENDING: equipa do NEW — estágios financeiros → Financeiro (CRM/nome G4U); demais → Owner/CS` +
        (cobrancaFinanceiroEmailStrict
          ? `; strict sem Owner nem G4U_ZOHO_FALLBACK_USER_EMAIL (G4U_ZOHO_COBRANCA_OWNER_FALLBACK=1 = antigo).`
          : `; fallback Owner / G4U_ZOHO_FALLBACK_USER_EMAIL se configurado.`)
    );
  }
  if (cobrancaReplayAllTimeline) {
    console.log(
      `${colors.cyan}zoho-cobranca-stages:${colors.reset} modo ${colors.green}--zoho-cobranca-all-transitions${colors.reset} — ` +
        `cada mudança Stage no __timeline (ordem cronológica): DONE do old + PENDING do new; ` +
        `created_at do DONE = audited_time da linha (sem search). delivery/complete só na última transição se aplicável.`
    );
  }
  if (stageReplayAllTimeline) {
    console.log(
      `${colors.cyan}zoho-stages:${colors.reset} ${colors.green}--zoho-stage-replay-all-timeline${colors.reset} — ` +
        `replay de **todas** as transições Stage no __timeline (ordem cronológica): DONE (old) + PENDING (new); ` +
        `created_at do DONE = audited_time da linha (como Cobrança all-transitions).`
    );
  }
  if (transitionAuditedBounds) {
    console.log(
      `${colors.cyan}Filtro transições:${colors.reset} só linhas com audited_time em ${transitionAuditedBounds.label} (${transitionAuditedBounds.from} .. ${transitionAuditedBounds.to})`
    );
  }
  if (pageDeals.length < allDealsFetched.length) {
    console.log(
      `${colors.cyan}Deals/search: ${allDealsFetched.length} no total; processando ${pageDeals.length} (--max-deals ou ZOHO_MAX_DEALS).${colors.reset}`
    );
  } else {
    console.log(
      `${colors.cyan}Deals/search: ${pageDeals.length} deal(s) (todas as páginas). POST /game/action/process com o mesmo integration_id deve atualizar registos existentes no G4U.${colors.reset}`
    );
  }

  const bareTimeline =
    argv.includes('--zoho-timeline-bare') ||
    process.env.ZOHO_TIMELINE_BARE === '1' ||
    process.env.ZOHO_TIMELINE_BARE === 'true';

  let { from: timelineAuditedFrom, to: timelineAuditedTo } = bareTimeline
    ? { from, to }
    : zohoTimelineAuditedRangeForStageHistory(from, to);
  if (transitionAuditedBounds && !bareTimeline) {
    const bfMs = Date.parse(transitionAuditedBounds.from);
    const wfMs = Date.parse(timelineAuditedFrom);
    /**
     * Só antecipa o início ao 1º dia do mês filtrado quando o timeline calculado começa depois.
     * Não reescrever datas com toISOString() — trocar +00:00 por .000Z no filters quebra o __timeline nesta org.
     */
    if (!Number.isNaN(bfMs) && !Number.isNaN(wfMs) && wfMs > bfMs) {
      timelineAuditedFrom = transitionAuditedBounds.from;
      console.log(
        `${colors.dim}__timeline início antecipado ao 1º dia do mês filtrado (${timelineAuditedFrom}).${colors.reset}`
      );
    }
  }
  if (!bareTimeline && (timelineAuditedFrom !== from || timelineAuditedTo !== to)) {
    console.log(
      `${colors.dim}__timeline audited_time: ${timelineAuditedFrom} .. ${timelineAuditedTo} ` +
        `(alargado vs Modified_Time do search para histórico Stage CS/Financeiro).${colors.reset}`
    );
  }

  /** Zoho: intervalo audited_time com fim no futuro costuma devolver __timeline vazio (ver dealTimelineStages no config). */
  if (!bareTimeline) {
    const nowCap = new Date().toISOString();
    const tEnd = Date.parse(timelineAuditedTo);
    const tNow = Date.parse(nowCap);
    if (!Number.isNaN(tEnd) && !Number.isNaN(tNow) && tEnd > tNow) {
      console.log(
        `${colors.dim}__timeline audited fim capado ao instante atual (${nowCap}) — evita resposta vazia com data final futura.${colors.reset}`
      );
      timelineAuditedTo = nowCap;
    }
  }

  /**
   * Opcional: recuar só o início do GET __timeline (dias antes do 1º dia do mês em --zoho-transitions-only-month).
   * Valores altos (ex. 90+) podem fazer a Zoho devolver __timeline vazio — use 0 para desligar ou 7–21.
   */
  if (transitionAuditedBounds && !bareTimeline) {
    const slackRaw = process.env.ZOHO_TIMELINE_TRANSITION_FETCH_SLACK_DAYS?.trim();
    const slackDays =
      slackRaw === '' || slackRaw === undefined
        ? 0
        : Math.min(Math.max(parseInt(slackRaw, 10), 0), 45);
    if (slackDays > 0) {
      const bf = Date.parse(transitionAuditedBounds.from);
      let wf = Date.parse(timelineAuditedFrom);
      if (!Number.isNaN(bf) && !Number.isNaN(wf)) {
        const backMs = bf - slackDays * 86400000;
        const wfNew = Math.min(wf, backMs);
        if (wfNew < wf) {
          timelineAuditedFrom = new Date(wfNew).toISOString();
          console.log(
            `${colors.dim}__timeline início recuado ${slackDays}d antes de ${transitionAuditedBounds.from} (ZOHO_TIMELINE_TRANSITION_FETCH_SLACK_DAYS).${colors.reset}`
          );
        }
      }
    }
  }

  if (!noPost) await ensureToken();

  if (cobrancaFinanceiroUser) {
    await ensureToken();
    try {
      const resolver = await buildGame4uZohoDisplayNameEmailResolver();
      cobrancaGameUserResolveOpts.game4uNameResolver = resolver;
      console.log(
        `${colors.dim}G4U: ${resolver.debugCounts.users} utilizador(es) para match Financeiro por nome; ` +
          `team_id Financeiro=${resolver.debugCounts.financeiroTeamId ?? 'n/d'}.${colors.reset}`
      );
    } catch (e) {
      console.warn(
        `${colors.yellow}Não foi possível carregar utilizadores Game4U para match por nome: ${e.message || e}${colors.reset}`
      );
    }
  }

  let aprilStageTeamDismissActive = false;
  let aprilStageLookupCat = null;
  let aprilEmailToTeamKey = null;
  if (
    !noPost &&
    zohoAprilTransitionTeamDismissEnabled(transitionAuditedBounds) &&
    !argv.includes('--zoho-skip-april-stage-team-dismiss')
  ) {
    const tarefasRows = loadTarefasPorTimesRowsFromXlsx();
    if (tarefasRows.length) {
      aprilStageLookupCat = buildTarefasPorTimesStageCategoryLookup(tarefasRows);
      try {
        aprilEmailToTeamKey = await buildGame4uEmailToTeamKeyIndex();
        aprilStageTeamDismissActive = true;
        console.log(
          `${colors.cyan}Abril — validação "Tarefas por times.xlsx" × equipa G4U:${colors.reset} ` +
            `${tarefasRows.length} linha(s) na planilha; ${aprilEmailToTeamKey.size} e-mail(es) com team_id mapeado (teamsDefinition). ` +
            `Stage casado na planilha com categoria **diferente** do time do jogador ⇒ POST com dismissed=true (DONE no OLD, PENDING no NEW). ` +
            `${colors.dim}Desligar: --zoho-skip-april-stage-team-dismiss${colors.reset}`
        );
      } catch (e) {
        console.warn(
          `${colors.yellow}Abril planilha×time: falha ao carregar /team ou utilizadores: ${e?.message || e}${colors.reset}`
        );
      }
    }
  }

  let builtPayloads = 0;
  let postsOk = 0;
  let postsDismissedApril = 0;
  let deliveryCompleteOk = 0;
  const totalDeals = pageDeals.length;
  const cobrancaFinanceiroEmailByDealId = new Map();

  async function resolveCobrancaFinanceiroEmailOnce(deal) {
    const id = String(deal.id);
    if (cobrancaFinanceiroEmailByDealId.has(id)) return cobrancaFinanceiroEmailByDealId.get(id);
    const em = await resolveEmailZohoCobrancaGameUser(
      deal,
      token,
      zohoUserEmailCache,
      cobrancaGameUserResolveOpts
    );
    cobrancaFinanceiroEmailByDealId.set(id, em);
    return em;
  }

  for (let i = 0; i < pageDeals.length; i++) {
    const deal = pageDeals[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);

    const j2 = await zohoFetchMergedDealTimeline(
      deal.id,
      timelineAuditedFrom,
      timelineAuditedTo,
      token,
      bareTimeline
    );
    const tlCount = j2?.__timeline?.length ?? 0;
    log(
      `Zoho __timeline [${i + 1}/${totalDeals}] deal ${deal.id}`,
      `${tlCount} entrada(s) fundidas (todas as páginas com page_token)`,
      tlCount <= 30 ? j2 : { __timeline_len: tlCount, note: 'corpo truncado no log' }
    );

    let hits;
    if (cobrancaReplayAllTimeline || stageReplayAllTimeline) {
      hits = timelineStageChangesToHitsAsc(j2).filter((h) => h.oldVal || h.newVal);
    } else {
      const h = pickLatestStageChangeFromTimeline(j2, deal);
      hits = h ? [h] : [];
    }
    if (transitionAuditedBounds) {
      const before = hits.length;
      hits = filterStageHitsByAuditedWindow(hits, transitionAuditedBounds);
      if (before && !hits.length) {
        console.warn(
          `${colors.dim}deal ${deal.id}: ${before} transição(ões) Stage no __timeline, nenhuma com audited_time no intervalo filtrado — pulando.${colors.reset}`
        );
      }
    }
    if (!hits.length) {
      console.warn(
        `${colors.dim}deal ${deal.id}: sem field_history com api_name stage/Stage no __timeline — pulando.${colors.reset}`
      );
      continue;
    }

    const jur = getZohoJuridicoResponsibleLookup(deal);
    if (zohoJuridicoResponsiblePresent(jur) && !zohoAllowPostWhenJurFilled()) {
      console.warn(
        `${colors.dim}deal ${deal.id}: Responsável Jurídico preenchido — POST por Stage omitido (usar fluxo de tags / zoho-tasks ou zoho.stagePostToGame4u.allowPostWhenJuridicoResponsibleSet).${colors.reset}`
      );
      continue;
    }

    const needFinOnce = dealRequiresFinanceiroLookupForStagePost(deal);
    const allowMissFinOnce = zohoAllowMissingFinanceiroForStagePost();
    if (
      !zohoUserLookupFilled(deal.Owner) ||
      (needFinOnce && !allowMissFinOnce && !zohoUserLookupFilled(deal.Financeiro_Respons_vel))
    ) {
      console.warn(
        `${colors.yellow}deal ${deal.id}: exige Owner (CS)${needFinOnce && !allowMissFinOnce ? ' e Financeiro_Respons_vel' : ''} para POST por Stage — pulando.${colors.reset}`
      );
      continue;
    }

    let anyOkThisDeal = false;
    let dealBuilt = 0;
    let lastHttpStatusThisDeal = 0;
    let hadCompleteDelivery = false;
    const repTag = (ti) =>
      hits.length > 1 ? ` rep ${ti + 1}/${hits.length}` : '';

    for (let ti = 0; ti < hits.length; ti++) {
      const hit = hits[ti];
      const isLastHit = ti === hits.length - 1;
      const transition = normalizeZohoDealStageTransition(deal, map, hit, {
        skipDealStageNewFallback: cobrancaReplayAllTimeline || stageReplayAllTimeline
      });
      let {
        oldVal,
        newVal,
        auditedAt,
        actionIdOld,
        actionIdNew,
        doneEligible,
        pendingEligible,
        wantCompleteDelivery,
        wantStageProcess,
        usedDealStageFallback
      } = transition;

      if (cobrancaReplayAllTimeline || stageReplayAllTimeline) {
        wantCompleteDelivery = Boolean(isLastHit && stageNameCompletesDelivery(newVal));
      }

      if (usedDealStageFallback) {
        console.warn(
          `${colors.dim}deal ${deal.id}:${repTag(ti)} transição Stage sem _value.new no timeline — usando Stage atual do deal como newVal.${colors.reset}`
        );
      }

      if (!wantStageProcess && !wantCompleteDelivery) {
        console.warn(
          `${colors.dim}deal ${deal.id}:${repTag(ti)} Stage novo "${newVal}" sem mapa e fora de stagesThatCompleteDelivery — pulando transição.${colors.reset}`
        );
        continue;
      }

      let pendingAssigneeEmail = null;
      if (wantStageProcess && pendingEligible) {
        pendingAssigneeEmail = await resolveZohoPendingUserEmailForDealStage(
          deal,
          newVal,
          map,
          token,
          zohoUserEmailCache,
          cobrancaFinanceiroUser,
          resolveCobrancaFinanceiroEmailOnce
        );
      }

      if (wantStageProcess && cobrancaFinanceiroUser && pendingEligible) {
        if (!pendingAssigneeEmail) {
          console.warn(
            `${colors.yellow}deal ${deal.id}:${repTag(ti)} Cobrança — sem e-mail para PENDING do Stage "${newVal}"` +
              (cobrancaFinanceiroEmailStrict
                ? ` (strict). Corrija lookup/CRM ou match nome Game4U. Para usar Owner: G4U_ZOHO_COBRANCA_OWNER_FALLBACK=1.`
                : ` (ou fallback Owner / G4U_ZOHO_FALLBACK_USER_EMAIL).`) +
              ` — pulando esta transição.${colors.reset}`
          );
          continue;
        }
      }

      // Fase 1 — DONE: fecha a user_action do estágio anterior (old) no histórico Zoho.
      if (wantStageProcess && doneEligible) {
        const emailOld = await resolveEmailForZohoStageTeam(
          oldVal,
          deal,
          map,
          token,
          zohoUserEmailCache
        );
        if (!emailOld) {
          console.warn(
            `${colors.yellow}deal ${deal.id}:${repTag(ti)} sem e-mail para DONE do estágio anterior "${oldVal}" — pulando DONE.${colors.reset}`
          );
        } else {
          const stableOld = buildZohoStableIntegrationId(deal.id, actionIdOld);
          let createdAtForDone = null;
          if (noPost) {
            createdAtForDone = auditedAt;
          } else if (cobrancaReplayAllTimeline || stageReplayAllTimeline) {
            createdAtForDone = auditedAt;
          } else {
            const searchRes = await game4uFetchUserActionsForDoneLookup(deal.id);
            log(
              `GET user-action/search (deal ${deal.id}, fechar estágio OLD "${oldVal}" action ${actionIdOld}; PENDING+CANCELLED)`,
              `status ${searchRes.status}`,
              searchRes.json
            );
            if (searchRes.ok) {
              const items = unwrapGame4uUserActionSearchItems(searchRes);
              const row = findPendingUserActionToClose(items, deal.id, stableOld, actionIdOld);
              if (row?.created_at) createdAtForDone = row.created_at;
            }
            if (!createdAtForDone && zohoStageDoneAllowAuditedWhenSearchMiss()) {
              createdAtForDone = auditedAt;
              console.warn(
                `${colors.dim}deal ${deal.id}: DONE estágio OLD — usando audited_time como created_at (search sem PENDING/CANCELLED para action ${actionIdOld}; G4U_ZOHO_STAGE_DONE_USE_AUDITED_WHEN_SEARCH_MISS=0 para omitir).${colors.reset}`
              );
            }
          }

          if (!createdAtForDone) {
            console.warn(
              `${colors.yellow}deal ${deal.id}:${repTag(ti)} DONE omitido — user_action PENDING/CANCELLED do estágio OLD não encontrada (action ${actionIdOld}; integration_id ${buildZohoStableIntegrationId(deal.id, actionIdOld)}; legado timeline-*). Aumente G4U_USER_ACTION_SEARCH_LIMIT ou G4U_USER_ACTION_SEARCH_MAX_PAGES; se a linha estiver dismissed, use G4U_USER_ACTION_DONE_LOOKUP_INCLUDE_DISMISSED=1.${colors.reset}`
            );
          } else {
            const dismissAprilDone =
              aprilStageTeamDismissActive &&
              shouldDismissForAprilStageTeamMismatch({
                lookupCat: aprilStageLookupCat,
                emailToTeamKey: aprilEmailToTeamKey,
                stageTitle: oldVal,
                userEmail: emailOld
              });
            if (dismissAprilDone) {
              console.log(
                `${colors.dim}deal ${deal.id}:${repTag(ti)} DONE estágio OLD "${oldVal}" — categoria (planilha) ≠ time G4U do utilizador → dismissed=true.${colors.reset}`
              );
            }
            const doneBody = buildGameProcessPayloadZohoStageProcess({
              deal,
              actionId: actionIdOld,
              userEmail: emailOld,
              status: 'DONE',
              integrationId: stableOld,
              createdAt: createdAtForDone,
              finishedAt: auditedAt,
              oldVal,
              newVal,
              audited: auditedAt,
              dismissed: dismissAprilDone
            });
            dealBuilt++;
            log(
              `POST /game/action/process DONE [estágio OLD] (deal ${deal.id}, ${i + 1}/${totalDeals})${repTag(ti)}`,
              `"${oldVal}" → "${newVal}" | action_id=${actionIdOld}`,
              doneBody
            );
            if (!noPost) {
              const prDone = await game4uActionProcessWithRestoreOnCancelledPending(
                cfg.gameActionProcess.path,
                cfg.gameActionProcess.method,
                doneBody
              );
              log(
                `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path} DONE deal ${deal.id}`,
                `status ${prDone.status}`,
                prDone.json
              );
              lastHttpStatusThisDeal = prDone.status;
              if (isGameActionProcessResponseOk(prDone)) {
                anyOkThisDeal = true;
                postsOk++;
                if (dismissAprilDone) postsDismissedApril++;
              }
              await sleep(80);
            }
          }
        }
      }

      // Fase 2 — PENDING: abre a user_action do estágio novo (new) no histórico Zoho.
      if (wantStageProcess && pendingEligible) {
        if (!pendingAssigneeEmail) {
          console.warn(
            `${colors.yellow}deal ${deal.id}:${repTag(ti)} sem e-mail para PENDING do estágio NEW "${newVal}" — pulando PENDING.${colors.reset}`
          );
        } else {
          const stableNew = buildZohoStableIntegrationId(deal.id, actionIdNew);
          const dismissAprilPending =
            aprilStageTeamDismissActive &&
            shouldDismissForAprilStageTeamMismatch({
              lookupCat: aprilStageLookupCat,
              emailToTeamKey: aprilEmailToTeamKey,
              stageTitle: newVal,
              userEmail: pendingAssigneeEmail
            });
          if (dismissAprilPending) {
            console.log(
              `${colors.dim}deal ${deal.id}:${repTag(ti)} PENDING estágio NEW "${newVal}" — categoria (planilha) ≠ time G4U → dismissed=true.${colors.reset}`
            );
          }
          const pendingBody = buildGameProcessPayloadZohoStageProcess({
            deal,
            actionId: actionIdNew,
            userEmail: pendingAssigneeEmail,
            status: 'PENDING',
            integrationId: stableNew,
            createdAt: auditedAt,
            finishedAt: null,
            oldVal,
            newVal,
            audited: auditedAt,
            dismissed: dismissAprilPending
          });
          dealBuilt++;
          log(
            `POST /game/action/process PENDING [estágio NEW] (deal ${deal.id}, ${i + 1}/${totalDeals})${repTag(ti)}`,
            `"${oldVal}" → "${newVal}" | action_id=${actionIdNew}`,
            pendingBody
          );
          if (!noPost) {
            const prPen = await game4uActionProcessWithRestoreOnCancelledPending(
              cfg.gameActionProcess.path,
              cfg.gameActionProcess.method,
              pendingBody
            );
            log(
              `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path} PENDING deal ${deal.id}`,
              `status ${prPen.status}`,
              prPen.json
            );
            lastHttpStatusThisDeal = prPen.status;
            if (isGameActionProcessResponseOk(prPen)) {
              anyOkThisDeal = true;
              postsOk++;
              if (dismissAprilPending) postsDismissedApril++;
            }
            await sleep(80);
          }
        }
      }

      if (wantCompleteDelivery) {
        log(
          `POST delivery/complete (deal ${deal.id})${repTag(ti)}`,
          `Stage novo "${newVal}" em stagesThatCompleteDelivery`,
          { finished_at: auditedAt }
        );
        if (!noPost) {
          const dr = await game4uPostDeliveryCompleteIfConfigured(deal.id, auditedAt);
          log(`POST .../delivery/.../complete deal ${deal.id}`, `status ${dr.status}`, dr.json);
          lastHttpStatusThisDeal = dr.status;
          if (dr.ok) {
            anyOkThisDeal = true;
            deliveryCompleteOk++;
            hadCompleteDelivery = true;
          }
        } else {
          dealBuilt++;
        }
      }
    }

    builtPayloads += dealBuilt;
    announceDone(
      i + 1,
      totalDeals,
      `Zoho→G4U deal ${deal.id} (process + delivery)`,
      anyOkThisDeal,
      lastHttpStatusThisDeal,
      { dealBuilt, wantCompleteDelivery: hadCompleteDelivery }
    );
    await maybePauseBetweenOps(argv);

    if (anyOkThisDeal && !postAllMapped) {
      console.log(
        `${colors.green}Primeira operação bem-sucedida neste deal; use --post-all-mapped para os demais.${colors.reset}`
      );
      break;
    }
  }

  if (noPost) {
    console.log(
      `${colors.yellow}[--no-post-process] ${builtPayloads} payload(s) montado(s) a partir de ${totalDeals} deal(s) (após paginação completa do search).${colors.reset}`
    );
  } else {
    console.log(
      `\nResumo Zoho→Game4U: ${postsOk} POST(s) /game/action/process OK, ${deliveryCompleteOk} delivery complete OK, ${builtPayloads} payload(s) montados (estimativa)` +
        (postsDismissedApril > 0
          ? `; ${postsDismissedApril} POST(s) OK com dismissed=true (abr.: planilha "Tarefas por times" × time G4U).`
          : '.')
    );
    if (builtPayloads === 0) {
      console.warn(
        `${colors.yellow}Nenhum deal teve Stage no mapa + timeline; verifique zoho-crm-action-map.json ou G4U_ZOHO_STAGE_ACTION_ID.${colors.reset}`
      );
    }
  }
}

/**
 * Diagnóstico sem POST: contagens alinhadas ao plano (skips Zoho + DONE jur vs /user-action/search).
 * Flags: --zoho-tasks-debug-verbose (log por deal), --zoho-tasks-debug-skip-game-lookup (só Zoho, sem token Game4U).
 */
async function cmdZohoTasksDebugSummary(argv) {
  const map = loadZohoCrmActionMap();
  const verbose = argv.includes('--zoho-tasks-debug-verbose');
  const skipGame = argv.includes('--zoho-tasks-debug-skip-game-lookup');
  const preferOwner = isZohoTasksPreferTaskOwnerEmail(argv);

  const { from, to, kf, kt, aprilYear } = zohoTasksResolveSearchRange(argv);
  if (aprilYear != null) {
    console.log(
      `${colors.cyan}zoho-tasks: filtro abril ativo — Deals/search só Modified_Time ${from} .. ${to} (ano ${aprilYear}). ` +
        `ZOHO_MODIFIED_* do .env é ignorado neste run.${colors.reset}`
    );
  }

  const criteria = zohoDealsSearchCriteria(from, to, argv);
  console.log(
    `${colors.cyan}zoho-tasks-debug-summary: critério Deals/search (Modified_Time + pipeline se ativo).${colors.reset}\n` +
      `  from=${from}\n  to=${to}\n  aprilYear=${aprilYear ?? '(não)'}\n  env keys (referência): ${kf}, ${kt}\n` +
      `  skipGameLookup=${skipGame}  preferTaskOwnerEmail=${preferOwner}`
  );

  const token = await zohoRefreshToken();
  const zohoUserEmailCache = new Map();
  const zohoDealRowCacheForJur = new Map();
  const allDealsFetched = await zohoFetchAllDealsSearchPages(criteria, token);
  const maxDeals = zohoRunnerMaxDeals(argv);
  const subset = allDealsFetched.slice(0, maxDeals);

  const stats = {
    deals_search_total: allDealsFetched.length,
    deals_visited_max: subset.length,
    skipped_no_jur: 0,
    skipped_no_hits: 0,
    skipped_no_email: 0,
    deals_with_hits: 0,
    hit_pending: 0,
    hit_done: 0,
    done_rows_pending_found: 0,
    done_rows_missing_pending: 0,
    done_would_backfill_with_task_created_at: 0,
    samples_no_jur: [],
    samples_no_hits: [],
    samples_no_email: [],
    samples_done_missing_pending: [],
    spot_check_done_missing: []
  };

  let gameLookupOk = !skipGame;
  if (gameLookupOk) {
    try {
      await ensureToken();
    } catch (e) {
      gameLookupOk = false;
      console.warn(
        `${colors.yellow}Login Game4U falhou — use --zoho-tasks-debug-skip-game-lookup ou defina G4U_ADMIN_EMAIL/PASSWORD. ${String(
          e?.message || e
        )}${colors.reset}`
      );
    }
  }

  const jurCfg = cfg.zoho?.jurActivitiesFromZoho || {};
  const allowDoneFromTaskTime =
    jurCfg.allowDoneUsingTaskCreatedAtWhenSearchMiss === true ||
    process.env.G4U_ZOHO_JUR_DONE_USE_TASK_CREATED_AT === '1';

  for (let i = 0; i < subset.length; i++) {
    const deal = subset[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);

    const jur = getZohoJuridicoResponsibleLookup(deal);
    if (!zohoJuridicoResponsiblePresent(jur)) {
      stats.skipped_no_jur++;
      pushZohoDebugSample(stats.samples_no_jur, { deal_id: String(deal.id), deal_name: deal.Deal_Name });
      if (verbose) {
        console.warn(
          `${colors.dim}deal ${deal.id}: sem Respons_vel_Jur / Jur_dico_Respons_vel — pulando.${colors.reset}`
        );
      }
      continue;
    }

    const list = await zohoFetchAllActivitiesChronologicalForDeal(deal.id, token);
    const hits = findLatestActivitiesPerJurActionTemplate(list, map);
    if (!hits.length) {
      stats.skipped_no_hits++;
      pushZohoDebugSample(stats.samples_no_hits, { deal_id: String(deal.id), activities: list.length });
      if (verbose) {
        console.warn(
          `${colors.dim}deal ${deal.id}: nenhuma atividade com texto de tagFlowTitleToActionTemplateId — pulando.${colors.reset}`
        );
      }
      continue;
    }

    stats.deals_with_hits++;

    for (const hit of hits) {
      const taskStatusRaw = zohoActivityTaskStatus(hit.activity);
      const g4uStatus = mapZohoTaskStatusToGame4uStatus(taskStatusRaw);
      const stableIntId = buildZohoJurStableIntegrationId(deal.id, hit.actionId);

      const email = await zohoResolveEmailForJurHit(
        jur,
        deal.id,
        token,
        zohoUserEmailCache,
        zohoDealRowCacheForJur,
        hit.activity,
        preferOwner
      );
      if (!email) {
        stats.skipped_no_email++;
        pushZohoDebugSample(stats.samples_no_email, {
          deal_id: String(deal.id),
          action_id: hit.actionId
        });
        continue;
      }

      if (g4uStatus === 'PENDING') {
        stats.hit_pending++;
        continue;
      }

      stats.hit_done++;
      if (!gameLookupOk) {
        continue;
      }
      let createdAtUse = null;
      const searchRes = await game4uFetchUserActionsForDoneLookup(deal.id);
      await sleep(35);
      if (searchRes.ok) {
        const items = unwrapGame4uUserActionSearchItems(searchRes);
        const row = findPendingUserActionToClose(items, deal.id, stableIntId, hit.actionId);
        if (row?.created_at) createdAtUse = row.created_at;
      }
      if (createdAtUse) {
        stats.done_rows_pending_found++;
      } else if (allowDoneFromTaskTime) {
        stats.done_would_backfill_with_task_created_at++;
      } else {
        stats.done_rows_missing_pending++;
        pushZohoDebugSample(stats.samples_done_missing_pending, {
          deal_id: String(deal.id),
          action_id: hit.actionId,
          integration_id: stableIntId,
          subject: String(hit.activity.Subject ?? hit.activity.subject ?? '').slice(0, 120),
          zoho_status: taskStatusRaw
        });
        if (stats.spot_check_done_missing.length < 5) {
          stats.spot_check_done_missing.push({
            deal_id: String(deal.id),
            action_id: hit.actionId,
            integration_id: stableIntId,
            subject: String(hit.activity.Subject ?? hit.activity.subject ?? ''),
            task_owner: hit.activity.Owner?.email || hit.activity.Owner?.name || null,
            jur_resolved_email: email
          });
        }
      }
    }
  }

  const jf = join(ROOT, 'zoho-tasks-debug-summary.json');
  try {
    writeFileSync(jf, JSON.stringify(stats, null, 2), 'utf8');
    console.log(`${colors.cyan}Resumo escrito em ${jf}${colors.reset}`);
  } catch (e) {
    console.warn(`${colors.yellow}Não foi possível gravar JSON: ${e}${colors.reset}`);
  }

  console.log('\n━━ zoho-tasks-debug-summary (objeto) ━━');
  dump(stats, 20000);

  console.log(
    `\n${colors.cyan}Leitura rápida:${colors.reset}\n` +
      `  deals no search: ${stats.deals_search_total} (visitados ${stats.deals_visited_max})\n` +
      `  sem jur no deal: ${stats.skipped_no_jur}\n` +
      `  sem hit de tag no mapa: ${stats.skipped_no_hits}\n` +
      `  sem e-mail (jur/task): ${stats.skipped_no_email}\n` +
      `  deals com ≥1 hit: ${stats.deals_with_hits}\n` +
      `  hits PENDING (POST criaria/atualizaria aberto): ${stats.hit_pending}\n` +
      `  hits DONE: ${stats.hit_done}\n` +
      `    DONE com PENDING/CANCELLED no G4U (POST fecharia): ${stats.done_rows_pending_found}\n` +
      `    DONE sem linha jur no search (POST omitido hoje): ${stats.done_rows_missing_pending}\n` +
      `    DONE que o backfill por task created_at salvaria (flag já ativa): ${stats.done_would_backfill_with_task_created_at}\n`
  );

  if (stats.done_rows_missing_pending > 0 && !allowDoneFromTaskTime) {
    console.log(
      `${colors.yellow}Sugestão: muitos DONE sem PENDING prévio — ative temporariamente G4U_ZOHO_JUR_DONE_USE_TASK_CREATED_AT=1 ` +
        `ou jurActivitiesFromZoho.allowDoneUsingTaskCreatedAtWhenSearchMiss no api-scripts.config.json (ver nota de risco no config).${colors.reset}`
    );
  }
  if (preferOwner) {
    console.log(
      `${colors.dim}Task-owner e-mail já está ativo para o runner normal (--zoho-tasks-task-owner-email / G4U_ZOHO_JUR_TASK_USER_EMAIL=owner).${colors.reset}`
    );
  } else if (stats.hit_done + stats.hit_pending > 0) {
    console.log(
      `${colors.dim}Se o painel filtra pelo executor da task: experimente --zoho-tasks-task-owner-email ou env G4U_ZOHO_JUR_TASK_USER_EMAIL=owner.${colors.reset}`
    );
  }
}

async function cmdZohoTasks(argv) {
  if (argv.includes('--zoho-tasks-debug-summary')) {
    return cmdZohoTasksDebugSummary(argv);
  }

  const noPost = argv.includes('--no-post-process');
  const postAllMapped = argv.includes('--post-all-mapped');
  const map = loadZohoCrmActionMap();
  const preferTaskOwner = isZohoTasksPreferTaskOwnerEmail(argv);

  const { from, to, kf, kt, aprilYear } = zohoTasksResolveSearchRange(argv);
  if (aprilYear != null) {
    console.log(
      `${colors.cyan}zoho-tasks: filtro abril ativo — Deals/search só Modified_Time ${from} .. ${to} (ano ${aprilYear}). ` +
        `ZOHO_MODIFIED_* do .env é ignorado neste run. Desligue com G4U_ZOHO_TASKS_APRIL_DEALS=0 ou omita --zoho-tasks-april-deals.${colors.reset}`
    );
  }
  const criteria = zohoDealsSearchCriteria(from, to, argv);
  if (preferTaskOwner) {
    console.log(
      `${colors.dim}zoho-tasks: user_email = Owner da task quando resolvível (--zoho-tasks-task-owner-email / G4U_ZOHO_JUR_TASK_USER_EMAIL=owner).${colors.reset}`
    );
  }
  const token = await zohoRefreshToken();
  const zohoUserEmailCache = new Map();
  const zohoDealRowCacheForJur = new Map();
  const allDealsFetched = await zohoFetchAllDealsSearchPages(criteria, token);
  if (!allDealsFetched.length) {
    console.warn(`${colors.yellow}Nenhum deal no Deals/search (todas as páginas).${colors.reset}`);
    return;
  }
  const maxDeals = zohoRunnerMaxDeals(argv);
  const subset = allDealsFetched.slice(0, maxDeals);
  if (subset.length < allDealsFetched.length) {
    console.log(
      `${colors.cyan}zoho-tasks: ${allDealsFetched.length} deals no search; processando ${subset.length} (--max-deals / ZOHO_MAX_DEALS).${colors.reset}`
    );
  } else {
    console.log(
      `${colors.cyan}zoho-tasks: ${subset.length} deal(s). POST com mesmo integration_id deve atualizar o G4U.${colors.reset}`
    );
  }
  if (!noPost) await ensureToken();

  let postsOk = 0;
  let builtPayloads = 0;
  const totalDeals = subset.length;

  for (let i = 0; i < subset.length; i++) {
    const deal = subset[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);

    let lastHttpStatus = 0;
    let anyOkThisDeal = false;
    let dealBuilt = 0;

    const jur = getZohoJuridicoResponsibleLookup(deal);
    if (!zohoJuridicoResponsiblePresent(jur)) {
      console.warn(
        `${colors.dim}deal ${deal.id}: sem Respons_vel_Jur / Jur_dico_Respons_vel — pulando (zoho-tasks só deals com jurídico).${colors.reset}`
      );
      continue;
    }

    const list = await zohoFetchAllActivitiesChronologicalForDeal(deal.id, token);
    log(
      `Zoho Activities_Chronological [${i + 1}/${totalDeals}] deal ${deal.id}`,
      `${list.length} atividade(s) (todas as páginas)`,
      list.length <= 12 ? list : { total: list.length, preview: list.slice(0, 3) }
    );
    const hits = findLatestActivitiesPerJurActionTemplate(list, map);
    if (!hits.length) {
      console.warn(
        `${colors.dim}deal ${deal.id}: nenhuma atividade com texto de tagFlowTitleToActionTemplateId — pulando.${colors.reset}`
      );
      continue;
    }

    for (let hi = 0; hi < hits.length; hi++) {
      const hit = hits[hi];
      if (hi > 0) await sleep(80);

      const email = await zohoResolveEmailForJurHit(
        jur,
        deal.id,
        token,
        zohoUserEmailCache,
        zohoDealRowCacheForJur,
        hit.activity,
        preferTaskOwner
      );
      if (!email) {
        console.warn(
          `${colors.yellow}deal ${deal.id}: jurídico/task Owner sem e-mail resolvido — pulando hit ${hi + 1}/${hits.length}.${colors.reset}`
        );
        continue;
      }

      const taskStatusRaw = zohoActivityTaskStatus(hit.activity);
      const g4uStatus = mapZohoTaskStatusToGame4uStatus(taskStatusRaw);
      const audited =
        hit.activity.Modified_Time ||
        hit.activity.modified_time ||
        hit.activity.Created_Time ||
        hit.activity.created_time ||
        new Date().toISOString();
      const stableIntId = buildZohoJurStableIntegrationId(deal.id, hit.actionId);

      let createdAtUse =
        hit.activity.Created_Time || hit.activity.created_time || audited;

      if (g4uStatus === 'DONE') {
        createdAtUse = null;
        if (!noPost) {
          const searchRes = await game4uFetchUserActionsForDoneLookup(deal.id);
          log(
            `GET user-action/search (deal ${deal.id}, jur DONE ${hit.actionId}; PENDING+CANCELLED)`,
            `status ${searchRes.status}`,
            searchRes.json
          );
          if (searchRes.ok) {
            const items = unwrapGame4uUserActionSearchItems(searchRes);
            const row = findPendingUserActionToClose(items, deal.id, stableIntId, hit.actionId);
            if (row?.created_at) createdAtUse = row.created_at;
          }
        } else {
          createdAtUse = audited;
        }
        const jurCfg = cfg.zoho?.jurActivitiesFromZoho || {};
        const allowDoneFromTaskTime =
          jurCfg.allowDoneUsingTaskCreatedAtWhenSearchMiss === true ||
          process.env.G4U_ZOHO_JUR_DONE_USE_TASK_CREATED_AT === '1';
        if (!createdAtUse && allowDoneFromTaskTime) {
          createdAtUse =
            hit.activity.Created_Time || hit.activity.created_time || audited;
          console.warn(
            `${colors.yellow}deal ${deal.id}: DONE jur usando created_at da task Zoho (sem PENDING no search; risco se o registo G4U existir com outro created_at).${colors.reset}`
          );
        }
        if (!createdAtUse) {
          console.warn(
            `${colors.yellow}deal ${deal.id}: DONE jur omitido — user_action PENDING/CANCELLED não encontrada (integration_id esperado ${stableIntId}).${colors.reset}`
          );
          announceDone(
            i + 1,
            totalDeals,
            `Zoho Jur→G4U deal ${deal.id} [${hi + 1}/${hits.length}]`,
            false,
            lastHttpStatus,
            { skipped: 'DONE sem created_at da API', action_id: hit.actionId }
          );
          await maybePauseBetweenOps(argv);
          continue;
        }
      }

      const integrationComment = `Zoho CRM (Jurídico): "${hit.tagFlowKey}" — status "${taskStatusRaw}"`;
      const body = buildGameProcessPayloadZohoStageProcess({
        deal,
        actionId: hit.actionId,
        userEmail: email,
        status: g4uStatus,
        integrationId: stableIntId,
        createdAt: createdAtUse,
        finishedAt: g4uStatus === 'DONE' ? audited : null,
        oldVal: hit.tagFlowKey,
        newVal: taskStatusRaw,
        audited,
        integrationComment: g4uStatus === 'PENDING' ? integrationComment : undefined
      });

      dealBuilt++;
      builtPayloads++;
      log(
        `POST /game/action/process JUR ${g4uStatus} (deal ${deal.id}, ${i + 1}/${totalDeals}; hit ${hi + 1}/${hits.length})`,
        `action_id=${hit.actionId}`,
        body
      );

      if (!noPost) {
        const pr = await game4uActionProcessWithRestoreOnCancelledPending(
          cfg.gameActionProcess.path,
          cfg.gameActionProcess.method,
          body
        );
        lastHttpStatus = pr.status;
        log(
          `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path} JUR deal ${deal.id}`,
          `status ${pr.status}`,
          pr.json
        );
        if (isGameActionProcessResponseOk(pr)) {
          anyOkThisDeal = true;
          postsOk++;
        }
        await sleep(80);
      }

      announceDone(
        i + 1,
        totalDeals,
        `Zoho Jur→G4U deal ${deal.id} (${g4uStatus}) [hit ${hi + 1}/${hits.length}]`,
        noPost ? dealBuilt > 0 : anyOkThisDeal,
        lastHttpStatus,
        { dealBuilt, g4uStatus, integration_id: stableIntId, action_id: hit.actionId }
      );
      await maybePauseBetweenOps(argv);
    }

    if (anyOkThisDeal && !postAllMapped && !noPost) {
      console.log(
        `${colors.green}Primeira operação bem-sucedida neste deal; use --post-all-mapped para os demais.${colors.reset}`
      );
      break;
    }
  }

  if (noPost) {
    console.log(
      `${colors.yellow}[--no-post-process] ${builtPayloads} payload(s) montado(s) (zoho-tasks).${colors.reset}`
    );
  } else {
    console.log(`\nResumo zoho-tasks: ${postsOk} POST(s) /game/action/process OK, ${builtPayloads} payload(s) montados.`);
  }
}

async function cmdSyncActionTemplatePoints(argv) {
  const dry = argv.includes('--dry-run');
  const stopOnError = argv.includes('--stop-on-error');
  const skipWriteJson = argv.includes('--no-write-json');
  await ensureToken();

  const file = join(__dirname, 'revisaprev-action-template.json');
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const fileRows = rows.map((r) => ({ ...r }));
  let ok = 0;
  let fail = 0;

  log(
    'sync-action-template-points',
    `criteria = { complexity, importance, executionTime, seniorityLevel } (strings); points = (c×3)×i×e×s; PUT /action/{id}. Itens: ${rows.length}${dry ? ' (dry-run)' : ''}`
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = row.id;
    const gr = await game4uFetch(`/action/${encodeURIComponent(id)}`);

    const sourceCriteria = gr.ok && gr.json?.criteria != null ? gr.json.criteria : row.criteria;
    if (!gr.ok) {
      log(`GET /action/${id}`, `status ${gr.status} — criteria do arquivo`, gr.json);
    }

    const axes = criteriaToAxesCriteria(sourceCriteria);
    const points = computePointsFromAxesCriteria(axes);
    const oldPoints = gr.ok ? gr.json?.points : row.points;
    const idx = fileRows.findIndex((r) => r.id === id);

    if (dry) {
      console.log(
        `${colors.dim}[${i + 1}/${rows.length}]${colors.reset} ${id}: points ${oldPoints} → ${points} ((c×3)×i×e×s)`
      );
      continue;
    }

    const putBody = {
      points,
      criteria: axes,
      title: gr.ok ? gr.json?.title ?? row.title : row.title,
      integration_id: gr.ok ? gr.json?.integration_id ?? null : row.integration_id ?? null,
      deactivated_at: gr.ok ? gr.json?.deactivated_at ?? null : row.deactivated_at ?? null
    };

    const pr = await game4uFetch(`/action/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: putBody
    });
    console.log(
      `${pr.ok ? colors.green : colors.red}PUT /action ${id} points=${points} (era ${oldPoints}) → ${pr.status}${colors.reset}`
    );
    announceDone(i + 1, rows.length, `PUT /action ${id}`, pr.ok, pr.status, pr.json);
    await maybePauseBetweenOps(argv);

    if (pr.ok) {
      ok++;
      if (idx >= 0) {
        fileRows[idx] = {
          ...fileRows[idx],
          points,
          criteria: JSON.stringify(axes)
        };
      }
    } else {
      fail++;
      if (stopOnError) break;
    }
  }

  if (!dry && !skipWriteJson && ok > 0) {
    const byId = new Map(fileRows.map((r) => [r.id, r]));
    const merged = rows.map((r) => byId.get(r.id) || r);
    writeFileSync(file, JSON.stringify(merged, null, 4) + '\n', 'utf8');
    log(
      'Arquivo',
      fail === 0
        ? `Atualizado ${file} (points + criteria).`
        : `Atualizado ${file} — só ${ok} linhas com PUT OK.`
    );
  }

  console.log(`\nResumo: ${dry ? 'dry-run' : `${ok} OK, ${fail} falhas`}`);
}

async function cmdProbeGameActionProcess(argv = []) {
  await ensureToken();
  const body = { ...cfg.game4uUserActionPayload.example };
  const r = await game4uActionProcessWithRestoreOnCancelledPending(
    cfg.gameActionProcess.path,
    cfg.gameActionProcess.method,
    body
  );
  log(
    `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path}`,
    `status ${r.status}`,
    r.json
  );
  announceDone(
    1,
    1,
    `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path}`,
    r.ok,
    r.status,
    r.json
  );
  await maybePauseBetweenOps(argv);
}

/**
 * Só Zoho: N deals do Deals/search + GET __timeline; imprime _value bruto e _value.old dos field_history com api_name stage.
 * Opções: --sample-deals N (default 10)  --zoho-timeline-bare  --zoho-ignore-pipeline-filter
 */
async function cmdProbeZohoTimelineStageValues(argv = []) {
  const si = argv.indexOf('--sample-deals');
  let sampleN = 10;
  if (si >= 0 && argv[si + 1] != null) {
    const n = parseInt(argv[si + 1], 10);
    if (Number.isFinite(n) && n > 0) sampleN = Math.min(n, 50);
  }
  const { from, to, kf, kt } = zohoModifiedTimeRange();
  if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} para o Deals/search.`);
  }
  const token = await zohoRefreshToken();
  const criteria = zohoDealsSearchCriteria(from, to, argv);
  const all = await zohoFetchAllDealsSearchPages(criteria, token, { quiet: true });
  const deals = all.slice(0, sampleN);
  console.log(
    `${colors.cyan}probe-zoho-timeline-stage-values:${colors.reset} Deals/search → ${all.length} deal(s); ` +
      `amostra ${deals.length} (critério Modified_Time + pipeline se ativo).`
  );
  console.log(`${colors.dim}${kf}=${from}  ${kt}=${to}${colors.reset}`);

  const bareTimeline =
    argv.includes('--zoho-timeline-bare') ||
    process.env.ZOHO_TIMELINE_BARE === '1' ||
    process.env.ZOHO_TIMELINE_BARE === 'true';
  const { from: af, to: at } = bareTimeline
    ? { from, to }
    : zohoTimelineAuditedRangeForStageHistory(from, to);
  console.log(`${colors.dim}__timeline audited_time: ${af} .. ${at}${colors.reset}\n`);

  const ser = (x, max = 400) => {
    if (x === undefined) return '(undefined)';
    if (x === null) return '(null)';
    if (typeof x === 'string') return x.length > max ? `${x.slice(0, max)}…` : x;
    try {
      const s = JSON.stringify(x);
      return s.length > max ? `${s.slice(0, max)}…` : s;
    } catch {
      return String(x);
    }
  };

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);
    const j2 = await zohoFetchMergedDealTimeline(deal.id, af, at, token, bareTimeline);
    const list = j2?.__timeline ?? [];
    const stageNow = zohoPicklistDisplayString(deal.Stage);
    console.log(
      `${colors.cyan}=== [${i + 1}/${deals.length}] deal ${deal.id}${colors.reset} | Stage no search: ${ser(stageNow, 120)} | entradas __timeline: ${list.length}`
    );

    let stageCount = 0;
    for (const row of list) {
      const fh = row.field_history;
      if (fh == null) continue;
      const entries = Array.isArray(fh) ? fh : [fh];
      const audited = row.audited_time ?? row.Audited_Time ?? '';
      for (const f of entries) {
        if (!f || typeof f !== 'object') continue;
        if (!zohoTimelineFieldIsStage(f)) continue;
        stageCount += 1;
        const rawV = f._value;
        let oldDirect = rawV;
        if (rawV != null && typeof rawV === 'object') {
          oldDirect = rawV.old ?? rawV.Old ?? rawV.previous_value ?? rawV.previous ?? rawV.before;
        } else if (typeof rawV === 'string') {
          const p = zohoParseJsonObjectIfString(rawV);
          if (p && typeof p === 'object') {
            oldDirect = p.old ?? p.Old ?? p.previous_value ?? p.previous ?? p.before;
          }
        }
        const { oldVal, newVal } = zohoFieldHistoryStageOldNew(f);
        console.log(`  — Stage change #${stageCount}  audited_time=${ser(audited, 80)}`);
        console.log(`      api_name: ${ser(f.api_name ?? f.field?.api_name, 60)}`);
        console.log(`      _value tipo: ${typeof rawV}  |  _value (amostra): ${ser(rawV, 350)}`);
        console.log(
          `      _value.old (bruto ou equivalente old/Old/previous_*): ${ser(oldDirect, 200)}`
        );
        console.log(`      parse runner → oldVal="${oldVal}"  newVal="${newVal}"`);
      }
    }
    if (stageCount === 0) {
      console.log(`  ${colors.dim}(nenhum field_history com api_name stage nesta janela)${colors.reset}`);
    }
  }
}

/**
 * Só Zoho: Deals/search só pipeline Cobrança + intervalo abril (Modified_Time); amostra pequena; __timeline com _value.old.
 * Opções: --sample-deals N (default 6)  --april-year YYYY (default 2026)  --zoho-timeline-bare
 * Sobrescrever mês: --from ISO  --to ISO (em vez de abril inteiro).
 */
async function cmdProbeZohoCobrancaAprilTimeline(argv = []) {
  const si = argv.indexOf('--sample-deals');
  let sampleN = 6;
  if (si >= 0 && argv[si + 1] != null) {
    const n = parseInt(argv[si + 1], 10);
    if (Number.isFinite(n) && n > 0) sampleN = Math.min(n, 30);
  }
  let year = 2026;
  const yi = argv.indexOf('--april-year');
  if (yi >= 0 && argv[yi + 1] != null) {
    const y = parseInt(argv[yi + 1], 10);
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) year = y;
  }
  const fi = argv.indexOf('--from');
  const ti = argv.indexOf('--to');
  let fromIso;
  let toIso;
  if (fi >= 0 && argv[fi + 1] != null && ti >= 0 && argv[ti + 1] != null) {
    fromIso = String(argv[fi + 1]).trim();
    toIso = String(argv[ti + 1]).trim();
  } else {
    fromIso = `${year}-04-01T00:00:00+00:00`;
    toIso = `${year}-04-30T23:59:59+00:00`;
  }

  const pipeName = zohoCobrancaPipelineDisplayName();
  const token = await zohoRefreshToken();
  const criteria = buildZohoSinglePipelineSearchCriteria(pipeName, fromIso, toIso);
  const all = await zohoFetchAllDealsSearchPages(criteria, token, { quiet: true });
  const deals = all.slice(0, sampleN);

  console.log(
    `${colors.cyan}probe-zoho-cobranca-april-timeline:${colors.reset} pipeline "${pipeName}" | ` +
      `Modified_Time ${fromIso} .. ${toIso}`
  );
  console.log(
    `${colors.dim}Deals/search → ${all.length} deal(s); amostra ${deals.length} (ZOHO_COBRANCA_PIPELINE_NAME altera o nome do pipeline).${colors.reset}`
  );

  const bareTimeline =
    argv.includes('--zoho-timeline-bare') ||
    process.env.ZOHO_TIMELINE_BARE === '1' ||
    process.env.ZOHO_TIMELINE_BARE === 'true';
  const { from: af, to: at } = bareTimeline
    ? { from: fromIso, to: toIso }
    : zohoTimelineAuditedRangeForStageHistory(fromIso, toIso);
  console.log(`${colors.dim}__timeline audited_time: ${af} .. ${at}${colors.reset}\n`);

  const ser = (x, max = 400) => {
    if (x === undefined) return '(undefined)';
    if (x === null) return '(null)';
    if (typeof x === 'string') return x.length > max ? `${x.slice(0, max)}…` : x;
    try {
      const s = JSON.stringify(x);
      return s.length > max ? `${s.slice(0, max)}…` : s;
    } catch {
      return String(x);
    }
  };

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);
    const j2 = await zohoFetchMergedDealTimeline(deal.id, af, at, token, bareTimeline);
    const list = j2?.__timeline ?? [];
    const stageNow = zohoPicklistDisplayString(deal.Stage);
    const pipeLabel = getZohoDealPipelineName(deal);
    console.log(
      `${colors.cyan}=== [${i + 1}/${deals.length}] deal ${deal.id}${colors.reset} | Pipeline: ${ser(pipeLabel, 80)} | Stage: ${ser(stageNow, 100)} | __timeline: ${list.length} linhas`
    );

    let stageCount = 0;
    for (const row of list) {
      const fh = row.field_history;
      if (fh == null) continue;
      const entries = Array.isArray(fh) ? fh : [fh];
      const audited = row.audited_time ?? row.Audited_Time ?? '';
      for (const f of entries) {
        if (!f || typeof f !== 'object') continue;
        if (!zohoTimelineFieldIsStage(f)) continue;
        stageCount += 1;
        const rawV = f._value;
        let oldDirect = rawV;
        if (rawV != null && typeof rawV === 'object') {
          oldDirect = rawV.old ?? rawV.Old ?? rawV.previous_value ?? rawV.previous ?? rawV.before;
        } else if (typeof rawV === 'string') {
          const p = zohoParseJsonObjectIfString(rawV);
          if (p && typeof p === 'object') {
            oldDirect = p.old ?? p.Old ?? p.previous_value ?? p.previous ?? p.before;
          }
        }
        const { oldVal, newVal } = zohoFieldHistoryStageOldNew(f);
        let newDirect = rawV;
        if (rawV != null && typeof rawV === 'object') {
          newDirect = rawV.new ?? rawV.New ?? rawV.current_value ?? rawV.current ?? rawV.after;
        } else if (typeof rawV === 'string') {
          const p = zohoParseJsonObjectIfString(rawV);
          if (p && typeof p === 'object') {
            newDirect = p.new ?? p.New ?? p.current_value ?? p.current ?? p.after;
          }
        }
        console.log(`  — #${stageCount} audited=${ser(audited, 72)}`);
        console.log(`      _value.old → ${ser(oldDirect, 220)}  |  parse: "${oldVal}"`);
        console.log(`      _value.new → ${ser(newDirect, 220)}  |  parse: "${newVal}"`);
        console.log(`      _value JSON: ${ser(rawV, 320)}`);
      }
    }
    if (stageCount === 0) {
      console.log(`  ${colors.dim}(sem mudança Stage no __timeline nesta janela)${colors.reset}`);
    }
  }
}

/**
 * Validação rápida: Zoho Deals/search (sem timeline nem POST G4U).
 * 1) Layout.display_label equals / not_equal "Layout CS e Jurídico" (sem filtro Pipeline no critério).
 * 2) Histograma de Pipeline no intervalo; Pipeline:equals; critério completo do runner.
 */
async function cmdZohoPipelineProbe(argv = []) {
  const quiet = !argv.includes('--verbose');
  const samplesLimit = (() => {
    const i = argv.indexOf('--samples');
    if (i >= 0 && argv[i + 1] != null) {
      const n = parseInt(argv[i + 1], 10);
      return Number.isFinite(n) && n >= 0 ? Math.min(n, 50) : 5;
    }
    return 5;
  })();

  const { from, to, kf, kt } = zohoModifiedTimeRange();
  if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} (intervalo Modified_Time do Deals/search).`);
  }

  const pf = cfg.zoho.dealsSearch?.pipelineFilter;
  const field =
    process.env.ZOHO_DEALS_PIPELINE_FIELD?.trim() || pf?.fieldApiName || 'Pipeline';
  const allowed = Array.isArray(pf?.allowedDisplayNames) ? [...pf.allowedDisplayNames] : [];

  const extraFromEnv = (process.env.ZOHO_PROBE_PIPELINE_NAMES || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const token = await zohoRefreshToken();

  const layoutProbeLabel =
    process.env.ZOHO_PROBE_LAYOUT_LABEL?.trim() || 'Layout CS e Jurídico';
  const layoutFieldProbe =
    process.env.ZOHO_PROBE_LAYOUT_FIELD?.trim() || 'Layout.display_label';
  const runLayoutNotEqualAlways = argv.includes('--layout-probe-both');

  console.log(
    `\n${colors.cyan}Teste Layout (critério sem Pipeline):${colors.reset} ${layoutFieldProbe}`
  );
  const critLayoutEq = buildZohoTimeAndLayoutDisplayLabelCriteria(
    from,
    to,
    'equals',
    layoutProbeLabel
  );
  console.log(`${colors.dim}criteria equals: ${critLayoutEq}${colors.reset}`);
  const dealsLayoutEq = await zohoFetchAllDealsSearchPages(critLayoutEq, token, { quiet });
  console.log(
    `${dealsLayoutEq.length ? colors.green : colors.yellow}` +
      `${layoutFieldProbe} equals "${layoutProbeLabel}": ${dealsLayoutEq.length} deal(s)${colors.reset}`
  );
  if (dealsLayoutEq.length) {
    const { lines, totalBuckets } = zohoProbeMiniPipelineHistogramLines(dealsLayoutEq);
    console.log(`  Pipelines neste conjunto (${totalBuckets} distintos, top 18):`);
    for (const ln of lines) console.log(ln);
    const cob = dealsLayoutEq.filter((d) => /cobran/i.test(getZohoDealPipelineName(d)));
    if (cob.length) {
      console.log(`  ${colors.green}Destes, pipeline ~cobran: ${cob.length}${colors.reset}`);
    }
    const laySample = dealsLayoutEq.slice(0, 3).map((d) => ({
      id: d.id,
      layout_body: getZohoDealLayoutDisplayLabel(d),
      pipeline: getZohoDealPipelineName(d)
    }));
    console.log(`  Amostra layout/pipeline no body: ${JSON.stringify(laySample)}`);
  }

  if (dealsLayoutEq.length === 0 || runLayoutNotEqualAlways) {
    if (dealsLayoutEq.length > 0 && runLayoutNotEqualAlways) {
      console.log(`\n${colors.dim}--layout-probe-both: a correr também not_equal…${colors.reset}`);
    }
    const critLayoutNe = buildZohoTimeAndLayoutDisplayLabelCriteria(
      from,
      to,
      'not_equal',
      layoutProbeLabel
    );
    console.log(`${colors.dim}criteria not_equal: ${critLayoutNe}${colors.reset}`);
    const dealsLayoutNe = await zohoFetchAllDealsSearchPages(critLayoutNe, token, { quiet });
    console.log(
      `${dealsLayoutNe.length ? colors.green : colors.yellow}` +
        `${layoutFieldProbe} not_equal "${layoutProbeLabel}": ${dealsLayoutNe.length} deal(s)${colors.reset}`
    );
    if (dealsLayoutNe.length) {
      const { lines, totalBuckets } = zohoProbeMiniPipelineHistogramLines(dealsLayoutNe);
      console.log(`  Pipelines neste conjunto (${totalBuckets} distintos, top 18):`);
      for (const ln of lines) console.log(ln);
      const cob = dealsLayoutNe.filter((d) => /cobran/i.test(getZohoDealPipelineName(d)));
      if (cob.length) {
        console.log(`  ${colors.green}Destes, pipeline ~cobran: ${cob.length}${colors.reset}`);
      }
    }
  } else {
    console.log(
      `${colors.dim}Teste not_equal omitido (equals já devolveu deals). Use --layout-probe-both para forçar.${colors.reset}`
    );
  }

  console.log(
    `\n${colors.cyan}zoho-pipeline-probe:${colors.reset} Modified_Time ${from} .. ${to}; api_name ${field}; ` +
      `histograma = união por pipeline (allowedDisplayNames) — evita limite Zoho ~2000 num search único.`
  );
  const allDeals = await zohoFetchDealsMergedByAllowedPipelines(from, to, token, { quiet });
  console.log(`Total de deals no intervalo (ignorando filtro de pipeline): ${allDeals.length}`);

  const hist = new Map();
  const samples = new Map();
  let emptyPipeline = 0;
  for (const d of allDeals) {
    const label = getZohoDealPipelineName(d);
    if (!label) {
      emptyPipeline++;
      continue;
    }
    hist.set(label, (hist.get(label) || 0) + 1);
    if (!samples.has(label)) samples.set(label, d.Pipeline);
  }

  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\nPipelines distintos (rótulo normalizado a partir do body): ${sorted.length}`);
  const show = Math.min(sorted.length, 40);
  for (let i = 0; i < show; i++) {
    const [name, c] = sorted[i];
    console.log(`  ${String(c).padStart(5)}\t${name}`);
  }
  if (sorted.length > show) {
    console.log(`  … (+${sorted.length - show} pipelines não listados)`);
  }
  if (emptyPipeline) {
    console.log(
      `${colors.yellow}Deals sem Pipeline legível no body (string/objeto vazio): ${emptyPipeline}${colors.reset}`
    );
  }

  const cobrancaLike = sorted.filter(([name]) => /cobran/i.test(name));
  if (cobrancaLike.length) {
    console.log(`\n${colors.green}Buckets do histograma que casam /cobran/i:${colors.reset}`);
    for (const [name, c] of cobrancaLike) {
      console.log(`  ${String(c).padStart(5)}\t${name}`);
    }
    const [firstName] = cobrancaLike[0];
    const raw = samples.get(firstName);
    console.log(`\nAmostra JSON bruto do campo Pipeline (primeiro bucket acima): ${JSON.stringify(raw)}`);
  } else {
    console.log(
      `\n${colors.yellow}Nenhum pipeline no histograma contém "cobran" — alargue ZOHO_MODIFIED_* ou confira o nome no CRM.${colors.reset}`
    );
  }

  const probeNames = new Set();
  for (const n of allowed) {
    if (/cobran/i.test(n)) probeNames.add(n);
  }
  probeNames.add('Cobrança');
  probeNames.add('Cobranca');
  for (const n of extraFromEnv) probeNames.add(n);

  console.log(
    `\n${colors.cyan}Deals/search com (Modified_Time) and (Pipeline:equals:…):${colors.reset}`
  );
  for (const name of probeNames) {
    const crit = buildZohoSinglePipelineSearchCriteria(name, from, to);
    const rows = await zohoFetchAllDealsSearchPages(crit, token, { quiet });
    const ok = rows.length > 0 ? colors.green : colors.dim;
    console.log(
      `  ${ok}Pipeline:equals "${name}" → ${rows.length} deal(s)${colors.reset}`
    );
  }

  const critConfigured = zohoDealsSearchCriteria(from, to, []);
  const withFilter = await zohoFetchAllDealsSearchPages(critConfigured, token, { quiet });
  const cobrancaInConfigured = withFilter.filter((d) => /cobran/i.test(getZohoDealPipelineName(d)));
  console.log(
    `\nCritério do runner (Modified_Time + pipelines em allowedDisplayNames): ${withFilter.length} deals; ` +
      `com rótulo de pipeline ~cobran: ${cobrancaInConfigured.length}`
  );

  if (samplesLimit > 0 && cobrancaInConfigured.length) {
    const ids = cobrancaInConfigured.slice(0, samplesLimit).map((d) => d.id);
    console.log(`  IDs (amostra, --samples ${samplesLimit}): ${ids.join(', ')}`);
  }

  console.log(
    `\n${colors.dim}Dicas: --verbose; ZOHO_PROBE_PIPELINE_NAMES; ZOHO_PROBE_LAYOUT_LABEL / ZOHO_PROBE_LAYOUT_FIELD; ` +
      `--layout-probe-both; ZOHO_DEALS_PIPELINE_FIELD se Pipeline tiver outro api_name.${colors.reset}`
  );
}

function cmdHelp() {
  console.log(`
${colors.cyan}Game4U API scripts runner${colors.reset}
Base URL: ${getBaseUrl()}
Client ID: ${getClientId()}

Comandos:
  help                          Esta ajuda
  login                         POST /auth/login (G4U_ADMIN_* ou só valida G4U_ACCESS_TOKEN)
  seed-action-templates         POST /action para cada item de revisaprev-action-template.json
                                Opções: --dry-run  --from N  --limit M  --pause  --stop-on-error
  sync-action-template-points   GET+PUT /action/{id}: criteria em eixos; points = (complexity×3)×importance×executionTime×seniorityLevel
                                Opções: --dry-run  --pause  --stop-on-error  --no-write-json
  seed-teams-users              Times primeiro (leader temp. = GET /auth/user), usuários com team_id, PUT líderes
                                Opções: --phase … | all  --pause  --reset-supabase-auth  --dry-run (só com reset)
                                Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_SECRET (reset)  G4U_SEED_AVATAR_URL (opcional)
  zoho-stages                   Zoho: Deals/search em todas as páginas (page até more_records=false); __timeline
                                com page_token fundido. POST /game/action/process: mesmo integration_id deve atualizar
                                no G4U (upsert no backend). Transição Stage: DONE + PENDING; delivery complete;
                                CS/financeiro/Jur. __timeline alarga audited_time (histórico Stage) vs Modified_Time do search.
                                Opções: --no-post-process --post-all-mapped --max-deals N (cap opcional)
                                --zoho-timeline-bare --zoho-ignore-pipeline-filter
                                --zoho-stage-replay-all-timeline (ou ZOHO_STAGE_REPLAY_ALL_TIMELINE=1) — todas as transições
                                no __timeline em ordem: DONE(old)+PENDING(new); DONE com created_at=audited_time
                                --zoho-transitions-only-month YYYY-MM — só transições com audited_time nesse mês (_value.old/new nessa linha)
                                Com YYYY-04: lê regras-de-negocio-scrips/Tarefas por times.xlsx; se o Stage (OLD no DONE, NEW no PENDING)
                                casar com a planilha e a categoria (CS/Jurídico/Financeiro) ≠ time do jogador no G4U, POST com dismissed=true.
                                --zoho-skip-april-stage-team-dismiss — desliga essa validação mesmo em abril.
                                --zoho-transition-audited-from ISO --zoho-transition-audited-to ISO (alternativa ao mês)
                                --deal-ids-csv caminho.csv — GET Deals/{id} em vez do search (ex. diff Zoho×G4U)
                                --deal-ids-csv-only-found-no — com CSV do diff, só deal_id onde found_in_game4u=no
                                Env: ZOHO_* ZOHO_MODIFIED_* ZOHO_TIMELINE_EXTRA_DAYS_BACK (0=defeito; ex. 730) ZOHO_TIMELINE_AUDITED_FROM/TO
                                G4U_ZOHO_CANCELLED_PENDING_RESTORE_MAX  ZOHO_DEALS_SEARCH_MAX_PAGES  ZOHO_TIMELINE_MAX_PAGES
                                ZOHO_MAX_DEALS  G4U_ZOHO_*  ZOHO_DEALS_PIPELINE_FILTER
  zoho-cobranca-stages          Pipeline Cobrança; timeline: DONE estágio OLD + PENDING estágio NEW; Fin. só em stages financeiros;
                                DONE com user_email por equipa do estágio anterior (CS=Owner, Financeiro=lookup).
                                npm run api-scripts:zoho-cobranca-stages -- --post-all-mapped
                                Opção: --zoho-cobranca-all-transitions (ou ZOHO_COBRANCA_ALL_TIMELINE_TRANSITIONS=1) — cada mudança
                                Stage no __timeline (cronológico); DONE com created_at = audited_time (sem search).
                                Env: ZOHO_COBRANCA_PIPELINE_NAME (opcional)
  zoho-tasks                    Mesmo Deals/search paginado; Activities_Chronological com page_token (todas páginas).
                                Jur + tags: uma atividade mais recente por action template (tagFlowTitleToActionTemplateId);
                                POST process; integration_id jur estável por template. --max-deals / ZOHO_MAX_DEALS
                                limitam quantos deals processar após o search completo (omitir = todos).
                                Filtro abril (só deals com Modified_Time em abril UTC): --zoho-tasks-april-deals
                                e opcional --zoho-tasks-april-year YYYY (default ano UTC atual) ou env G4U_ZOHO_TASKS_APRIL_DEALS=1
                                e G4U_ZOHO_TASKS_APRIL_YEAR (ignora ZOHO_MODIFIED_* nesse modo).
                                --zoho-tasks-debug-summary: sem POST; contagens + zoho-tasks-debug-summary.json na raiz do repo;
                                --zoho-tasks-debug-verbose; --zoho-tasks-debug-skip-game-lookup (só Zoho).
                                --zoho-tasks-task-owner-email ou G4U_ZOHO_JUR_TASK_USER_EMAIL=owner: user_email = Owner da task (fallback jur).
                                Env: ZOHO_ACTIVITIES_MAX_PAGES  (+ G4U_ZOHO_JUR_DONE_USE_TASK_CREATED_AT se precisar)
  zoho-pipeline-probe           Só Zoho: teste Layout.display_label (= / ≠ "Layout CS e Jurídico", sem Pipeline);
                                histograma = união por allowedDisplayNames (evita limite ~2000 Zoho); Pipeline:equals; runner.
                                Opções: --verbose  --samples N  --layout-probe-both (sempre correr not_equal)
                                Env: ZOHO_MODIFIED_*  ZOHO_PROBE_PIPELINE_NAMES  ZOHO_PROBE_LAYOUT_LABEL
                                ZOHO_PROBE_LAYOUT_FIELD (default Layout.display_label)
  probe-game-action-process      POST /game/action/process com corpo de exemplo (ver resposta da API)
  probe-zoho-timeline-stage-values  Só Zoho: N deals + __timeline; mostra _value e _value.old do Stage
                                Opções: --sample-deals N (default 10)  --zoho-timeline-bare  --zoho-ignore-pipeline-filter
  probe-zoho-cobranca-april-timeline  Só Zoho: pipeline Cobrança + abril (Modified_Time); amostra; _value.old no __timeline
                                Opções: --sample-deals N (default 6)  --april-year 2026  --from ISO --to ISO  --zoho-timeline-bare

Env úteis:
  G4U_ZOHO_CANCELLED_PENDING_RESTORE_MAX   Máx. ciclos restore+retry por POST /game/action/process (default 10)
  G4U_ZOHO_FINANCEIRO_NAME_MATCH_ALL_TEAMS  default 1: match nome→e-mail fora do time Financeiro; 0 = só Financeiro
  G4U_USER_ACTION_DONE_LOOKUP_STATUSES   Ex.: CANCELLED (default) — statuses extra no search para created_at do DONE
  G4U_USER_ACTION_SEARCH_LIMIT           Limite por página no search (default config; máx. 500)
  G4U_USER_ACTION_SEARCH_MAX_PAGES       Máx. páginas por status no DONE lookup (default 80)
  G4U_USER_ACTION_DONE_LOOKUP_INCLUDE_DISMISSED  1/true — junta também search com dismissed=true
  G4U_ZOHO_STAGE_DONE_USE_AUDITED_WHEN_SEARCH_MISS  default ligado — Stage DONE usa audited_time se search não achar created_at; 0/false desliga
  G4U_ACCESS_TOKEN              Pula login se já autenticado
  G4U_SEED_DEFAULT_PASSWORD     Senha fallback se linha do .md não bater por e-mail
  G4U_SEED_AVATAR_URL           URL opcional enviada como avatar_url em cada POST /user
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_SECRET   Para --reset-supabase-auth (remove Auth só e-mails do seed)
  G4U_FUNIFIER_TEAM_* (opcional)   Se definidos, enviados como funifier_id no POST /team
`);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';

(async () => {
  try {
    log('Config', `Carregado: ${CONFIG_PATH}`);
    switch (cmd) {
      case 'help':
      case '-h':
        cmdHelp();
        break;
      case 'login':
        await cmdLogin(argv);
        break;
      case 'seed-action-templates':
        await cmdSeedActionTemplates(argv);
        break;
      case 'sync-action-template-points':
        await cmdSyncActionTemplatePoints(argv);
        break;
      case 'seed-teams-users':
        await cmdSeedTeamsUsers(argv);
        break;
      case 'zoho-stages':
        await cmdZohoStages(argv);
        break;
      case 'zoho-cobranca-stages':
        await cmdZohoStages([
          '--zoho-cobranca-financeiro-user',
          '--zoho-pipeline-only-cobranca',
          ...argv.slice(1)
        ]);
        break;
      case 'zoho-tasks':
        await cmdZohoTasks(argv);
        break;
      case 'zoho-pipeline-probe':
        await cmdZohoPipelineProbe(argv);
        break;
      case 'probe-game-action-process':
        await cmdProbeGameActionProcess(argv);
        break;
      case 'probe-zoho-timeline-stage-values':
        await cmdProbeZohoTimelineStageValues(argv);
        break;
      case 'probe-zoho-cobranca-april-timeline':
        await cmdProbeZohoCobrancaAprilTimeline(argv);
        break;
      default:
        console.error(`${colors.red}Comando desconhecido: ${cmd}${colors.reset}`);
        cmdHelp();
        process.exit(1);
    }
  } catch (e) {
    console.error(`${colors.red}Erro:${colors.reset}`, e.message || e);
    if (e.cause) console.error(e.cause);
    process.exit(1);
  }
})();
