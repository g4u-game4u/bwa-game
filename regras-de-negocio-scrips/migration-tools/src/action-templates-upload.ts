import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { loadRepoEnv, envStr } from './loadEnv';

const FIXED_POINTS = 3;
const FIXED_CRITERIA = {
  executionTime: 1,
  complexity: 3,
  seniorityLevel: 1,
  importance: 1
} as const;

type ActionTemplatePayload = {
  id: string;
  created_at: string;
  points: number;
  criteria: typeof FIXED_CRITERIA;
  title: string;
  integration_id: null;
  deactivated_at: null;
};

const DEFAULT_CSV_NAMES = [
  'action-template-pagina1.csv',
  'action-template-pagina2.csv',
  'action-template-pagina 3.csv'
];

function repoRootFromHere(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function defaultCsvDir(): string {
  return path.join(repoRootFromHere(), 'regras-de-negocio-scrips', 'action-templates');
}

function actionId(clientId: string, fileKey: string, rowIndex: number, title: string): string {
  const h = createHash('sha256')
    .update(`${fileKey}\0${rowIndex}\0${title}`)
    .digest('hex')
    .slice(0, 16);
  return `${clientId}_tpl_${h}`;
}

function parseArgs(argv: string[]): {
  dryRun: boolean;
  help: boolean;
  csvDir: string;
} {
  let dryRun = false;
  let help = false;
  let csvDir = defaultCsvDir();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--csv-dir' && argv[i + 1]) {
      csvDir = path.resolve(argv[++i]);
    }
  }
  return { dryRun, help, csvDir };
}

function normalizeTitleKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function isDuplicateActionError(status: number, text: string): boolean {
  if (status !== 400 && status !== 409) {
    return false;
  }
  const t = text.toLowerCase();
  return (
    t.includes('duplicate') ||
    t.includes('unique_title') ||
    t.includes('unique constraint') ||
    t.includes('already exists')
  );
}

function readTitlesFromCsv(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as Record<string, string>[];

  const titles: string[] = [];
  for (const row of rows) {
    const nome = row['nome'] ?? row['Nome'] ?? '';
    const t = String(nome).replace(/\s+/g, ' ').trim();
    if (t) {
      titles.push(t);
    }
  }
  return titles;
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

async function postAction(
  base: string,
  clientId: string,
  bearer: string,
  payload: ActionTemplatePayload
): Promise<{ duplicate: false; json: unknown } | { duplicate: true; status: number; text: string; json: unknown }> {
  const url = `${base.replace(/\/$/, '')}/action`;
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
    if (isDuplicateActionError(res.status, text)) {
      return { duplicate: true as const, status: res.status, text, json };
    }
    throw new Error(`POST /action ${res.status}: ${String(text).slice(0, 800)}`);
  }
  return { duplicate: false as const, json };
}

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run action-templates:upload -- [options]
  --dry-run          Build payloads and print counts; no login or POST
  --csv-dir <path>   Folder with action-template-pagina*.csv (default: regras-de-negocio-scrips/action-templates)

Env (same as deliveries sync; use repo-root or migration-tools .env):
  BACKEND_URL_BASE   e.g. https://g4u-api-bwa.onrender.com/api
  CLIENT_ID          e.g. bwa
  GAME4U_LOGIN_EMAIL, GAME4U_LOGIN_PASSWORD
  (aliases: G4U_ADMIN_EMAIL / G4U_ADMIN_PASSWORD, MIGRATION_G4U_EMAIL / MIGRATION_G4U_PASSWORD)`);
    process.exit(0);
  }

  const csvDir = args.csvDir;
  const files = DEFAULT_CSV_NAMES.map(name => path.join(csvDir, name));
  for (const f of files) {
    if (!fs.existsSync(f)) {
      throw new Error(`Missing CSV: ${f}`);
    }
  }

  const base = envStr('BACKEND_URL_BASE', 'backend_url_base');
  const clientId = envStr('CLIENT_ID', 'client_id');
  const email = envStr(
    'GAME4U_LOGIN_EMAIL',
    'G4U_ADMIN_EMAIL',
    'MIGRATION_G4U_EMAIL'
  );
  const password = envStr(
    'GAME4U_LOGIN_PASSWORD',
    'G4U_ADMIN_PASSWORD',
    'MIGRATION_G4U_PASSWORD'
  );

  type RowPlan = { fileKey: string; rowIndex: number; title: string; payload: ActionTemplatePayload };
  const plans: RowPlan[] = [];
  for (const filePath of files) {
    const fileKey = path.basename(filePath);
    const titles = readTitlesFromCsv(filePath);
    titles.forEach((title, rowIndex) => {
      const id = actionId(clientId || 'client', fileKey, rowIndex, title);
      const payload: ActionTemplatePayload = {
        id,
        created_at: new Date().toISOString(),
        points: FIXED_POINTS,
        criteria: { ...FIXED_CRITERIA },
        title,
        integration_id: null,
        deactivated_at: null
      };
      plans.push({ fileKey, rowIndex, title, payload });
    });
  }

  const seenTitles = new Set<string>();
  const deduped: RowPlan[] = [];
  for (const p of plans) {
    const key = normalizeTitleKey(p.title);
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);
    deduped.push(p);
  }
  const skippedCsvDupes = plans.length - deduped.length;

  console.log('CSV dir:', csvDir);
  console.log('Rows after CSV title dedupe:', deduped.length, skippedCsvDupes ? `(dropped ${skippedCsvDupes} duplicate title row(s))` : '');

  if (args.dryRun) {
    console.log('Dry-run sample:', JSON.stringify(deduped[0]?.payload, null, 2));
    process.exit(0);
  }

  if (!base || !clientId || !email || !password) {
    throw new Error(
      'Missing BACKEND_URL_BASE, CLIENT_ID, and login env (GAME4U_LOGIN_EMAIL / GAME4U_LOGIN_PASSWORD or aliases).'
    );
  }

  const bearer = await game4uLogin(base, clientId, email, password);
  let created = 0;
  let skippedApiDup = 0;
  const total = deduped.length;
  for (let i = 0; i < total; i++) {
    const p = deduped[i]!;
    process.stdout.write(`\rPOST ${i + 1}/${total} ${p.payload.id.slice(0, 24)}...`);
    const out = await postAction(base, clientId, bearer, p.payload);
    if (out.duplicate) {
      skippedApiDup += 1;
    } else {
      created += 1;
    }
  }
  console.log(
    `\nDone. Created ${created}, skipped duplicate (API) ${skippedApiDup}` +
      (skippedCsvDupes ? `, skipped duplicate (CSV) ${skippedCsvDupes}` : '') +
      '.'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
