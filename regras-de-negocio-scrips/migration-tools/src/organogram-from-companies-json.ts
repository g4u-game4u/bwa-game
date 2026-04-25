import * as fs from 'fs';
import * as path from 'path';
import { convertCsvToXlsx } from './organogram-csv-to-xlsx';

type CompanyRow = {
  id?: number;
  cnpj?: string;
  razao_social?: string;
  fantasia?: string;
  status?: string;
  responsaveis?: string | null;
};

type Responsavel = {
  nome?: string;
  email?: string;
  departamento?: string;
};

type PerEmpresa = {
  cnpj: string;
  fantasia: string;
  razao_social: string;
  departamentos: string[];
  pessoas: { nome: string; email: string }[];
};

function repoRootFromHere(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function defaultInputDir(): string {
  return path.join(repoRootFromHere(), 'regras-de-negocio-scrips', 'get-organograma-from-supabase');
}

function defaultOutDir(): string {
  return path.join(defaultInputDir(), 'out');
}

function parseArgs(argv: string[]): {
  help: boolean;
  inputDir: string;
  outDir: string;
  excludePlaceholder: boolean;
} {
  let help = false;
  let inputDir = defaultInputDir();
  let outDir = defaultOutDir();
  let excludePlaceholder = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--input-dir' && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if (a === '--out-dir' && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    } else if (a === '--exclude-placeholder') {
      excludePlaceholder = true;
    }
  }
  return { help, inputDir, outDir, excludePlaceholder };
}

function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function companyKey(row: CompanyRow): string {
  const cnpj = (row.cnpj ?? '').trim();
  if (cnpj) {
    return `cnpj:${cnpj}`;
  }
  return `id:${row.id ?? 'unknown'}`;
}

function parseResponsaveis(raw: string | null | undefined, ctx: string): Responsavel[] {
  if (raw == null || String(raw).trim() === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn(`[warn] responsaveis is not an array (${ctx})`);
      return [];
    }
    return parsed as Responsavel[];
  } catch (e) {
    console.warn(`[warn] invalid JSON in responsaveis (${ctx}): ${(e as Error).message}`);
    return [];
  }
}

function isPlaceholder(r: Responsavel, exclude: boolean): boolean {
  if (!exclude) {
    return false;
  }
  const email = (r.email ?? '').toLowerCase();
  const nome = (r.nome ?? '').trim().toLowerCase();
  if (email.includes('sem.responsavel')) {
    return true;
  }
  if (nome === 'sem responsavel' || nome === 'sem responsável') {
    return true;
  }
  return false;
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Input directory does not exist: ${dir}`);
  }
  const names = fs.readdirSync(dir);
  return names
    .filter((n) => n.toLowerCase().endsWith('.json') && n.toLowerCase().startsWith('companies_rows'))
    .map((n) => path.join(dir, n))
    .sort();
}

function main(): void {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run organogram:from-json -- [options]

Reads companies_rows*.json from --input-dir, keeps rows with status "Ativa",
parses responsaveis JSON, merges duplicate companies by CNPJ, writes:

  organograma-pessoas.csv    — cnpj,fantasia,nome,email,departamento (+ .xlsx)
  organograma-departamentos-pessoas.csv — departamento,nome,email (global, sem empresa) (+ .xlsx)
  organograma-por-empresa.json — departamentos and distinct pessoas per company

Options:
  --input-dir <path>   Folder with companies_rows*.json
                       (default: regras-de-negocio-scrips/get-organograma-from-supabase)
  --out-dir <path>     Output folder (default: <input-dir>/out)
  --exclude-placeholder  Skip entries like sem.responsavel@bwa.global / "Sem Responsavel"
`);
    return;
  }

  const files = listJsonFiles(args.inputDir);
  if (files.length === 0) {
    console.error(`No companies_rows*.json found in ${args.inputDir}`);
    process.exitCode = 1;
    return;
  }

  const allRows: CompanyRow[] = [];
  for (const fp of files) {
    const text = fs.readFileSync(fp, 'utf8');
    const chunk = JSON.parse(text) as CompanyRow[];
    if (!Array.isArray(chunk)) {
      console.warn(`[warn] skip ${fp}: root is not an array`);
      continue;
    }
    allRows.push(...chunk);
  }

  const ativas = allRows.filter((r) => String(r.status ?? '').trim() === 'Ativa');

  type Merged = {
    key: string;
    cnpj: string;
    fantasia: string;
    razao_social: string;
    responsaveisChunks: string[];
  };

  const byKey = new Map<string, Merged>();
  for (const row of ativas) {
    const key = companyKey(row);
    const cnpj = (row.cnpj ?? '').trim() || key;
    const existing = byKey.get(key);
    const raw = row.responsaveis ?? null;
    if (existing) {
      if (raw != null && String(raw).trim() !== '') {
        existing.responsaveisChunks.push(String(raw));
      }
    } else {
      byKey.set(key, {
        key,
        cnpj,
        fantasia: String(row.fantasia ?? '').trim(),
        razao_social: String(row.razao_social ?? '').trim(),
        responsaveisChunks: raw != null && String(raw).trim() !== '' ? [String(raw)] : []
      });
    }
  }

  fs.mkdirSync(args.outDir, { recursive: true });

  const csvLines: string[] = ['cnpj,fantasia,nome,email,departamento'];
  const perEmpresaList: PerEmpresa[] = [];
  const csvRowKeys = new Set<string>();

  /** chave departamento normalizada (minúsculas) → nome para exibição */
  const deptDisplayByKey = new Map<string, string>();
  /** chave departamento → pessoas distintas por e-mail (ou por nome se sem e-mail) */
  const peopleByDeptKey = new Map<string, Map<string, { nome: string; email: string }>>();

  for (const m of byKey.values()) {
    const ctxBase = `${m.cnpj} ${m.fantasia}`.trim();
    const entries: Responsavel[] = [];
    for (const chunk of m.responsaveisChunks) {
      entries.push(...parseResponsaveis(chunk, ctxBase));
    }

    const deptSet = new Set<string>();
    const pessoaByEmail = new Map<string, { nome: string; email: string }>();

    for (const r of entries) {
      if (isPlaceholder(r, args.excludePlaceholder)) {
        continue;
      }
      const nome = String(r.nome ?? '').trim();
      const email = String(r.email ?? '').trim();
      const departamento = String(r.departamento ?? '').trim();
      const emailKey = email.toLowerCase() || `nome:${nome.toLowerCase()}`;

      if (departamento) {
        deptSet.add(departamento);
        const deptKey = departamento.toLowerCase();
        if (!deptDisplayByKey.has(deptKey)) {
          deptDisplayByKey.set(deptKey, departamento);
        }
        let bucket = peopleByDeptKey.get(deptKey);
        if (!bucket) {
          bucket = new Map();
          peopleByDeptKey.set(deptKey, bucket);
        }
        if (nome || email) {
          if (!bucket.has(emailKey)) {
            bucket.set(emailKey, { nome: nome || email || '(sem nome)', email: email || '' });
          }
        }
      }
      if (nome || email) {
        if (!pessoaByEmail.has(emailKey)) {
          pessoaByEmail.set(emailKey, { nome: nome || email || '(sem nome)', email: email || '' });
        }
      }

      const csvKey = `${m.cnpj}\t${email.toLowerCase()}\t${departamento}\t${nome.toLowerCase()}`;
      if (csvRowKeys.has(csvKey)) {
        continue;
      }
      csvRowKeys.add(csvKey);
      csvLines.push(
        [
          csvEscape(m.cnpj),
          csvEscape(m.fantasia),
          csvEscape(nome),
          csvEscape(email),
          csvEscape(departamento)
        ].join(',')
      );
    }

    const departamentos = [...deptSet].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const pessoas = [...pessoaByEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email, 'pt-BR', { sensitivity: 'base' })
    );

    perEmpresaList.push({
      cnpj: m.cnpj,
      fantasia: m.fantasia,
      razao_social: m.razao_social,
      departamentos,
      pessoas
    });
  }

  perEmpresaList.sort((a, b) => a.cnpj.localeCompare(b.cnpj, 'pt-BR'));

  const deptCsvLines: string[] = ['departamento,nome,email'];
  const sortedDeptKeys = [...peopleByDeptKey.keys()].sort((a, b) => {
    const da = deptDisplayByKey.get(a) ?? a;
    const db = deptDisplayByKey.get(b) ?? b;
    return da.localeCompare(db, 'pt-BR');
  });
  for (const deptKey of sortedDeptKeys) {
    const displayDept = deptDisplayByKey.get(deptKey) ?? deptKey;
    const people = peopleByDeptKey.get(deptKey);
    if (!people) {
      continue;
    }
    const rows = [...people.values()].sort((p1, p2) =>
      p1.email.localeCompare(p2.email, 'pt-BR', { sensitivity: 'base' })
    );
    for (const p of rows) {
      deptCsvLines.push(
        [csvEscape(displayDept), csvEscape(p.nome), csvEscape(p.email)].join(',')
      );
    }
  }

  const csvPath = path.join(args.outDir, 'organograma-pessoas.csv');
  const deptCsvPath = path.join(args.outDir, 'organograma-departamentos-pessoas.csv');
  const jsonPath = path.join(args.outDir, 'organograma-por-empresa.json');

  // Write departamentos CSV first: organograma-pessoas.csv is often open in the IDE (EBUSY on Windows).
  fs.writeFileSync(deptCsvPath, deptCsvLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(perEmpresaList, null, 2), 'utf8');
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');

  const xlsxDept = convertCsvToXlsx(deptCsvPath);
  const xlsxPessoas = convertCsvToXlsx(csvPath);

  console.log(
    `Wrote ${csvPath} (${csvLines.length - 1} data rows), ${deptCsvPath} (${deptCsvLines.length - 1} data rows), and ${jsonPath} (${perEmpresaList.length} companies).`
  );
  console.log(`XLSX: ${xlsxDept}, ${xlsxPessoas}`);
  console.log(`Sources: ${files.length} file(s), ${ativas.length} active row(s), ${byKey.size} distinct company key(s).`);
}

main();
