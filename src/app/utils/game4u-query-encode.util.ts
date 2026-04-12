/**
 * Monta query string para endpoints Game4U sem codificar `:` (datas ISO) nem `@` (e-mail),
 * como esperado por vários gateways — evita `%3A` e `%40` em `start`, `end` e `user`.
 * Outros caracteres continuam passando por `encodeURIComponent`.
 */
export function encodeGame4uQueryValue(paramName: string, value: string): string {
  let s = encodeURIComponent(value);
  if (paramName === 'start' || paramName === 'end') {
    s = s.replace(/%3A/gi, ':');
  }
  if (paramName === 'user') {
    s = s.replace(/%40/g, '@');
  }
  return s;
}

export function buildGame4uQueryString(
  params: Record<string, string | string[] | undefined | null>
): string {
  const parts: string[] = [];
  for (const [k, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) {
      continue;
    }
    const keyEnc = encodeURIComponent(k);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item === undefined || item === null || String(item) === '') {
          continue;
        }
        parts.push(`${keyEnc}=${encodeGame4uQueryValue(k, String(item))}`);
      }
    } else if (String(raw) !== '') {
      parts.push(`${keyEnc}=${encodeGame4uQueryValue(k, String(raw))}`);
    }
  }
  return parts.join('&');
}
