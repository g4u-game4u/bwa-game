import * as fs from 'fs';
import * as path from 'path';
import { loadRepoEnv, envStr } from './loadEnv';
import { parseCasosCsvMaps } from './parseCasosCsv';
import { fetchFunifierPlayers } from './funifierPlayerEmails';

function fallbackNameFromEmail(email: string): string {
  const local = email.split('@')[0] || email;
  return local.trim() || email;
}

/** Substrings (case-insensitive); if any appears in the email, the row is dropped from export. */
function excludeEmailSubstrings(): string[] {
  const raw = envStr(
    'USERS_EXPORT_EXCLUDE_EMAIL_CONTAINS',
    'users_export_exclude_email_contains'
  ).trim();
  const off = raw.toLowerCase() === 'false' || raw.toLowerCase() === 'none';
  if (off) {
    return [];
  }
  if (raw) {
    return raw
      .split(/[,;]/g)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['@cidadania4u', '@gmail'];
}

function isEmailExcluded(email: string, parts: string[]): boolean {
  const e = email.toLowerCase();
  return parts.some(p => e.includes(p));
}

const DEFAULT_CSV = path.resolve(
  __dirname,
  '..',
  '..',
  'Lista de Casos(Lista Operação Completa).csv'
);

function parseArgs(argv: string[]): {
  out: string;
  csvPath: string;
  limit?: number;
  emails?: string[];
  dryRun: boolean;
  help: boolean;
} {
  let out = path.resolve(__dirname, '..', 'output', 'users-with-passwords.json');
  let csvPath = envStr('CASOS_CSV_PATH', 'casos_csv_path') || DEFAULT_CSV;
  let limit: number | undefined;
  let emails: string[] | undefined;
  let dryRun = false;
  let help = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--out' && argv[i + 1]) {
      out = path.resolve(argv[++i]);
    } else if (a === '--csv' && argv[i + 1]) {
      csvPath = path.resolve(argv[++i]);
    } else if (a === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === '--emails' && argv[i + 1]) {
      emails = argv[++i]
        .split(/[,;]/g)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return { out, csvPath, limit, emails, dryRun, help };
}

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`Usage: npm run users:export -- [options]
  --out <file>     Output JSON (default: migration-tools/output/users-with-passwords.json)
  --csv <file>     Lista de Casos CSV (default: ../Lista de Casos(Lista Operação Completa).csv)
  --limit <n>      After merge, keep first N emails (sorted)
  --emails a,b     Only include these emails (must appear in Funifier list)
  --dry-run        Print counts only, do not write file
Env: FUNIFIER_BASIC_TOKEN, FUNIFIER_BASE_URL (optional), CASOS_CSV_PATH (optional)
     USERS_EXPORT_EXCLUDE_EMAIL_CONTAINS — comma-separated substrings to drop (default @cidadania4u,@gmail); use none or false to exclude nothing`);

    process.exit(0);
  }

  if (!fs.existsSync(args.csvPath)) {
    console.error('CSV not found:', args.csvPath);
    process.exit(1);
  }

  const { passwords: passwordByEmail, names: nameByEmail } = parseCasosCsvMaps(args.csvPath);
  console.log('CSV rows with password:', passwordByEmail.size);
  console.log('CSV rows with name:', nameByEmail.size);

  const requiredSet =
    args.emails && args.emails.length > 0 ? new Set(args.emails.map(e => e.toLowerCase())) : undefined;
  const funifierPlayers = await fetchFunifierPlayers({
    requiredEmails: requiredSet
  });
  console.log('Funifier players:', funifierPlayers.length);

  let merged: {
    email: string;
    fullName: string;
    plainPassword: string;
    passwordFromCsv: boolean;
  }[] = funifierPlayers.map(p => {
    const email = p.email;
    const fromCsv = passwordByEmail.has(email);
    const plainPassword = passwordByEmail.get(email) ?? '123456';
    const fullName =
      nameByEmail.get(email)?.trim() ||
      p.funifierName?.trim() ||
      fallbackNameFromEmail(email);
    return { email, fullName, plainPassword, passwordFromCsv: fromCsv };
  });

  const excludeParts = excludeEmailSubstrings();
  const beforeExclude = merged.length;
  merged = merged.filter(m => !isEmailExcluded(m.email, excludeParts));
  const excluded = beforeExclude - merged.length;
  if (excluded > 0) {
    console.log(
      'Excluded by email substring (',
      excludeParts.join(', '),
      '):',
      excluded,
      'rows'
    );
  }

  if (args.emails && args.emails.length > 0) {
    const set = new Set(args.emails);
    merged = merged.filter(m => set.has(m.email));
    const missing = args.emails.filter(e => !merged.some(m => m.email === e));
    if (missing.length) {
      console.warn('Not found in Funifier export (after filter):', missing.join(', '));
    }
  }

  merged.sort((a, b) => a.email.localeCompare(b.email));

  if (args.limit != null) {
    merged = merged.slice(0, args.limit);
  }

  console.log('Output rows:', merged.length);
  console.log('With CSV password:', merged.filter(m => m.passwordFromCsv).length);
  console.log('Default 123456:', merged.filter(m => !m.passwordFromCsv).length);

  if (args.dryRun) {
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Wrote', args.out);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
