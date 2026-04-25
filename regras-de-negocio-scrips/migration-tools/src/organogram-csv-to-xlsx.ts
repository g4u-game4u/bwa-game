import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

function repoRootFromHere(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function defaultOrganogramDir(): string {
  return path.join(repoRootFromHere(), 'regras-de-negocio-scrips', 'get-organograma-from-supabase');
}

function parseArgs(argv: string[]): { help: boolean; dir: string } {
  let help = false;
  let dir = defaultOrganogramDir();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--dir' && argv[i + 1]) {
      dir = path.resolve(argv[++i]);
    }
  }
  return { help, dir };
}

function collectCsvFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    throw new Error(`Directory does not exist: ${root}`);
  }
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.csv')) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Reads a CSV file and writes `<sameBase>.xlsx` next to it (one sheet).
 * @returns path to the written .xlsx
 */
export function convertCsvToXlsx(csvPath: string): string {
  const abs = path.resolve(csvPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`CSV not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const wb = XLSX.read(raw, { type: 'string', raw: true });
  const outPath = abs.replace(/\.csv$/i, '.xlsx');
  XLSX.writeFile(wb, outPath, { bookType: 'xlsx' });
  return outPath;
}

function main(): void {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run organogram:csv-to-xlsx -- [options]

Finds all .csv under --dir (recursive) and writes a matching .xlsx beside each file.

Options:
  --dir <path>  Root folder (default: regras-de-negocio-scrips/get-organograma-from-supabase)
`);
    return;
  }

  const files = collectCsvFiles(args.dir);
  if (files.length === 0) {
    console.error(`No .csv files found under ${args.dir}`);
    process.exitCode = 1;
    return;
  }

  for (const csv of files) {
    const xlsx = convertCsvToXlsx(csv);
    console.log(`${csv} -> ${xlsx}`);
  }
  console.log(`Done: ${files.length} file(s).`);
}

if (require.main === module) {
  main();
}
