/**
 * Base da API Game4U (ex.: https://g4u-api-bwa.onrender.com/api).
 * Prioridade: G4U_API_BASE → BACKEND_URL_BASE (e variantes em minúsculas).
 */
export const DEFAULT_BACKEND_URL_BASE = 'https://g4u-api-bwa.onrender.com/api';

export function readBackendUrlBaseFromProcessEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string {
  const raw = (
    env['G4U_API_BASE'] ??
    env['g4u_api_base'] ??
    env['BACKEND_URL_BASE'] ??
    env['backend_url_base'] ??
    ''
  )
    .toString()
    .trim();
  if (raw.length > 0) {
    return raw.replace(/\/+$/, '');
  }
  return DEFAULT_BACKEND_URL_BASE.replace(/\/+$/, '');
}

export function joinApiPath(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
