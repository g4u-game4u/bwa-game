/**
 * Base da API Game4U (ex.: https://g4u-api-bwa.onrender.com/api).
 * Prioridade: G4U_API_BASE → BACKEND_URL_BASE (e variantes em minúsculas).
 */
export const DEFAULT_BACKEND_URL_BASE = 'https://g4u-api-bwa.onrender.com/api';

/** Evita embutir `.env` de desenvolvimento (`http://localhost`) em bundles prod/homol. */
export function isLoopbackBackendUrl(url: string): boolean {
  const s = (url || '').trim();
  if (!s) {
    return false;
  }
  try {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withScheme);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(s);
  }
}

export type ReadBackendUrlOptions = {
  /**
   * Em `environment.prod` / `homol`: se a URL resolvida for localhost/127.0.0.1
   * (ex.: vinda de `.env` no PC do build), usa {@link DEFAULT_BACKEND_URL_BASE}.
   */
  rejectLoopback?: boolean;
};

export function readBackendUrlBaseFromProcessEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  options?: ReadBackendUrlOptions
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
  let resolved =
    raw.length > 0 ? raw.replace(/\/+$/, '') : DEFAULT_BACKEND_URL_BASE.replace(/\/+$/, '');

  if (options?.rejectLoopback && isLoopbackBackendUrl(resolved)) {
    return DEFAULT_BACKEND_URL_BASE.replace(/\/+$/, '');
  }
  return resolved;
}

export function joinApiPath(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
