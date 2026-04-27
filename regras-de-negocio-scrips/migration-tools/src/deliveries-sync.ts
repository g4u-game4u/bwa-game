import * as fs from 'fs';
import * as path from 'path';
import { loadRepoEnv, envStr } from './loadEnv';

type DeliveryRow = {
  id?: string | number;
  ent_id?: string | number | null;
  company_id?: string | number | null;
  company_cnpj?: string | null;
  nome?: string | null;
  competencia?: string | null;
  resp_entrega?: string | null;
  user_email?: string | null;
  dt_entrega?: string | null;
  last_dh?: string | null;
};

type CompanyRow = {
  cnpj: string;
  fantasia?: string | null;
  razao_social?: string | null;
};

export type ProcessPayload = {
  status: string;
  user_email: string | null;
  action_title: string;
  delivery_id: string;
  delivery_title: string;
  integration_id: string;
  created_at: string;
  finished_at?: string;
  comments: unknown[];
  approved: boolean;
  dismissed: boolean;
};

function digitsOnly(cnpj: string | null | undefined): string {
  return String(cnpj ?? '').replace(/\D/g, '');
}

function deliveryId(row: DeliveryRow): string {
  const c = String(row.company_id ?? '').trim();
  const comp = String(row.competencia ?? '').trim();
  return `${c}|${comp}`;
}

function companyTitle(map: Map<string, CompanyRow>, companyCnpj: string | null | undefined): string {
  const key = digitsOnly(companyCnpj);
  const co = key ? map.get(key) : undefined;
  if (!co) {
    return '';
  }
  const f = (co.fantasia ?? '').trim();
  const r = (co.razao_social ?? '').trim();
  return f || r || '';
}

function parseArgs(argv: string[]): {
  limit: number;
  fetchAll: boolean;
  pageSize: number;
  batchPost: number;
  ids?: string[];
  dryRun: boolean;
  outPayloads?: string;
  help: boolean;
} {
  let limit = 10;
  let fetchAll = false;
  let pageSize = 500;
  let batchPost = 100;
  let ids: string[] | undefined;
  let dryRun = false;
  let outPayloads: string | undefined;
  let help = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--all') {
      fetchAll = true;
    } else if (a === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === '--page-size' && argv[i + 1]) {
      pageSize = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === '--batch-post' && argv[i + 1]) {
      batchPost = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === '--ids' && argv[i + 1]) {
      ids = argv[++i]
        .split(/[,;]/g)
        .map(s => s.trim())
        .filter(Boolean);
    } else if (a === '--out-payloads' && argv[i + 1]) {
      outPayloads = path.resolve(argv[++i]);
    }
  }
  return { limit, fetchAll, pageSize, batchPost, ids, dryRun, outPayloads, help };
}

async function supabaseGet(
  baseUrl: string,
  key: string,
  pathAndQuery: string,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...extraHeaders
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase GET ${pathAndQuery} ${res.status}: ${t.slice(0, 800)}`);
  }
  return res.json();
}

function mapRow(row: DeliveryRow, companies: Map<string, CompanyRow>): ProcessPayload {
  const hasRespEntrega =
    row.resp_entrega != null && String(row.resp_entrega).trim() !== '';
  const status = hasRespEntrega ? 'DONE' : 'PENDING';
  const userEmail = row.user_email != null ? String(row.user_email).trim().toLowerCase() : null;
  const nome = row.nome != null ? String(row.nome).trim() : '';
  const title = companyTitle(companies, row.company_cnpj);
  const created_at = new Date().toISOString();
  const payload: ProcessPayload = {
    status,
    user_email: userEmail && userEmail.includes('@') ? userEmail : null,
    action_title: nome,
    delivery_id: deliveryId(row),
    delivery_title: title,
    integration_id: String(row.ent_id ?? row.id ?? '').trim(),
    created_at,
    comments: [],
    approved: false,
    dismissed: false
  };
  if (hasRespEntrega) {
    const fin = row.dt_entrega || row.last_dh;
    if (fin) {
      payload.finished_at = String(fin);
    }
  }
  return payload;
}

async function game4uLogin(
  base: string,
  clientId: string,
  email: string,
  password: string
): Promise<string> {
  const url = `${base.replace(/\/$/, '')}/auth/login`;
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
    throw new Error('Login OK but no access_token in response keys: ' + Object.keys(body).join(','));
  }
  return token;
}

async function postProcess(
  base: string,
  clientId: string,
  bearer: string,
  payload: ProcessPayload | ProcessPayload[]
): Promise<unknown> {
  const url = `${base.replace(/\/$/, '')}/game/action/process`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: clientId,
      Authorization: `Bearer ${bearer}`
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`POST /game/action/process ${res.status}: ${String(text).slice(0, 800)}`);
  }
  return json;
}

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run deliveries:sync -- [options]
  --all              Fetch every delivery (paginated); ignores --limit for fetch count
  --limit <n>        Max deliveries when not using --all (default 10)
  --page-size <n>    Rows per Supabase request with --all (default 500; env DELIVERIES_PAGE_SIZE)
  --batch-post <n>   POST /game/action/process with at most n payloads per request (default 100)
  --ids id1,id2      Filter by deliveries.id
  --dry-run          Build payloads only; no POST (unless --out-payloads writes file)
  --out-payloads <f> Write JSON array of payloads to file

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
  SUPABASE_DB_SCHEMA (default public; use game4you only if exposed in Supabase API)
  SUPABASE_DELIVERIES_TABLE (default deliveries)
  BACKEND_URL_BASE, CLIENT_ID
  GAME4U_LOGIN_EMAIL, GAME4U_LOGIN_PASSWORD (or MIGRATION_G4U_EMAIL / MIGRATION_G4U_PASSWORD)`);
    process.exit(0);
  }

  const supabaseUrl = envStr('SUPABASE_URL', 'supabase_url');
  const supabaseKey =
    envStr(
      'SUPABASE_SERVICE_ROLE_KEY',
      'supabase_service_role_key',
      'SUPABASE_SERVICE_ROLE_SECRET',
      'SUPABASE_ANON_KEY',
      'supabase_anon_key'
    );
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or Supabase key in .env');
  }

  /** Same as Angular `supabaseDbSchema` — schema must be exposed in Supabase API (Settings → API). */
  const dbSchema = (envStr('SUPABASE_DB_SCHEMA', 'supabase_db_schema') || 'public').trim();
  const companiesTable = envStr('SUPABASE_COMPANIES_TABLE', 'supabase_companies_table') || 'companies';
  const deliveriesTable =
    envStr('SUPABASE_DELIVERIES_TABLE', 'supabase_deliveries_table') || 'deliveries';

  const pageSizeEnv = parseInt(
    envStr('DELIVERIES_PAGE_SIZE', 'deliveries_page_size') || '',
    10
  );
  const pageSize =
    Number.isFinite(pageSizeEnv) && pageSizeEnv > 0 ? pageSizeEnv : args.pageSize;

  const selectQ =
    'select=id,ent_id,company_id,company_cnpj,nome,competencia,resp_entrega,user_email,dt_entrega,last_dh';

  const deliveryHeaders: Record<string, string> = { Accept: 'application/json' };
  if (dbSchema && dbSchema !== 'public') {
    deliveryHeaders['Accept-Profile'] = dbSchema;
  }

  const idFilter = args.ids?.length ? `&id=in.(${args.ids.join(',')})` : '';

  let deliveries: DeliveryRow[];
  try {
    if (args.fetchAll) {
      deliveries = [];
      let offset = 0;
      for (;;) {
        const query = `${selectQ}&order=id.asc${idFilter}&limit=${pageSize}&offset=${offset}`;
        const page = (await supabaseGet(
          supabaseUrl,
          supabaseKey,
          `${deliveriesTable}?${query}`,
          deliveryHeaders
        )) as DeliveryRow[];
        deliveries.push(...page);
        if (page.length < pageSize) {
          break;
        }
        offset += pageSize;
        console.log('Deliveries fetched so far:', deliveries.length);
      }
    } else {
      const query = `${selectQ}&order=id.asc${idFilter}&limit=${args.limit}`;
      deliveries = (await supabaseGet(
        supabaseUrl,
        supabaseKey,
        `${deliveriesTable}?${query}`,
        deliveryHeaders
      )) as DeliveryRow[];
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('PGRST106')) {
      throw new Error(
        `${msg}\nHint: Supabase Dashboard → Settings → API → "Exposed schemas": add "${dbSchema}" ` +
          `(PostgREST only serves schemas listed there; default is usually public only).`
      );
    }
    if (msg.includes('404') || msg.includes('PGRST205')) {
      throw new Error(
        `${msg}\nHint: set SUPABASE_DB_SCHEMA and/or SUPABASE_DELIVERIES_TABLE in .env to match ` +
          `your PostgREST schema (table must exist in that schema).`
      );
    }
    throw e;
  }

  console.log('Deliveries fetched:', deliveries.length);

  const companyHeaders: Record<string, string> = { Accept: 'application/json' };
  if (dbSchema && dbSchema !== 'public') {
    companyHeaders['Accept-Profile'] = dbSchema;
  }

  const companiesJson = (await supabaseGet(
    supabaseUrl,
    supabaseKey,
    `${companiesTable}?select=cnpj,fantasia,razao_social`,
    companyHeaders
  )) as CompanyRow[];

  const companyMap = new Map<string, CompanyRow>();
  for (const c of companiesJson) {
    companyMap.set(digitsOnly(c.cnpj), c);
  }
  console.log('Companies in map:', companyMap.size);

  const payloads = deliveries.map(d => mapRow(d, companyMap));

  if (args.outPayloads) {
    fs.mkdirSync(path.dirname(args.outPayloads), { recursive: true });
    fs.writeFileSync(args.outPayloads, JSON.stringify(payloads, null, 2), 'utf8');
    console.log('Wrote payloads:', args.outPayloads);
  }

  console.log('Sample payload:', JSON.stringify(payloads[0], null, 2));

  if (args.dryRun) {
    console.log('Dry-run: skipping POST /game/action/process');
    process.exit(0);
  }

  const base = envStr('BACKEND_URL_BASE', 'backend_url_base');
  const clientId = envStr('CLIENT_ID', 'client_id');
  const email = envStr('GAME4U_LOGIN_EMAIL', 'MIGRATION_G4U_EMAIL');
  const password = envStr('GAME4U_LOGIN_PASSWORD', 'MIGRATION_G4U_PASSWORD');
  if (!base || !clientId || !email || !password) {
    throw new Error(
      'Missing BACKEND_URL_BASE, CLIENT_ID, GAME4U_LOGIN_EMAIL, GAME4U_LOGIN_PASSWORD for POST'
    );
  }

  const bearer = await game4uLogin(base, clientId, email, password);
  const n = args.batchPost;
  let batchIndex = 0;
  for (let i = 0; i < payloads.length; i += n) {
    const chunk = payloads.slice(i, i + n);
    const body = chunk.length === 1 ? chunk[0]! : chunk;
    batchIndex += 1;
    console.log(`POST batch ${batchIndex} (${chunk.length} payload(s)), offset ${i}`);
    const resp = await postProcess(base, clientId, bearer, body);
    console.log('Process response (truncated):', JSON.stringify(resp, null, 2).slice(0, 1500));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
