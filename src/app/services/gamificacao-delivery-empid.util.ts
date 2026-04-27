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
