/**
 * Interpreta o fragmento da URL (sem `#`), ex.: `access_token=eyJ...&foo=bar`.
 * Usa apenas o primeiro `=` em cada trecho para suportar JWT com `=` no padding.
 */
export function parseFragmentParams(fragment: string): Record<string, string> {
  const raw = (fragment || '').replace(/^#/, '').trim();
  if (!raw) {
    return {};
  }
  const params: Record<string, string> = {};
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    params[key] = value;
  }
  return params;
}
