/**
 * Regras alinhadas a referencia-python/financeiro-meta-circular-progress-regra-de-negocio.md
 * e gear_painel_recebiveis.py (paridade de arredondamento e filtros).
 */

export interface OmieCaixaRecebimentoRaw {
  nValorDocumento?: unknown;
  nSaldo?: unknown;
  cDataInclusao?: unknown;
  cHoraInclusao?: unknown;
  cCodCategoria?: unknown;
  cDesCategoria?: unknown;
  [key: string]: unknown;
}

export interface OmiePainelItem {
  'valor do documento': number;
  saldo: number;
  'data inclusão': string;
  'hora da inclusão': string;
  categoria: { codigo: string; descricao: string };
}

export interface OmieProgressoMetaRecebimento {
  meta_recebimento: number;
  valor_acumulado_recebido: number;
  progresso_percentual: number;
  fracao_barra: number;
  excedeu_meta: boolean;
}

export interface OmiePainelProcessado {
  periodo_consulta?: { inicio?: string; fim?: string };
  filtro_categorias_codigos?: string[] | null;
  filtro_categorias_descricoes?: string[] | null;
  progresso_meta_recebimento: OmieProgressoMetaRecebimento;
  quantidade_itens: number;
  itens: OmiePainelItem[];
  aviso_dados?: string | null;
}

export interface ProcessarCaixaOptions {
  /** Meta numérica (ex.: PAINEL_META_RECEBIMENTO); <= 0 desativa barra como no Python */
  meta: number;
  /** Códigos separados por vírgula; vazio = não filtra por código */
  categoriasCodigosCsv?: string;
  /** Descrições exatas separadas por `;`; vazio = não filtra por descrição */
  categoriasDescSeparadasPorPontoEVirgula?: string;
}

function arred(x: number, casas: number): number {
  return Math.round(x * 10 ** casas) / 10 ** casas;
}

export function omieToNum(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normCode(c: unknown): string {
  return c != null ? String(c).trim() : '';
}

/** Une recebidos_itens ou, se vazio, amostra_recebidos (por conta). */
export function coletarItensExtrato(data: unknown): Array<{ raw: OmieCaixaRecebimentoRaw }> {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rc = (root['recebidos_caixa'] || {}) as Record<string, unknown>;
  const via = (rc['via_extrato_conta_corrente'] || {}) as Record<string, unknown>;
  const porConta = via['por_conta'];
  const out: Array<{ raw: OmieCaixaRecebimentoRaw }> = [];
  if (!Array.isArray(porConta)) {
    return out;
  }
  for (const bloco of porConta) {
    if (!bloco || typeof bloco !== 'object') {
      continue;
    }
    const b = bloco as Record<string, unknown>;
    let itens = b['recebidos_itens'];
    if (!Array.isArray(itens) || itens.length === 0) {
      itens = b['amostra_recebidos'] || [];
    }
    if (!Array.isArray(itens)) {
      continue;
    }
    for (const raw of itens) {
      if (raw && typeof raw === 'object') {
        out.push({ raw: raw as OmieCaixaRecebimentoRaw });
      }
    }
  }
  return out;
}

/** True se alguma conta usa só amostra sem recebidos_itens (subamostragem). */
export function detectarDadosSubamostrados(data: unknown): boolean {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rc = (root['recebidos_caixa'] || {}) as Record<string, unknown>;
  const via = (rc['via_extrato_conta_corrente'] || {}) as Record<string, unknown>;
  const porConta = via['por_conta'];
  if (!Array.isArray(porConta)) {
    return false;
  }
  for (const bloco of porConta) {
    if (!bloco || typeof bloco !== 'object') {
      continue;
    }
    const b = bloco as Record<string, unknown>;
    const full = b['recebidos_itens'];
    const sample = b['amostra_recebidos'];
    const hasFull = Array.isArray(full) && full.length > 0;
    const hasSample = Array.isArray(sample) && sample.length > 0;
    if (!hasFull && hasSample) {
      return true;
    }
  }
  return false;
}

export function parseCodigosPermitidos(csv: string | undefined): Set<string> | null {
  const s = (csv || '').trim();
  if (!s) {
    return null;
  }
  const set = new Set<string>();
  for (const part of s.split(',')) {
    const c = part.trim();
    if (c) {
      set.add(c);
    }
  }
  return set.size ? set : null;
}

/** Retorna Set casefold (JS: toLowerCase) dos trechos permitidos. */
export function parseDescricoesPermitidas(semicolonSep: string | undefined): {
  casefoldSet: Set<string>;
  literais: string[];
} | null {
  const s = (semicolonSep || '').trim();
  if (!s) {
    return null;
  }
  const literais = s.split(';').map(p => p.trim()).filter(Boolean);
  const casefoldSet = new Set(literais.map(p => p.toLowerCase()));
  return literais.length ? { casefoldSet, literais } : null;
}

export function aplicaFiltrosRecebiveis(
  wrapped: Array<{ raw: OmieCaixaRecebimentoRaw }>,
  codigosPermitidos: Set<string> | null,
  descricoesCasefold: Set<string> | null
): OmieCaixaRecebimentoRaw[] {
  const out: OmieCaixaRecebimentoRaw[] = [];
  for (const w of wrapped) {
    const raw = w.raw;
    const cod = normCode(raw.cCodCategoria);
    const desCf = String(raw.cDesCategoria ?? '')
      .trim()
      .toLowerCase();
    if (codigosPermitidos != null && !codigosPermitidos.has(cod)) {
      continue;
    }
    if (descricoesCasefold != null && !descricoesCasefold.has(desCf)) {
      continue;
    }
    out.push(raw);
  }
  return out;
}

export function montarItemPainel(raw: OmieCaixaRecebimentoRaw): OmiePainelItem {
  const cod = normCode(raw.cCodCategoria);
  const des = String(raw.cDesCategoria ?? '').trim();
  return {
    'valor do documento': arred(omieToNum(raw.nValorDocumento), 2),
    saldo: arred(omieToNum(raw.nSaldo), 2),
    'data inclusão': String(raw.cDataInclusao ?? '').trim(),
    'hora da inclusão': String(raw.cHoraInclusao ?? '').trim(),
    categoria: { codigo: cod, descricao: des }
  };
}

/**
 * Igual ao Python: fracao capada, progresso_percentual = round(fracao_barra * 100, 2).
 */
export function calcularProgressoMetaRecebimento(
  acumulado: number,
  meta: number
): OmieProgressoMetaRecebimento {
  const m = Number(meta);
  const a = omieToNum(acumulado);
  if (!(m > 0)) {
    return {
      meta_recebimento: arred(m, 2),
      valor_acumulado_recebido: arred(a, 2),
      progresso_percentual: 0,
      fracao_barra: 0,
      excedeu_meta: false
    };
  }
  const fracaoBruta = a / m;
  const fracao_barra = arred(Math.min(1, Math.max(0, fracaoBruta)), 6);
  const progresso_percentual = arred(fracao_barra * 100, 2);
  return {
    meta_recebimento: arred(m, 2),
    valor_acumulado_recebido: arred(a, 2),
    progresso_percentual,
    fracao_barra,
    excedeu_meta: a > m
  };
}

export function processarExportCaixaParaPainel(
  data: unknown,
  options: ProcessarCaixaOptions
): OmiePainelProcessado {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const periodo_consulta = root['periodo_consulta'] as OmiePainelProcessado['periodo_consulta'];

  const codigosFiltro = parseCodigosPermitidos(options.categoriasCodigosCsv);
  const descParsed = parseDescricoesPermitidas(options.categoriasDescSeparadasPorPontoEVirgula);

  const todos = coletarItensExtrato(data);
  const filtrados = aplicaFiltrosRecebiveis(
    todos,
    codigosFiltro,
    descParsed ? descParsed.casefoldSet : null
  );

  const itens = filtrados.map(montarItemPainel);
  const acumulado = filtrados.reduce((s, raw) => s + omieToNum(raw.nValorDocumento), 0);

  const subamostrado = detectarDadosSubamostrados(data);
  const aviso_dados = subamostrado
    ? 'Export sem recebidos_itens: apenas amostra_recebidos foi usada — regenere o caixa com fetch atualizado.'
    : null;

  const progresso_meta_recebimento = calcularProgressoMetaRecebimento(acumulado, options.meta);

  return {
    periodo_consulta,
    filtro_categorias_codigos: codigosFiltro ? [...codigosFiltro].sort() : null,
    filtro_categorias_descricoes: descParsed ? descParsed.literais : null,
    progresso_meta_recebimento,
    quantidade_itens: itens.length,
    itens,
    ...(aviso_dados ? { aviso_dados } : {})
  };
}

/** Modo A: JSON já processado (omie_painel_recebiveis.json). */
export function extrairValorAcumuladoDoPainelProcessado(data: unknown): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const p = (data as Record<string, unknown>)['progresso_meta_recebimento'];
  if (!p || typeof p !== 'object') {
    return null;
  }
  const v = (p as Record<string, unknown>)['valor_acumulado_recebido'];
  const n = omieToNum(v);
  return Number.isFinite(n) ? n : null;
}

export function isPainelProcessadoShape(data: unknown): data is OmiePainelProcessado {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const o = data as Record<string, unknown>;
  const prog = o['progresso_meta_recebimento'];
  if (!prog || typeof prog !== 'object') {
    return false;
  }
  const pr = prog as Record<string, unknown>;
  return (
    typeof pr['valor_acumulado_recebido'] === 'number' ||
    typeof pr['valor_acumulado_recebido'] === 'string'
  );
}
