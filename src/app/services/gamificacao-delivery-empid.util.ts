/**
 * EmpID para cruzar com a API de gamificação a partir de uma chave de linha de participação Game4U
 * quando ela é (ou termina como) `delivery_id` com competência `-YYYY-MM-DD` no fim — alinhado a
 * `parseCompetenceYearMonthFromDeliveryId` em `game4u-game-mapper.ts`.
 *
 * @example `2944-2026-04-01` → `"2944"`
 * @example `12-2944-2026-04-01` → `"2944"` (último segmento numérico antes da data)
 */
export function extractGamificacaoEmpIdFromDeliveryKey(key: string): string | null {
  const s = String(key || '').trim();
  if (!s) {
    return null;
  }
  const m = s.match(/^(.+)-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const y = Number(m[2]);
  const mo = Number(m[3]);
  const d = Number(m[4]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  const prefix = m[1];
  if (/^\d+$/.test(prefix)) {
    return prefix;
  }
  const parts = prefix.split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (p && /^\d+$/.test(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Primeiro segmento de `delivery_id` antes do primeiro hífen, se for só dígitos (EmpID quando não há sufixo `YYYY-MM-DD`).
 * Formatos com data de competência no fim devem usar antes `extractGamificacaoEmpIdFromDeliveryKey`.
 */
export function extractEmpIdPrefixFromDeliveryIdFirstSegment(deliveryId: string): string | null {
  const s = String(deliveryId || '').trim();
  if (!s) {
    return null;
  }
  const idx = s.indexOf('-');
  const head = (idx === -1 ? s : s.slice(0, idx)).trim();
  if (!head || !/^\d+$/.test(head)) {
    return null;
  }
  const stripped = head.replace(/^0+/, '') || '0';
  return stripped;
}

/**
 * Chave usada no mapa `byEmpId` da gamificação: prioriza EmpID extraído de `delivery_id` (competência ou primeiro segmento numérico);
 * senão usa a chave de participação (integration_id / client_id / etc.).
 */
export function buildGamificacaoLookupKeyForParticipacaoRow(
  participationKey: string,
  deliveryId?: string
): string {
  const pk = String(participationKey || '').trim();
  const did = String(deliveryId || '').trim();
  if (did) {
    const fromCompetence = extractGamificacaoEmpIdFromDeliveryKey(did);
    if (fromCompetence) {
      return fromCompetence;
    }
    const firstSeg = extractEmpIdPrefixFromDeliveryIdFirstSegment(did);
    if (firstSeg) {
      return firstSeg;
    }
  }
  return pk;
}
