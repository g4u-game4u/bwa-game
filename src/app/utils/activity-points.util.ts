export type PointsLookupResult =
  | { found: true; points: number; matchedKey: string }
  | { found: false; points: null; matchedKey: null };

function normalizeKey(input: string): string {
  return String(input ?? '')
    .replace(/^\uFEFF/, '') // BOM
    .replace(/^\*\s+/, '') // leading "* "
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Pontuação oficial das atividades (fonte: action-template-pontos.md).
 *
 * Regras de matching:
 * - Normaliza espaços, remove "* " inicial, case-insensitive.
 * - Aceita match pelo nome completo e também pelo trecho após "Tag:" (quando existir).
 * - Quando o nome tem múltiplas variações separadas por "/", cada variação também vira chave.
 */
const RAW_POINTS_TABLE: Array<{ name: string; points: number }> = [
  { name: '[Exemplo] Relatório de entregas semanais', points: 36 },
  { name: 'Distribuição nas carteiras', points: 0 },
  { name: 'Contato Inicial (CS)', points: 18 },
  { name: 'Ag. Docs Iniciais (CS)', points: 24 },
  { name: 'Ag. CNIS', points: 144 },
  { name: 'Análise do CS', points: 108 },
  { name: 'Validar formatos dos documentos iniciais para ser aceito pelo INSS', points: 18 },
  { name: 'Sobe os documentos para o Drive compartilhado', points: 18 },
  { name: 'Em análise (Jur) - Análise de viabilidade / Pré-análise - Tag: Pré Análise', points: 54 },
  { name: '* Análise Inicial - Tag: Análise Inicial', points: 240 },
  { name: 'Comunicar Análise (CS)', points: 240 },
  { name: 'Ag. Docs Adicionais (CS)', points: 72 },
  { name: 'Pendente Docs RPPS (CS)', points: 48 },
  { name: 'Pendente Contribuições (CS)', points: 48 },
  { name: 'Validar formatos dos documentos adicionais para ser aceito pelo INSS', points: 126 },
  { name: 'Análise adc docs / Análise pós docs - Tag: Análise docs', points: 90 },
  { name: 'Follow-up (Opt)', points: 18 },
  { name: 'Comunicação Adicional (CS)', points: 144 },
  { name: 'Ag. Aceite (CS)', points: 36 },
  { name: 'Protocolo / Novo pedido (confeccionar requerimento, protocolar e confirmar protocolo) - Tag: Protocolo', points: 36 },
  { name: 'Entrar no processo (confeccionar requerimento, se cadastrar como procurador e juntar docs ao processo) - Tag: Cadastrar procurador', points: 24 },
  { name: 'Agendar protocolo (confeccionar requerimento e agendar na Isa) - Tag: Agendar Protocolo', points: 30 },
  { name: 'Verificar protocolo - Tag: Verificar Protocolo', points: 6 },
  { name: 'Juntada de documentos - Tag: Juntar Docs', points: 6 },
  { name: 'Comunicar Protocolo (CS)', points: 18 },
  { name: 'Contato proativo para monitoramento (Opt)', points: 48 },
  { name: 'Marcar guichê virtual - Tag: Marcar Guichê Virtual', points: 6 },
  { name: 'Guichê virtual - Tag: Guichê Virtual', points: 36 },
  { name: 'FalaBR - Tag: Fala BR', points: 6 },
  { name: 'Acompanhar FalaBR - Tag: Acomp Fala BR', points: 3 },
  { name: 'Analisar exigência - Tag: Analisar Exigência', points: 120 },
  { name: 'Comunicar Exigência (CS)', points: 72 },
  { name: 'Ag. Docs Exigência (CS)', points: 36 },
  { name: 'Cumprir exigência - Tag: Cumprir Exigência', points: 54 },
  { name: 'Alerta prazo da exigência', points: 0 },
  { name: 'Analisar concessão - Tag: Analisar Concessão', points: 48 },
  { name: 'Comunicar Concessão (CS)', points: 48 },
  { name: 'Check List Revisão (CS)', points: 36 },
  { name: 'Comunicar Laudo (CS)', points: 144 },
  { name: 'Analisar indeferimento - Tag: Analisar indeferimento', points: 144 },
  { name: 'Docs Iniciais Orientação 1º pagamento', points: 126 },
  { name: 'Negociação Pagto', points: 96 },
  { name: 'Gerar Boletos', points: 126 },
  { name: 'Gerar Link', points: 54 },
  { name: 'Passagem de Bastão Consignado', points: 54 },
  { name: 'Acompanhamento de liquidação', points: 162 },
  { name: 'Cobrança', points: 162 },
  { name: 'Reversão', points: 0 },
  { name: 'Atualizar cadastro - Tag: Atualizar Cadastro', points: 6 },
  { name: 'Emitir de CTC - Tag: Emissão CTC', points: 315 },
  { name: 'Revisão de CTC - Tag: Revisão CTC', points: 315 },
  { name: 'Pedir cancelamento de CTC - Tag: Cancelamento CTC', points: 315 },
  { name: 'Ligar 135 - Tag: Ligar 135', points: 18 },
  { name: 'Cálculo de complementação / contribuição - Tag: Cálculo Complementação / Cálculo Contribuição', points: 108 },
  { name: 'Emitir guia de complementação / contribuição - Tag: Emitir Guia Compl / Emitir Guia Contrib', points: 18 },
  { name: 'Repasse de casos fila - Tag: Repasse Fila', points: 132 },
  { name: 'Repasse de casos em andamento - Tag: Repasse Andamento', points: 33 },
  { name: 'Ligação de vídeo / Ligação de voz / Atendimento cliente - Tag: Call Cliente', points: 126 },
  { name: 'Laudo de revisão', points: 405 },
  { name: 'Protocolar revisão', points: 252 },
  { name: 'Exigência revisão', points: 72 },
  { name: 'Cumprir exigência revisão', points: 54 },
  { name: 'Análise docs revisão', points: 108 },
  { name: 'Análise concessão revisão', points: 162 },
  { name: 'Análise indeferimento revisão', points: 216 },
  { name: 'Análise hiscre revisão', points: 252 },
  { name: 'Mandado de segurança', points: 450 },
  { name: 'Manifestação judicial', points: 252 },
  { name: 'Verificar andamento do processo', points: 0 }
];

const POINTS_BY_KEY = new Map<string, { points: number; matchedKey: string }>();

function addKey(key: string, points: number, matchedKey: string): void {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  if (!POINTS_BY_KEY.has(normalized)) {
    POINTS_BY_KEY.set(normalized, { points, matchedKey });
  }
}

for (const row of RAW_POINTS_TABLE) {
  const fullName = row.name;
  const points = Number(row.points) || 0;

  // Full string key
  addKey(fullName, points, fullName);

  // Split on "/" to support alternative names present in the same row
  const slashParts = fullName.split('/').map(p => p.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    for (const part of slashParts) {
      addKey(part, points, fullName);
    }
  }

  // If row contains "Tag:", also allow matching by tag value
  const tagMatch = fullName.match(/tag:\s*([^-\n\r]+)$/i);
  if (tagMatch && tagMatch[1]) {
    const tagValue = tagMatch[1].trim();
    if (tagValue) {
      addKey(tagValue, points, fullName);
      addKey(`Tag: ${tagValue}`, points, fullName);
    }
  }
}

export function lookupActivityPoints(title: string | undefined | null): PointsLookupResult {
  const normalized = normalizeKey(title || '');
  if (!normalized) {
    return { found: false, points: null, matchedKey: null };
  }

  const hit = POINTS_BY_KEY.get(normalized);
  if (hit) {
    return { found: true, points: hit.points, matchedKey: hit.matchedKey };
  }

  return { found: false, points: null, matchedKey: null };
}

