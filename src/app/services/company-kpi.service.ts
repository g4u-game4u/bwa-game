import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import { map, catchError, shareReplay, take } from 'rxjs/operators';
import { KPIData } from '@model/gamification-dashboard.model';
import { environment } from '../../environments/environment';
import {
  buildGamificacaoLookupKeyForParticipacaoRow,
  extractGamificacaoEmpIdFromDeliveryKey
} from './gamificacao-delivery-empid.util';

/** Linha de participação Game4U para cruzar com a API gamificação (EmpID via `delivery_id` quando existir). */
export interface ParticipacaoRowGamificacaoInput {
  participationKey: string;
  deliveryId?: string;
  /** Título da entrega (ex. lista via `/game/reports/finished/deliveries`) para casar com nome/empresa no GET gamificação. */
  deliveryTitle?: string;
}

/**
 * Linha da API de gamificação (hook).
 * Percentual: `porcEntregas` / `percEntregas` (string BR ou número) → `number` em `entrega`.
 * Carteira: cruzamento principal `companies.id` (Supabase) === `EmpID` da API; depois `emp_id` colunar, depois CNPJ.
 */
export interface GamificacaoEmpresaRow {
  CNPJ?: string;
  cnpj?: string;
  EmpID?: string | number;
  empId?: string | number;
  empid?: string | number;
  porcEntregas?: string | number;
  PorcEntregas?: string | number;
  percEntregas?: string | number;
  PercEntregas?: string | number;
  procFinalizados?: string | number;
  procPendentes?: string | number;
  regime?: string;
  data_criacao?: string;
  data_processamento?: string;
  [key: string]: unknown;
}

/**
 * KPI normalizado por empresa (compatível com o antigo cnpj__c)
 */
export interface CnpjKpiData {
  _id: string;
  /** Só definido quando a API envia percentual (`porcEntregas` / `percEntregas`, etc.). */
  entrega?: number;
  CNPJ?: string;
  'Classificação do Cliente'?: string;
  procFinalizados?: number;
  procPendentes?: number;
}

export interface CompanyDisplay {
  cnpj: string;
  cnpjId?: string;
  cnpjNumber?: string;
  name?: string;
  status?: string;
  actionCount: number;
  processCount: number;
  entrega?: number;
  /** Valor numérico vindo de `porcEntregas` / `percEntregas` na API gamificação (espelho de `entrega`). */
  porcEntregas?: number;
  classificacao?: string;
  deliveryKpi?: KPIData;
  /** Game4U participação: título da entrega (exibir no lugar do id da entrega). */
  delivery_title?: string;
  /** `extra.cnpj` na entrega / user-action — exibir ao lado do título quando há ambiguidade. */
  delivery_extra_cnpj?: string;
  /** Game4U: identificador da entrega na linha (EmpID/cruzamento gamificação); o modal não envia isto em `actions-by-delivery`. */
  deliveryId?: string;
  /** Lista via `GET /game/reports/finished/deliveries`: tarefas no modal vêm de `actions-by-delivery` (filtro por `delivery_title`). */
  loadTasksViaGameReports?: boolean;
  /** EmpID usado no mapa `byEmpId` da gamificação (ex.: extraído de `delivery_id` antes da competência). */
  gamificacaoEmpIdUsado?: string;
}

/** Linha da carteira vinda do Supabase para enriquecer com o GET da gamificação. */
export interface CarteiraSupabaseKpiRow {
  cnpj: string;
  /** PK `companies.id` — deve corresponder ao `EmpID` retornado pela API. */
  supabaseId?: number | null;
  /** Coluna opcional no banco (ex.: emp_id), se diferente do id. */
  empId?: string | null;
}

/** Snapshot normalizado do GET gamificação (índices para cruzar com carteira / participação). */
export interface GamificacaoMaps {
  byEmpId: Map<string, CnpjKpiData>;
  byCnpjNorm: Map<string, CnpjKpiData>;
  /** Nome/empresa normalizado (API) → KPI; usado quando só há `delivery_title` na participação. */
  byTitleNorm: Map<string, CnpjKpiData>;
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * KPI por empresa: lista única da API BWA gamificação (x-api-token),
 * com lookup por EmpID ou CNPJ normalizado.
 */
@Injectable({
  providedIn: 'root'
})
export class CompanyKpiService {
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private gamificacaoSnapshotCache: CacheEntry<GamificacaoMaps> | null = null;

  constructor(private http: HttpClient) {}

  extractCnpjId(cnpjString: string): string | null {
    if (!cnpjString || typeof cnpjString !== 'string') {
      return null;
    }

    const match = cnpjString.match(/\[([^\|]+)\|/);
    return match ? match[1].trim() : null;
  }

  /**
   * KPIs para os EmpIDs solicitados (filtrados do snapshot em cache).
   */
  getKpiData(cnpjIds: string[]): Observable<Map<string, CnpjKpiData>> {
    if (!cnpjIds || cnpjIds.length === 0) {
      return of(new Map());
    }

    return this.getGamificacaoMaps$().pipe(
      map(({ byEmpId, byCnpjNorm }) => {
        const result = new Map<string, CnpjKpiData>();
        for (const rawId of cnpjIds) {
          if (rawId == null || rawId === '') {
            continue;
          }
          const id = String(rawId).trim();
          const row = this.resolveKpiFromMaps(id, byEmpId, byCnpjNorm);
          if (row) {
            result.set(id, row);
          }
        }
        return result;
      })
    );
  }

  /**
   * Carteira Supabase costuma trazer CNPJ só com 14 dígitos; a API traz mascarado.
   * Participação / Funifier costuma trazer EmpID curto. Tentamos os dois.
   */
  /** Só `byEmpId` (literal + zeros à esquerda) — usado na participação Game4U antes de tentar CNPJ. */
  private resolveKpiByEmpIdOnly(key: string, byEmpId: Map<string, CnpjKpiData>): CnpjKpiData | undefined {
    const t = String(key || '').trim();
    if (!t) {
      return undefined;
    }
    let h = byEmpId.get(t);
    if (h) {
      return h;
    }
    if (/^\d+$/.test(t)) {
      const stripped = t.replace(/^0+/, '') || '0';
      h = byEmpId.get(stripped);
      if (h) {
        return h;
      }
    }
    return undefined;
  }

  /**
   * Participação Game4U: prioriza EmpID (chave numérica ou extraída de `delivery_id` com competência),
   * e só tenta CNPJ quando a chave tem pelo menos 11 dígitos (evita tratar `delivery_id` como CNPJ).
   */
  private resolveKpiForParticipacaoRowKey(
    rowKey: string,
    byEmpId: Map<string, CnpjKpiData>,
    byCnpjNorm: Map<string, CnpjKpiData>
  ): { kpi: CnpjKpiData | undefined; gamificacaoEmpIdUsado?: string } {
    const trimmed = String(rowKey || '').trim();
    if (!trimmed) {
      return { kpi: undefined };
    }

    let kpi = this.resolveKpiByEmpIdOnly(trimmed, byEmpId);
    if (kpi) {
      const empLabel = /^\d+$/.test(trimmed) ? trimmed.replace(/^0+/, '') || trimmed : trimmed;
      return { kpi, gamificacaoEmpIdUsado: empLabel };
    }

    const fromDelivery = extractGamificacaoEmpIdFromDeliveryKey(trimmed);
    if (fromDelivery) {
      kpi = this.resolveKpiByEmpIdOnly(fromDelivery, byEmpId);
      if (kpi) {
        return { kpi, gamificacaoEmpIdUsado: fromDelivery };
      }
    }

    const norm = this.normalizeCnpjKey(trimmed);
    if (norm.length >= 11) {
      for (const cand of this.cnpjNormCandidates(trimmed)) {
        const hit = byCnpjNorm.get(cand);
        if (hit) {
          return { kpi: hit };
        }
      }
    }

    return { kpi: undefined };
  }

  private resolveKpiFromMaps(
    key: string,
    byEmpId: Map<string, CnpjKpiData>,
    byCnpjNorm: Map<string, CnpjKpiData>
  ): CnpjKpiData | undefined {
    const trimmed = String(key || '').trim();
    if (!trimmed) {
      return undefined;
    }
    const byEmp = byEmpId.get(trimmed);
    if (byEmp) {
      return byEmp;
    }
    if (/^\d+$/.test(trimmed)) {
      const stripped = trimmed.replace(/^0+/, '') || '0';
      if (stripped !== trimmed) {
        const h = byEmpId.get(stripped);
        if (h) {
          return h;
        }
      }
    }
    const fromDelivery = extractGamificacaoEmpIdFromDeliveryKey(trimmed);
    if (fromDelivery) {
      const viaEmp = this.resolveKpiFromMaps(fromDelivery, byEmpId, byCnpjNorm);
      if (viaEmp) {
        return viaEmp;
      }
    }
    for (const cand of this.cnpjNormCandidates(trimmed)) {
      const hit = byCnpjNorm.get(cand);
      if (hit) {
        return hit;
      }
    }
    return undefined;
  }

  /**
   * Lista do action_log (modal carteira): EmpID entre colchetes, CNPJ mascarado no texto, ou só dígitos.
   */
  private resolveKpiForActionLogCompany(
    company: { cnpj: string; cnpjId: string | null },
    maps: GamificacaoMaps
  ): CnpjKpiData | undefined {
    if (company.cnpjId) {
      const h = this.resolveKpiFromMaps(company.cnpjId, maps.byEmpId, maps.byCnpjNorm);
      if (h) {
        return h;
      }
    }
    const emb = company.cnpj.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0];
    if (emb) {
      const h = this.resolveKpiFromMaps(emb, maps.byEmpId, maps.byCnpjNorm);
      if (h) {
        return h;
      }
    }
    const digits = this.normalizeCnpjKey(company.cnpj);
    if (digits.length >= 8) {
      return this.resolveKpiFromMaps(digits, maps.byEmpId, maps.byCnpjNorm);
    }
    return undefined;
  }

  /** Variações comuns no Supabase (14 dígitos ou menos com zeros à esquerda omitidos). */
  private cnpjNormCandidates(key: string): string[] {
    const norm = this.normalizeCnpjKey(key);
    if (!norm.length) {
      return [];
    }
    const out = new Set<string>();
    if (norm.length === 14) {
      out.add(norm);
    }
    if (norm.length >= 8 && norm.length <= 13) {
      out.add(norm.padStart(14, '0'));
    }
    if (norm.length > 14) {
      out.add(norm.slice(-14));
    }
    return [...out];
  }

  /** Apenas dígitos, para cruzar CNPJ formatado com a API */
  private normalizeCnpjKey(cnpj: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  /**
   * Chave estável para casar `delivery_title` da participação com nome vindo no GET gamificação.
   */
  private normalizeTitleMatchKey(title: string): string {
    const t = String(title || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  /** Nome exibível na linha da API (varia por payload do hook). */
  private pickCompanyDisplayNameForGamificacaoRow(row: GamificacaoEmpresaRow): string {
    const r = row as Record<string, unknown>;
    const cands: unknown[] = [
      r['empresa'],
      r['Empresa'],
      r['nome'],
      r['Nome'],
      r['razao'],
      r['razaoSocial'],
      r['RazaoSocial'],
      r['Cliente'],
      r['cliente'],
      r['delivery_title'],
      r['DeliveryTitle'],
      r['titulo'],
      r['Titulo'],
      r['descricao'],
      r['Descricao']
    ];
    for (const v of cands) {
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
    return '';
  }

  /**
   * Converte porcentagem BR ("94,81") para número.
   */
  parsePorcEntregas(value: string | number | undefined | null): number {
    if (value == null || value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    const t = String(value).trim();
    if (!t) {
      return 0;
    }
    const normalized = t.includes(',')
      ? t.replace(/\./g, '').replace(',', '.')
      : t;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  private pickEmpId(row: GamificacaoEmpresaRow): string {
    const v =
      row.EmpID ?? row.empId ?? row.empid ?? (row as Record<string, unknown>)['EmpId'];
    if (v == null || v === '') {
      return '';
    }
    return String(v).trim();
  }

  private pickCnpjRaw(row: GamificacaoEmpresaRow): string {
    const r = row as Record<string, unknown>;
    const v = row.CNPJ ?? row.cnpj ?? r['CNPJPrincipal'] ?? r['cnpjPrincipal'];
    if (v == null || v === '') {
      return '';
    }
    return String(v).trim();
  }

  /** Percentual de entregas no prazo (`porcEntregas` ou `percEntregas`, string BR ou número). */
  private pickPorcEntregas(row: GamificacaoEmpresaRow): string | number | undefined {
    const r = row as Record<string, unknown>;
    const v =
      row.porcEntregas ??
      row.PorcEntregas ??
      row.percEntregas ??
      row.PercEntregas ??
      r['perc_entregas'] ??
      r['porc_entregas'];
    return v as string | number | undefined;
  }

  private rowToCnpjKpiData(row: GamificacaoEmpresaRow): CnpjKpiData {
    const empid = this.pickEmpId(row);
    const cnpjRaw = this.pickCnpjRaw(row);
    const procFin = parseInt(String(row.procFinalizados ?? ''), 10);
    const procPen = parseInt(String(row.procPendentes ?? ''), 10);
    const rawPorc = this.pickPorcEntregas(row);
    const hasPorc =
      rawPorc !== undefined &&
      rawPorc !== null &&
      !(typeof rawPorc === 'string' && rawPorc.trim() === '');
    const out: CnpjKpiData = {
      _id: empid || this.normalizeCnpjKey(cnpjRaw) || 'unknown',
      CNPJ: cnpjRaw || undefined,
      'Classificação do Cliente': row.regime,
      procFinalizados: Number.isFinite(procFin) ? procFin : 0,
      procPendentes: Number.isFinite(procPen) ? procPen : 0
    };
    if (hasPorc) {
      out.entrega = this.parsePorcEntregas(rawPorc);
    }
    return out;
  }

  private buildGamificacaoMaps(rows: GamificacaoEmpresaRow[]): GamificacaoMaps {
    const byEmpId = new Map<string, CnpjKpiData>();
    const byCnpjNorm = new Map<string, CnpjKpiData>();
    const byTitleNorm = new Map<string, CnpjKpiData>();

    for (const row of rows) {
      if (!row) {
        continue;
      }
      const kpi = this.rowToCnpjKpiData(row);
      const empid = this.pickEmpId(row);
      const cnpjRaw = this.pickCnpjRaw(row);
      if (empid) {
        byEmpId.set(empid, kpi);
        if (/^\d+$/.test(empid)) {
          const stripped = empid.replace(/^0+/, '') || '0';
          if (stripped !== empid) {
            byEmpId.set(stripped, kpi);
          }
        }
      }
      for (const cand of this.cnpjNormCandidates(cnpjRaw)) {
        byCnpjNorm.set(cand, kpi);
      }
      const displayName = this.pickCompanyDisplayNameForGamificacaoRow(row);
      if (displayName) {
        const tk = this.normalizeTitleMatchKey(displayName);
        if (tk && !byTitleNorm.has(tk)) {
          byTitleNorm.set(tk, kpi);
        }
      }
    }

    return { byEmpId, byCnpjNorm, byTitleNorm };
  }

  private extractGamificacaoRows(body: unknown): GamificacaoEmpresaRow[] {
    if (Array.isArray(body)) {
      return body as GamificacaoEmpresaRow[];
    }
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      for (const k of ['data', 'result', 'items', 'empresas', 'rows']) {
        const v = o[k];
        if (Array.isArray(v)) {
          return v as GamificacaoEmpresaRow[];
        }
      }
    }
    return [];
  }

  private getGamificacaoMaps$(): Observable<GamificacaoMaps> {
    const url = environment.gamificacaoApiUrl?.trim();
    const token = environment.gamificacaoApiToken?.trim();

    if (!url || !token) {
      console.warn('📊 Gamificação: defina gamificacaoApiUrl e gamificacaoApiToken (x-api-token).');
      return of({ byEmpId: new Map(), byCnpjNorm: new Map(), byTitleNorm: new Map() });
    }

    const now = Date.now();
    if (
      this.gamificacaoSnapshotCache &&
      now - this.gamificacaoSnapshotCache.timestamp < this.CACHE_DURATION
    ) {
      return this.gamificacaoSnapshotCache.data;
    }

    const headers = new HttpHeaders({ 'x-api-token': token });
    const request$ = this.http.get<unknown>(url, { headers }).pipe(
      map(body => this.buildGamificacaoMaps(this.extractGamificacaoRows(body))),
      catchError(err => {
        console.error('📊 Erro na API gamificação (empresas):', err);
        return of({ byEmpId: new Map(), byCnpjNorm: new Map(), byTitleNorm: new Map() });
      }),
      /** `refCount: false` mantém o último valor após unsubscribe — evita cancelar o GET após `take(1)` no prefetch. */
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.gamificacaoSnapshotCache = { data: request$, timestamp: now };
    return request$;
  }

  /**
   * Aguarda o GET a `GAMIFICACAO_API_URL` e o mapa EmpID/CNPJ → KPI (usa cache TTL se ainda válido).
   */
  async fetchGamificacaoMapsAsync(): Promise<GamificacaoMaps> {
    return firstValueFrom(this.getGamificacaoMaps$().pipe(take(1)));
  }

  /**
   * Cruza linhas da carteira com um snapshot já carregado: 1) `supabaseId` ↔ `EmpID`, 2) `empId`, 3) CNPJ.
   */
  enrichCarteiraRowsWithMaps(rows: CarteiraSupabaseKpiRow[], maps: GamificacaoMaps): CompanyDisplay[] {
    const { byEmpId, byCnpjNorm } = maps;
    return rows.map(({ cnpj, supabaseId, empId }) => {
      const cnpjKey = String(cnpj || '').trim();
      const empKey = empId != null ? String(empId).trim() : '';
      const idKey =
        supabaseId != null && Number.isFinite(Number(supabaseId))
          ? String(Math.trunc(Number(supabaseId)))
          : '';

      let kpiData: CnpjKpiData | undefined;
      if (idKey) {
        kpiData = this.resolveKpiFromMaps(idKey, byEmpId, byCnpjNorm);
      }
      if (!kpiData && empKey) {
        kpiData = this.resolveKpiFromMaps(empKey, byEmpId, byCnpjNorm);
      }
      if (!kpiData) {
        kpiData = this.resolveKpiFromMaps(cnpjKey, byEmpId, byCnpjNorm);
      }

      const procFin = kpiData?.procFinalizados ?? 0;
      const procPen = kpiData?.procPendentes ?? 0;

      const result: CompanyDisplay = {
        cnpj: cnpjKey,
        cnpjId: cnpjKey,
        actionCount: 0,
        processCount: procFin + procPen
      };

      this.applyKpiDataToCompanyDisplay(result, kpiData);
      return result;
    });
  }

  /**
   * Carteira Supabase: GET gamificação (cache) e cruza 1) `supabaseId` ↔ `EmpID`, 2) coluna `empId`, 3) CNPJ.
   */
  enrichCarteiraFromSupabase(rows: CarteiraSupabaseKpiRow[]): Observable<CompanyDisplay[]> {
    if (!rows || rows.length === 0) {
      return of([]);
    }

    return this.getGamificacaoMaps$().pipe(
      map(maps => this.enrichCarteiraRowsWithMaps(rows, maps)),
      catchError(error => {
        console.error('📊 Error enriching carteira from Supabase:', error);
        return of(
          rows.map(
            r =>
              ({
                cnpj: String(r.cnpj || '').trim(),
                cnpjId: String(r.cnpj || '').trim(),
                actionCount: 0,
                processCount: 0
              }) as CompanyDisplay
          )
        );
      })
    );
  }

  enrichFromCnpjResp(empids: string[]): Observable<CompanyDisplay[]> {
    if (!empids || empids.length === 0) {
      return of([]);
    }

    return this.getGamificacaoMaps$().pipe(
      map(({ byEmpId, byCnpjNorm }) =>
        empids.map(empid => {
          const key = String(empid).trim();
          const kpiData = this.resolveKpiFromMaps(key, byEmpId, byCnpjNorm);

          if (!kpiData) {
            console.warn('📊 enrichFromCnpjResp: NO KPI for', empid);
          }

          const procFin = kpiData?.procFinalizados ?? 0;
          const procPen = kpiData?.procPendentes ?? 0;

          const result: CompanyDisplay = {
            cnpj: empid,
            cnpjId: empid,
            actionCount: 0,
            processCount: procFin + procPen
          };

          this.applyKpiDataToCompanyDisplay(result, kpiData);
          return result;
        })
      ),
      catchError(error => {
        console.error('📊 Error enriching cnpj_resp with KPIs:', error);
        return of(
          empids.map(
            empid =>
              ({
                cnpj: empid,
                cnpjId: empid,
                actionCount: 0,
                processCount: 0
              }) as CompanyDisplay
          )
        );
      })
    );
  }

  /**
   * Lista “Clientes atendidos” (participação Game4U): cruza com gamificação por **EmpID** extraído de
   * `delivery_id` quando existir (competência `…-YYYY-MM-DD` ou primeiro segmento numérico antes do hífen);
   * senão usa a chave de participação. CNPJ só se a chave de lookup tiver ≥11 dígitos.
   * O percentual vem do campo `porcEntregas` da API (normalizado em `entrega` / `porcEntregas` / `deliveryKpi`).
   */
  enrichFromParticipacaoRowKeys(
    rows: readonly (ParticipacaoRowGamificacaoInput | string)[]
  ): Observable<CompanyDisplay[]> {
    if (!rows || rows.length === 0) {
      return of([]);
    }

    const normalized: ParticipacaoRowGamificacaoInput[] = rows.map(r =>
      typeof r === 'string'
        ? { participationKey: String(r).trim(), deliveryId: undefined, deliveryTitle: undefined }
        : {
            participationKey: String(r.participationKey || '').trim(),
            deliveryId: r.deliveryId?.trim(),
            deliveryTitle: r.deliveryTitle?.trim()
          }
    );

    return this.getGamificacaoMaps$().pipe(
      map(({ byEmpId, byCnpjNorm, byTitleNorm }) =>
        normalized.map(({ participationKey, deliveryId, deliveryTitle }) => {
          const lookupKey = buildGamificacaoLookupKeyForParticipacaoRow(
            participationKey,
            deliveryId
          );
          let { kpi: kpiData, gamificacaoEmpIdUsado } = this.resolveKpiForParticipacaoRowKey(
            lookupKey,
            byEmpId,
            byCnpjNorm
          );

          if (!kpiData && deliveryTitle && byTitleNorm.size > 0) {
            const tk = this.normalizeTitleMatchKey(deliveryTitle);
            if (tk) {
              const hit = byTitleNorm.get(tk);
              if (hit) {
                kpiData = hit;
              }
            }
          }

          if (!kpiData) {
            console.warn('📊 enrichFromParticipacaoRowKeys: sem KPI', {
              participationKey,
              deliveryId: deliveryId || null,
              deliveryTitle: deliveryTitle || null,
              lookupKeyGamificacao: lookupKey
            });
          }

          const procFin = kpiData?.procFinalizados ?? 0;
          const procPen = kpiData?.procPendentes ?? 0;

          const result: CompanyDisplay = {
            cnpj: participationKey,
            cnpjId: participationKey,
            actionCount: 0,
            processCount: procFin + procPen,
            ...(gamificacaoEmpIdUsado ? { gamificacaoEmpIdUsado } : {})
          };

          this.applyKpiDataToCompanyDisplay(result, kpiData);
          return result;
        })
      ),
      catchError(error => {
        console.error('📊 Erro enrichFromParticipacaoRowKeys:', error);
        return of(
          normalized.map(
            ({ participationKey }) =>
              ({
                cnpj: participationKey,
                cnpjId: participationKey,
                actionCount: 0,
                processCount: 0
              }) as CompanyDisplay
          )
        );
      })
    );
  }

  enrichCompaniesWithKpis(
    companies: {
      cnpj: string;
      actionCount: number;
      processCount?: number;
      delivery_title?: string;
      deliveryId?: string;
    }[]
  ): Observable<CompanyDisplay[]> {
    if (!companies || companies.length === 0) {
      return of([]);
    }

    const companiesWithIds = companies.map(company => ({
      ...company,
      cnpjId: this.extractCnpjId(company.cnpj)
    }));

    return this.getGamificacaoMaps$().pipe(
      map(maps => {
        return companiesWithIds.map(company => {
          const result: CompanyDisplay = {
            cnpj: company.cnpj,
            cnpjId: company.cnpjId || undefined,
            actionCount: company.actionCount,
            processCount: company.processCount || 0,
            delivery_title: company.delivery_title?.trim() || undefined,
            ...(company.deliveryId?.trim() ? { deliveryId: company.deliveryId.trim() } : {})
          };

          const kpiData = this.resolveKpiForActionLogCompany(company, maps);
          this.applyKpiDataToCompanyDisplay(result, kpiData);

          return result;
        });
      }),
      catchError(error => {
        console.error('📊 Error enriching companies with KPIs:', error);
        return of(
          companiesWithIds.map(c => ({
            cnpj: c.cnpj,
            cnpjId: c.cnpjId || undefined,
            actionCount: c.actionCount,
            processCount: c.processCount || 0,
            delivery_title: c.delivery_title?.trim() || undefined,
            ...(c.deliveryId?.trim() ? { deliveryId: c.deliveryId.trim() } : {})
          }))
        );
      })
    );
  }

  /** Preenche `classificacao` / `entrega` / `porcEntregas` / `deliveryKpi` quando a linha da API existe e há `porcEntregas`. */
  private applyKpiDataToCompanyDisplay(
    result: CompanyDisplay,
    kpiData: CnpjKpiData | undefined
  ): void {
    if (!kpiData) {
      return;
    }
    result.classificacao = kpiData['Classificação do Cliente'];
    const cnpjRaw = kpiData.CNPJ?.trim();
    if (cnpjRaw) {
      const d = cnpjRaw.replace(/\D/g, '');
      if (d.length === 14) {
        result.cnpjNumber = d;
      }
    }
    const e = kpiData.entrega;
    if (e !== undefined && e !== null && Number.isFinite(Number(e))) {
      const n = Number(e);
      result.entrega = n;
      result.porcEntregas = n;
      result.deliveryKpi = this.mapToKpiData(n);
    }
  }

  private mapToKpiData(current: number): KPIData {
    const target = 90;
    const percentage = Math.max(0, Math.min((current / target) * 100, 100));

    return {
      id: 'delivery',
      label: 'Entregas no Prazo',
      current,
      target,
      unit: '%',
      percentage,
      color: this.getKpiColor(current, target)
    };
  }

  private getKpiColor(current: number, target: number): 'red' | 'yellow' | 'green' {
    if (target === 0) {
      return 'red';
    }

    if (current < target) {
      return 'red';
    }

    const percentage = (current / target) * 100;

    if (percentage >= 80) {
      return 'green';
    }
    if (percentage >= 50) {
      return 'yellow';
    }

    return 'red';
  }

  clearCache(): void {
    this.gamificacaoSnapshotCache = null;
  }

  /**
   * Dispara o GET do snapshot (cache ~10 min) sem depender de CNPJs na carteira/participação.
   * Esses fluxos fazem `of([])` quando a lista vem vazia e não chamavam `enrichFromCnpjResp`, então o Network não mostrava a API.
   */
  prefetchGamificacaoSnapshot(): void {
    const url = environment.gamificacaoApiUrl?.trim();
    const token = environment.gamificacaoApiToken?.trim();
    if (!url || !token) {
      return;
    }
    this.getGamificacaoMaps$()
      .pipe(take(1))
      .subscribe({ error: () => void 0 });
  }
}
