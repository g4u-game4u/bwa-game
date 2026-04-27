/**
 * Base da API Game4U (ex.: https://example.com/api).
 * Prioridade: G4U_API_BASE → BACKEND_URL_BASE (e variantes em minúsculas).
 * Lê via `const env = process.env` para o DefinePlugin substituir `process.env` pelo objeto literal no bundle.
 */
export function readBackendUrlBaseFromProcessEnv(): string {
  const env = process.env as Record<string, string | undefined>;
  const raw = (
    env['G4U_API_BASE'] ??
    env['g4u_api_base'] ??
    env['BACKEND_URL_BASE'] ??
    env['backend_url_base'] ??
    ''
  )
    .toString()
    .trim();
  if (raw.length === 0) {
    return '';
  }
  return raw.replace(/\/+$/, '');
}

export function joinApiPath(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
