import { environment } from '../../environments/environment';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function getMaintenanceAllowedEmails(): string[] {
  const raw = (environment as any)?.maintenanceAllowedEmailsJson;
  if (typeof raw !== 'string' || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' ? normalizeEmail(v) : ''))
      .filter((v) => v.length > 0);
  } catch {
    return [];
  }
}

/** `true` se existe allowlist ativa (pelo menos um e-mail configurado). */
export function isMaintenanceAllowlistActive(): boolean {
  return getMaintenanceAllowedEmails().length > 0;
}

/**
 * Define se o e-mail pode acessar o app.
 * - Com lista não vazia: só e-mails da lista (independe de maintenanceMode).
 * - Lista vazia + maintenanceMode: ninguém entra.
 * - Lista vazia + sem manutenção: todos entram.
 */
export function isLoginEmailAllowed(email: string | null | undefined): boolean {
  const allowed = getMaintenanceAllowedEmails();

  if (allowed.length > 0) {
    const normalized = normalizeEmail(email || '');
    return normalized.length > 0 && allowed.includes(normalized);
  }

  if (environment.maintenanceMode) {
    return false;
  }

  return true;
}

/** @deprecated use isLoginEmailAllowed */
export function isMaintenanceEmailAllowed(email: string | null | undefined): boolean {
  return isLoginEmailAllowed(email);
}
