import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

export type CasosMaps = {
  /** Normalized email -> password (only rows with non-empty Senha). */
  passwords: Map<string, string>;
  /** Normalized email -> display name from column Nome. */
  names: Map<string, string>;
};

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Passwords and names from "Lista de Casos" CSV (columns E-mail, Senha, Nome). */
export function parseCasosCsvMaps(filePath: string): CasosMaps {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as Record<string, string>[];

  const passwords = new Map<string, string>();
  const names = new Map<string, string>();
  for (const row of rows) {
    const emailRaw =
      row['E-mail'] ?? row['E-mail '] ?? row['email'] ?? row['Email'] ?? '';
    const senha = row['Senha'] ?? row['senha'] ?? '';
    const nomeRaw = row['Nome'] ?? row['nome'] ?? '';
    const email = String(emailRaw).trim().toLowerCase();
    if (!email || !email.includes('@')) {
      continue;
    }
    if (senha && String(senha).trim() !== '') {
      passwords.set(email, String(senha).trim());
    }
    const nome = normalizeSpaces(String(nomeRaw));
    if (nome) {
      names.set(email, nome);
    }
  }
  return { passwords, names };
}

/** Map normalized email -> password from "Lista de Casos" CSV. */
export function parseCasosCsv(filePath: string): Map<string, string> {
  return parseCasosCsvMaps(filePath).passwords;
}
