import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CompanyResponsavel, SupabaseCompanyRow } from '@model/supabase-company.model';
import { SUPABASE_COMPANIES_MOCK } from './supabase-companies.mock';

@Injectable({
  providedIn: 'root'
})
export class SupabaseCompaniesService {
  /** Widen generics so `db.schema` from env (e.g. game4you) type-checks */
  private client: SupabaseClient<any, string, string, any, any> | null = null;

  constructor(private sessaoProvider: SessaoProvider) {}

  /**
   * True only when `environment.supabaseUseMock` is on (dev default).
   * When mock is off but URL/key are missing, the service returns an empty list — not mock rows.
   */
  usesMock(): boolean {
    return environment.supabaseUseMock;
  }

  /**
   * Companies where any of the given emails appears in `responsaveis`.
   * Dedupes by `id` when `dedupe` is true (e.g. team aggregation).
   */
  getCompaniesForEmails(emails: string[], dedupe = true): Observable<SupabaseCompanyRow[]> {
    const normalized = this.normalizeEmailList(emails);
    if (normalized.length === 0) {
      return of([]);
    }

    if (this.usesMock()) {
      return of(this.getMockRows(normalized, dedupe));
    }

    if (!this.getSupabaseUrl() || !this.getSupabaseAnonKey()) {
      console.warn(
        'Supabase carteira: mock desligado (SUPABASE_USE_MOCK) mas URL ou anon key vazios no build. ' +
          'Confira .env, reinicie `ng serve`, e se usa custom webpack.'
      );
      return of([]);
    }

    return this.fetchFromSupabase(normalized, dedupe);
  }

  /**
   * Resolves `me` / session to email; otherwise uses `playerId` as email.
   */
  getCompaniesForPlayer(playerId: string, dedupe = true): Observable<SupabaseCompanyRow[]> {
    const email = this.resolveEmailFromPlayerId(playerId);
    if (!email) {
      return of([]);
    }
    return this.getCompaniesForEmails([email], dedupe);
  }

  /** CNPJs in carteira order (for KPI enrichment / Funifier). */
  getCnpjListForPlayer(playerId: string): Observable<string[]> {
    return this.getCompaniesForPlayer(playerId).pipe(
      map(rows => rows.map(r => r.cnpj).filter(c => !!c && c.trim().length > 0))
    );
  }

  getCnpjListForEmails(emails: string[], dedupe = true): Observable<string[]> {
    return this.getCompaniesForEmails(emails, dedupe).pipe(
      map(rows => rows.map(r => r.cnpj).filter(c => !!c && c.trim().length > 0))
    );
  }

  applyRowsToCnpjMaps(
    rows: SupabaseCompanyRow[],
    nameMap: Map<string, string>,
    statusMap: Map<string, string>,
    numberMap: Map<string, string>
  ): void {
    for (const r of rows) {
      const key = r.cnpj;
      if (!key) continue;
      nameMap.set(key, r.fantasia || r.razao_social || key);
      if (r.status) {
        statusMap.set(key, r.status);
      }
      numberMap.set(key, r.cnpj);
    }
  }

  parseResponsaveis(raw: SupabaseCompanyRow['responsaveis']): CompanyResponsavel[] {
    if (raw == null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw.filter(r => r && typeof r.email === 'string');
    }
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s) as unknown;
        return Array.isArray(parsed)
          ? (parsed as CompanyResponsavel[]).filter(r => r && typeof r.email === 'string')
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private resolveEmailFromPlayerId(playerId: string): string | null {
    const trimmed = (playerId || '').trim();
    if (!trimmed || trimmed === 'me') {
      const u = this.sessaoProvider.usuario as { email?: string; _id?: string } | null;
      const e = (u?.email || u?._id || '').trim();
      return e || null;
    }
    return trimmed;
  }

  private normalizeEmailList(emails: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const e of emails) {
      const n = (e || '').trim().toLowerCase();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  private getMockRows(emails: string[], dedupe: boolean): SupabaseCompanyRow[] {
    const source = SUPABASE_COMPANIES_MOCK.map(r => this.cloneRow(r));
    let rows: SupabaseCompanyRow[];

    if (environment.supabaseMockFeedAllUsers) {
      rows = source;
    } else {
      rows = source.filter(row => {
        const list = this.parseResponsaveis(row.responsaveis);
        return list.some(r => emails.includes((r.email || '').trim().toLowerCase()));
      });
    }

    return dedupe ? this.dedupeById(rows) : rows;
  }

  private cloneRow(row: SupabaseCompanyRow): SupabaseCompanyRow {
    return {
      ...row,
      responsaveis: Array.isArray(row.responsaveis)
        ? row.responsaveis.map(r => ({ ...r }))
        : row.responsaveis
    };
  }

  private dedupeById(rows: SupabaseCompanyRow[]): SupabaseCompanyRow[] {
    const seen = new Set<number>();
    const out: SupabaseCompanyRow[] = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  }

  private getOrCreateClient(): SupabaseClient<any, string, string, any, any> | null {
    const url = this.getSupabaseUrl();
    const key = this.getSupabaseAnonKey();
    if (!url || !key) {
      return null;
    }
    if (!this.client) {
      const schema = (environment.supabaseDbSchema || 'public').trim() || 'public';
      this.client = createClient(url, key, {
        db: { schema }
      });
    }
    return this.client;
  }

  private getSupabaseUrl(): string {
    return (environment.supabaseUrl || '').trim();
  }

  private getSupabaseAnonKey(): string {
    return (environment.supabaseAnonKey || '').trim();
  }

  private fetchFromSupabase(emails: string[], dedupe: boolean): Observable<SupabaseCompanyRow[]> {
    const client = this.getOrCreateClient();
    if (!client) {
      console.error('Supabase carteira: cliente não criado após validar URL/key.');
      return of([]);
    }

    const table = environment.supabaseCompaniesTable || 'companies';

    /**
     * `responsaveis` is jsonb (array of `{ email, nome, departamento }`). ILIKE only applies to text,
     * so PostgREST was generating `jsonb ~~*` and Postgres error 42883.
     * Use `@>` (contains) via `.contains`: row matches if any array element is a superset of `{ email }`.
     * Emails are already lowercased in `normalizeEmailList` — store emails lowercase in JSON for reliable matches.
     */
    const requests = emails.map(email =>
      from(
        client
          .from(table)
          .select('*')
          .contains('responsaveis', JSON.stringify([{ email }]))
      )
    );

    return forkJoin(requests).pipe(
      map(results => {
        const merged: SupabaseCompanyRow[] = [];
        for (const { data, error } of results) {
          if (error) {
            console.error('Supabase companies error:', error);
            throw error;
          }
          for (const row of (data || []) as Record<string, unknown>[]) {
            merged.push(this.normalizeDbRow(row));
          }
        }
        return dedupe ? this.dedupeById(merged) : merged;
      }),
      catchError(err => {
        console.error(
          'Supabase carteira: falha na requisição (mock desligado — não vamos devolver dados mock).',
          err
        );
        return of([]);
      })
    );
  }

  private normalizeDbRow(row: Record<string, unknown>): SupabaseCompanyRow {
    const empRaw = row['emp_id'] ?? row['EmpID'] ?? row['empId'] ?? row['empresa_id'];
    const empStr =
      empRaw != null && String(empRaw).trim() !== '' ? String(empRaw).trim() : undefined;
    return {
      id: Number(row['id']),
      cnpj: this.normalizeCnpjFromDb(row['cnpj']),
      emp_id: empStr,
      razao_social: String(row['razao_social'] ?? ''),
      fantasia: String(row['fantasia'] ?? ''),
      status: String(row['status'] ?? ''),
      client_type_id: row['client_type_id'] != null ? Number(row['client_type_id']) : null,
      synced_at: String(row['synced_at'] ?? ''),
      created_at: String(row['created_at'] ?? ''),
      responsaveis: (row['responsaveis'] as SupabaseCompanyRow['responsaveis']) ?? null
    };
  }

  /**
   * CNPJ no PostgREST pode vir como número (perde zeros à esquerda) ou texto mascarado.
   */
  private normalizeCnpjFromDb(v: unknown): string {
    if (v == null) {
      return '';
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      const w = Math.trunc(v);
      const s = String(w);
      if (/^\d+$/.test(s) && s.length > 0 && s.length <= 14) {
        return s.padStart(14, '0');
      }
      return s;
    }
    const t = String(v).trim();
    const digits = t.replace(/\D/g, '');
    if (/^\d+$/.test(digits) && digits.length > 0 && digits.length <= 14) {
      return digits.length === 14 ? digits : digits.padStart(14, '0');
    }
    return t;
  }
}
