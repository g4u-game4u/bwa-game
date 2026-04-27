export type ReadBackendUrlBaseOptions = {
  /**
   * Se true, devolve string vazia quando a base apontar para localhost / 127.0.0.1 / ::1
   * (evita builds prod/homol com API local por engano).
   */
  rejectLoopback?: boolean;
};

function isLoopbackBackendUrl(base: string): boolean {
  const b = base.trim().toLowerCase();
  if (!b) {
    return false;
  }
  if (/\blocalhost\b/.test(b) || /127\.0\.0\.1/.test(b) || /\[::1\]/.test(b) || /\b::1\b/.test(b)) {
    return true;
  }
  try {
    const forParse = /^https?:\/\//i.test(b) ? b : `https://${b}`;
    const h = new URL(forParse).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

/**
 * Base da API Game4U (ex.: https://example.com/api).
 * Prioridade: G4U_API_BASE → BACKEND_URL_BASE (e variantes em minúsculas).
 * Lê via `const env = process.env` para o DefinePlugin substituir `process.env` pelo objeto literal no bundle.
 */
export function readBackendUrlBaseFromProcessEnv(options?: ReadBackendUrlBaseOptions): string {
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
  const normalized = raw.replace(/\/+$/, '');
  if (options?.rejectLoopback && isLoopbackBackendUrl(normalized)) {
    return '';
  }
  return normalized;
}

export function joinApiPath(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
