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
 *   node regras-de-negocio-scrips/run-api-scripts.mjs zoho-tasks
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
import { stdin as stdinIo, stdout as stdoutIo } from 'process';
import { createInterface } from 'readline/promises';
import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
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

function normalizeZohoPicklistLabel(s) {
  return String(s ?? '')
    .trim()
    .normalize('NFC');
}

function getZohoDealPipelineName(deal) {
  return normalizeZohoPicklistLabel(deal?.Pipeline);
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

async function game4uFetchPendingUserActionsForDelivery(deliveryId) {
  const c = cfg.game4uUserActionSearch || {};
  const path = c.path || '/user-action/search';
  const limit = Number(c.defaultLimit) || 100;
  const start = c.createdAtStartDefault || '2000-01-01T00:00:00.000Z';
  const end = new Date().toISOString();
  const qs = new URLSearchParams({
    created_at_start: start,
    created_at_end: end,
    dismissed: 'false',
    page: '1',
    limit: String(limit)
  });
  qs.append('status', 'PENDING');
  if (deliveryId && c.filterByDeliveryId !== false) {
    qs.set('delivery_id', String(deliveryId));
  }
  return game4uFetch(`${path}?${qs.toString()}`);
}

function findPendingUserActionToClose(items, deliveryId, stableIntegrationId, actionTemplateId) {
  const did = String(deliveryId);
  const narrowed = items.filter((it) => String(it.delivery_id) === did);
  const exact = narrowed.find(
    (it) =>
      String(it.integration_id) === String(stableIntegrationId) &&
      String(it.action_template_id || it.action_id || '') === String(actionTemplateId)
  );
  if (exact) return exact;
  return narrowed.find((it) => String(it.action_template_id || it.action_id || '') === String(actionTemplateId));
}

function stageNameCompletesDelivery(stageName) {
  const list = cfg.zoho?.stagesThatCompleteDelivery;
  if (!Array.isArray(list) || !stageName) return false;
  const n = normalizeZohoPicklistLabel(stageName);
  return list.some((s) => normalizeZohoPicklistLabel(s) === n);
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
 * Última atividade (mais recente na lista) cujo JSON contém uma chave de tagFlowTitleToActionTemplateId.
 */
function findLatestActivityWithTagFlow(activityList, map) {
  const tagMap = map.tagFlowTitleToActionTemplateId || {};
  const entries = Object.entries(tagMap).sort((a, b) => b[0].length - a[0].length);
  if (!Array.isArray(activityList) || !entries.length) return null;
  for (let i = activityList.length - 1; i >= 0; i--) {
    const a = activityList[i];
    if (!a || typeof a !== 'object') continue;
    const blob = JSON.stringify(a);
    for (const [tagFlowKey, actionId] of entries) {
      if (blob.includes(tagFlowKey)) return { activity: a, tagFlowKey, actionId };
    }
  }
  return null;
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
  integrationComment
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
    dismissed: false
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
 * Timeline v8: primeira página com sort_by, per_page, filters (audited_time between), include_inner_details.
 * @see https://www.zoho.com/crm/developer/docs/api/v8/timeline-of-a-record.html
 */
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

/** Última entrada do __timeline com alteração do campo Stage (por audited_time). */
function pickLatestStageChangeFromTimeline(timelineResponse) {
  const list = timelineResponse?.__timeline;
  if (!Array.isArray(list)) return null;
  let best = null;
  let bestTime = '';
  for (const row of list) {
    const fh = row.field_history;
    if (!Array.isArray(fh)) continue;
    for (const f of fh) {
      if (String(f.api_name || '') !== 'Stage') continue;
      const t = String(row.audited_time || '');
      if (!best || t > bestTime) {
        best = { row, field: f };
        bestTime = t;
      }
    }
  }
  return best;
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

async function zohoFetchCrmUserEmailById(userId, oauthToken) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const paths = [`/crm/v8/users/${id}`, `/crm/v2/users/${id}`];
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
    const u = j.users?.[0] ?? j.data?.[0] ?? j.user ?? null;
    const em = u?.email ?? u?.Email;
    if (em && String(em).trim()) return String(em).trim();
  }
  return null;
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
    return hit ? hit : null;
  }
  if (zohoStagePostToGame4uOpts().resolveUserEmailViaCrmUsersApi === false) {
    cache.set(key, '');
    return null;
  }
  await sleep(55);
  const email = await zohoFetchCrmUserEmailById(key, oauthToken);
  cache.set(key, email || '');
  return email || null;
}

async function cmdZohoStages(argv) {
  const noPost = argv.includes('--no-post-process');
  const postAllMapped = argv.includes('--post-all-mapped');
  const map = loadZohoCrmActionMap();
  const { from, to, kf, kt } = zohoModifiedTimeRange();
  if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} (ou alias ZOHO_MOVIFIED_FROM / ZOHO_MOVIFIED_TO se usar o typo)`);
  }
  const criteria = zohoDealsSearchCriteria(from, to, argv);
  const token = await zohoRefreshToken();
  const zohoUserEmailCache = new Map();
  const searchUrl = buildZohoDealsSearchUrl(criteria, 1);
  const r = await fetch(searchUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }
  const info = data?.info;
  log(
    'Zoho Deals/search (apenas página 1, todos os deals desta página)',
    `status ${r.status} criteria=${criteria}` +
      (info
        ? ` | page=${info.page} per_page=${info.per_page} more_records=${info.more_records} count=${info.count}`
        : ''),
    data
  );

  const pageDeals = data?.data ?? [];
  if (!pageDeals.length) {
    console.warn(`${colors.yellow}Nenhum deal na primeira página do search.${colors.reset}`);
    return;
  }

  const bareTimeline =
    argv.includes('--zoho-timeline-bare') ||
    process.env.ZOHO_TIMELINE_BARE === '1' ||
    process.env.ZOHO_TIMELINE_BARE === 'true';

  if (!noPost) await ensureToken();

  let builtPayloads = 0;
  let postsOk = 0;
  let deliveryCompleteOk = 0;
  const totalDeals = pageDeals.length;

  for (let i = 0; i < pageDeals.length; i++) {
    const deal = pageDeals[i];
    if (!deal?.id) continue;
    if (i > 0) await sleep(120);

    const tl = bareTimeline
      ? cfg.zoho.dealTimelineStages.pathTemplate.replace('{{dealId}}', deal.id)
      : buildZohoDealTimelineUrl(deal.id, from, to);
    const r2 = await fetch(tl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const t2 = await r2.text();
    let j2;
    try {
      j2 = JSON.parse(t2);
    } catch {
      j2 = { _raw: t2 };
    }
    log(`Zoho __timeline [${i + 1}/${totalDeals}] deal ${deal.id}`, `status ${r2.status}`, j2);

    const hit = pickLatestStageChangeFromTimeline(j2);
    if (!hit) {
      console.warn(
        `${colors.dim}deal ${deal.id}: sem field_history Stage no __timeline — pulando.${colors.reset}`
      );
      continue;
    }

    const oldVal = String(hit.field._value?.old ?? '').trim();
    const newVal = String(hit.field._value?.new ?? '').trim();
    const audited = hit.row.audited_time || new Date().toISOString();

    const actionIdOld = oldVal ? resolveActionTemplateIdForZohoStage(oldVal, map) : null;
    const actionIdNew = newVal ? resolveActionTemplateIdForZohoStage(newVal, map) : null;
    const wantCompleteDelivery = stageNameCompletesDelivery(newVal);
    const wantStageProcess = Boolean(actionIdOld || actionIdNew);

    if (!wantStageProcess && !wantCompleteDelivery) {
      console.warn(
        `${colors.yellow}deal ${deal.id}: Stage novo "${newVal}" sem mapa e fora de stagesThatCompleteDelivery — pulando.${colors.reset}`
      );
      continue;
    }

    const jur = getZohoJuridicoResponsibleLookup(deal);
    if (zohoUserLookupFilled(jur) && !zohoAllowPostWhenJurFilled()) {
      console.warn(
        `${colors.dim}deal ${deal.id}: Responsável Jurídico preenchido — POST por Stage omitido (usar fluxo de tags / zoho-tasks ou zoho.stagePostToGame4u.allowPostWhenJuridicoResponsibleSet).${colors.reset}`
      );
      continue;
    }

    const needFin = dealRequiresFinanceiroLookupForStagePost(deal);
    const allowMissFin = zohoAllowMissingFinanceiroForStagePost();
    if (
      wantStageProcess &&
      (!zohoUserLookupFilled(deal.Owner) ||
        (needFin && !allowMissFin && !zohoUserLookupFilled(deal.Financeiro_Respons_vel)))
    ) {
      console.warn(
        `${colors.yellow}deal ${deal.id}: exige Owner (CS)${needFin && !allowMissFin ? ' e Financeiro_Respons_vel' : ''} para POST por Stage — pulando.${colors.reset}`
      );
      continue;
    }

    let anyOkThisDeal = false;
    let dealBuilt = 0;
    let lastHttpStatusThisDeal = 0;

    if (
      wantStageProcess &&
      actionIdOld &&
      oldVal &&
      actionIdOld !== actionIdNew &&
      !(isFinanceStageName(oldVal, map, deal) && !financeStageEligibleForDeal(deal))
    ) {
      const emailOld = await resolveEmailForZohoStageTeam(oldVal, deal, map, token, zohoUserEmailCache);
      if (!emailOld) {
        console.warn(
          `${colors.yellow}deal ${deal.id}: sem e-mail para concluir estágio anterior "${oldVal}" — pulando DONE.${colors.reset}`
        );
      } else {
        const stableOld = buildZohoStableIntegrationId(deal.id, actionIdOld);
        let createdAtForDone = null;
        if (!noPost) {
          const searchRes = await game4uFetchPendingUserActionsForDelivery(deal.id);
          log(
            `GET user-action/search (deal ${deal.id}, fechar ${actionIdOld})`,
            `status ${searchRes.status}`,
            searchRes.json
          );
          if (searchRes.ok) {
            const items = unwrapGame4uUserActionSearchItems(searchRes);
            const row = findPendingUserActionToClose(items, deal.id, stableOld, actionIdOld);
            if (row?.created_at) createdAtForDone = row.created_at;
          }
        } else {
          createdAtForDone = audited;
        }

        if (!createdAtForDone) {
          console.warn(
            `${colors.yellow}deal ${deal.id}: DONE omitido — atividade PENDING não encontrada (integration_id esperado ${stableOld}; registos antigos usavam timeline-*).${colors.reset}`
          );
        } else {
          const doneBody = buildGameProcessPayloadZohoStageProcess({
            deal,
            actionId: actionIdOld,
            userEmail: emailOld,
            status: 'DONE',
            integrationId: stableOld,
            createdAt: createdAtForDone,
            finishedAt: audited,
            oldVal,
            newVal,
            audited
          });
          dealBuilt++;
          log(
            `POST /game/action/process DONE (deal ${deal.id}, ${i + 1}/${totalDeals})`,
            `action_id=${actionIdOld} ← era Stage "${oldVal}"`,
            doneBody
          );
          if (!noPost) {
            const prDone = await game4uFetch(cfg.gameActionProcess.path, {
              method: cfg.gameActionProcess.method,
              body: doneBody
            });
            log(
              `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path} DONE deal ${deal.id}`,
              `status ${prDone.status}`,
              prDone.json
            );
            lastHttpStatusThisDeal = prDone.status;
            if (isGameActionProcessResponseOk(prDone)) {
              anyOkThisDeal = true;
              postsOk++;
            }
            await sleep(80);
          }
        }
      }
    }

    if (
      wantStageProcess &&
      actionIdNew &&
      newVal &&
      !(isFinanceStageName(newVal, map, deal) && !financeStageEligibleForDeal(deal))
    ) {
      const emailNew = await resolveEmailForZohoStageTeam(newVal, deal, map, token, zohoUserEmailCache);
      if (!emailNew) {
        console.warn(
          `${colors.yellow}deal ${deal.id}: sem e-mail para abrir Stage "${newVal}" — pulando PENDING.${colors.reset}`
        );
      } else {
        const stableNew = buildZohoStableIntegrationId(deal.id, actionIdNew);
        const pendingBody = buildGameProcessPayloadZohoStageProcess({
          deal,
          actionId: actionIdNew,
          userEmail: emailNew,
          status: 'PENDING',
          integrationId: stableNew,
          createdAt: audited,
          finishedAt: null,
          oldVal,
          newVal,
          audited
        });
        dealBuilt++;
        log(
          `POST /game/action/process PENDING (deal ${deal.id}, ${i + 1}/${totalDeals})`,
          `action_id=${actionIdNew} ← Stage "${newVal}"`,
          pendingBody
        );
        if (!noPost) {
          const prPen = await game4uFetch(cfg.gameActionProcess.path, {
            method: cfg.gameActionProcess.method,
            body: pendingBody
          });
          log(
            `${cfg.gameActionProcess.method} ${cfg.gameActionProcess.path} PENDING deal ${deal.id}`,
            `status ${prPen.status}`,
            prPen.json
          );
          lastHttpStatusThisDeal = prPen.status;
          if (isGameActionProcessResponseOk(prPen)) {
            anyOkThisDeal = true;
            postsOk++;
          }
          await sleep(80);
        }
      }
    }

    if (wantCompleteDelivery) {
      log(
        `POST delivery/complete (deal ${deal.id})`,
        `Stage novo "${newVal}" em stagesThatCompleteDelivery`,
        { finished_at: audited }
      );
      if (!noPost) {
        const dr = await game4uPostDeliveryCompleteIfConfigured(deal.id, audited);
        log(`POST .../delivery/.../complete deal ${deal.id}`, `status ${dr.status}`, dr.json);
        lastHttpStatusThisDeal = dr.status;
        if (dr.ok) {
          anyOkThisDeal = true;
          deliveryCompleteOk++;
        }
      } else {
        dealBuilt++;
      }
    }

    builtPayloads += dealBuilt;
    announceDone(
      i + 1,
      totalDeals,
      `Zoho→G4U deal ${deal.id} (process + delivery)`,
      anyOkThisDeal,
      lastHttpStatusThisDeal,
      { dealBuilt, wantCompleteDelivery }
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
      `${colors.yellow}[--no-post-process] ${builtPayloads} payload(s) montado(s) a partir de ${totalDeals} deal(s) na página 1.${colors.reset}`
    );
  } else {
    console.log(
      `\nResumo Zoho→Game4U: ${postsOk} POST(s) /game/action/process OK, ${deliveryCompleteOk} delivery complete OK, ${builtPayloads} payload(s) montados (estimativa).`
    );
    if (builtPayloads === 0) {
      console.warn(
        `${colors.yellow}Nenhum deal teve Stage no mapa + timeline; verifique zoho-crm-action-map.json ou G4U_ZOHO_STAGE_ACTION_ID.${colors.reset}`
      );
    }
  }
}

async function cmdZohoTasks(argv) {
  const noPost = argv.includes('--no-post-process');
  const postAllMapped = argv.includes('--post-all-mapped');
  const maxDeals =
    argInt(argv, '--max-deals', parseInt(process.env.ZOHO_MAX_DEALS || '200', 10)) || 200;
  const map = loadZohoCrmActionMap();

  const { from, to, kf, kt } = zohoModifiedTimeRange();
  if (!from || !to) {
    throw new Error(`Defina ${kf} e ${kt} (ou alias ZOHO_MOVIFIED_FROM / ZOHO_MOVIFIED_TO se usar o typo)`);
  }
  const criteria = zohoDealsSearchCriteria(from, to, argv);
  const token = await zohoRefreshToken();
  const zohoUserEmailCache = new Map();
  const searchUrl = buildZohoDealsSearchUrl(criteria, 1);
  const r = await fetch(searchUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const txt = await r.text();
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    data = { _raw: txt };
  }
  const info = data?.info;
  log(
    'Zoho Deals/search (zoho-tasks, página 1)',
    `status ${r.status} criteria=${criteria}` +
      (info
        ? ` | page=${info.page} per_page=${info.per_page} more_records=${info.more_records} count=${info.count}`
        : ''),
    data
  );

  const pageDeals = data?.data ?? [];
  if (!pageDeals.length) {
    console.warn(`${colors.yellow}Nenhum deal na primeira página do search.${colors.reset}`);
    return;
  }

  const subset = pageDeals.slice(0, maxDeals);
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
    if (!zohoUserLookupFilled(jur)) {
      console.warn(
        `${colors.dim}deal ${deal.id}: sem Respons_vel_Jur / Jur_dico_Respons_vel — pulando (zoho-tasks só deals com jurídico).${colors.reset}`
      );
      continue;
    }

    const url = cfg.zoho.dealActivitiesChronological.pathTemplate.replace('{{dealId}}', deal.id);
    const r2 = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const t2 = await r2.text();
    let j2;
    try {
      j2 = JSON.parse(t2);
    } catch {
      j2 = { _raw: t2 };
    }
    log(`Zoho Activities_Chronological [${i + 1}/${totalDeals}] deal ${deal.id}`, `status ${r2.status}`, j2);

    const list = extractZohoActivitiesChronologicalList(j2);
    const hit = findLatestActivityWithTagFlow(list, map);
    if (!hit) {
      console.warn(
        `${colors.dim}deal ${deal.id}: nenhuma atividade com texto de tagFlowTitleToActionTemplateId — pulando.${colors.reset}`
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

    const email = await zohoResolveUserEmailFromLookup(jur, token, zohoUserEmailCache);
    if (!email) {
      console.warn(
        `${colors.yellow}deal ${deal.id}: jurídico sem e-mail resolvido — pulando POST.${colors.reset}`
      );
      continue;
    }

    let createdAtUse =
      hit.activity.Created_Time || hit.activity.created_time || audited;

    if (g4uStatus === 'DONE') {
      createdAtUse = null;
      if (!noPost) {
        const searchRes = await game4uFetchPendingUserActionsForDelivery(deal.id);
        log(
          `GET user-action/search (deal ${deal.id}, jur DONE ${hit.actionId})`,
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
      if (!createdAtUse) {
        console.warn(
          `${colors.yellow}deal ${deal.id}: DONE jur omitido — atividade PENDING não encontrada (integration_id esperado ${stableIntId}).${colors.reset}`
        );
        announceDone(i + 1, totalDeals, `Zoho Jur→G4U deal ${deal.id}`, false, lastHttpStatus, {
          skipped: 'DONE sem created_at da API'
        });
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
    builtPayloads += dealBuilt;
    log(
      `POST /game/action/process JUR ${g4uStatus} (deal ${deal.id}, ${i + 1}/${totalDeals})`,
      `action_id=${hit.actionId}`,
      body
    );

    if (!noPost) {
      const pr = await game4uFetch(cfg.gameActionProcess.path, {
        method: cfg.gameActionProcess.method,
        body
      });
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
      `Zoho Jur→G4U deal ${deal.id} (${g4uStatus})`,
      noPost ? dealBuilt > 0 : anyOkThisDeal,
      lastHttpStatus,
      { dealBuilt, g4uStatus, integration_id: stableIntId }
    );
    await maybePauseBetweenOps(argv);

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
  const r = await game4uFetch(cfg.gameActionProcess.path, {
    method: cfg.gameActionProcess.method,
    body
  });
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
  zoho-stages                   Zoho: página 1 Deals/search; __timeline 1ª página. Por transição Stage:
                                DONE estágio anterior + PENDING novo (action_id via zoho-crm-action-map.json).
                                integration_id estável zoho-deal-{id}-action-{template}; antes do DONE usa
                                GET /user-action/search para created_at. Novo Stage em stagesThatCompleteDelivery
                                → POST /game/delivery/{id}/complete. Regras CS vs financeiro e Jur omitido por Stage
                                (usar zoho-tasks) como antes. Opções: --no-post-process --post-all-mapped
                                --zoho-timeline-bare --zoho-ignore-pipeline-filter  |  Env: ZOHO_* ZOHO_MODIFIED_*
                                G4U_ZOHO_STAGE_ACTION_ID  G4U_ZOHO_*  ZOHO_DEALS_PIPELINE_FILTER
  zoho-tasks                    Deals com Respons_vel_Jur/Jur_dico_Respons_vel: Activities_Chronological_View_History;
                                última atividade cuja JSON contém chave de tagFlowTitleToActionTemplateId → action_id;
                                status da task → G4U (zoho.jurActivitiesFromZoho.zohoTaskStatusToGame4uStatus);
                                POST /game/action/process; integration_id zoho-deal-{id}-jur-action-{template};
                                DONE com user-action/search como zoho-stages. Opções: --no-post-process
                                --post-all-mapped --max-deals  |  mesmo search/pipeline que zoho-stages
  probe-game-action-process      POST /game/action/process com corpo de exemplo (ver resposta da API)

Env úteis:
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
      case 'zoho-tasks':
        await cmdZohoTasks(argv);
        break;
      case 'probe-game-action-process':
        await cmdProbeGameActionProcess(argv);
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
