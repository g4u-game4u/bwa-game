import { jwtDecode } from 'jwt-decode';

/**
 * Primeiro identificador Game4U que não parece e-mail (UUID / id interno).
 * O GET `/auth/user` pode trazer `id` em `data`, `user`, `data.user`, ou só no JWT (`sub`).
 */
export function pickFirstNonEmailStringId(...candidates: unknown[]): string | null {
  for (const v of candidates) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0 && !s.includes('@')) {
      return s;
    }
  }
  return null;
}

function extractFromJwt(accessToken?: string | null): string | null {
  if (!accessToken || typeof accessToken !== 'string') {
    return null;
  }
  try {
    const claims = jwtDecode<Record<string, unknown>>(accessToken);
    return pickFirstNonEmailStringId(
      claims['sub'],
      claims['user_id'],
      claims['userId'],
      claims['id']
    );
  } catch {
    return null;
  }
}

/**
 * Resolve o UUID / id de utilizador Game4U a partir do objeto de perfil (após ou antes de normalização na sessão)
 * e, em último caso, a partir do access token JWT.
 */
export function extractGame4uUserIdFromUserPayload(
  user: unknown,
  accessToken?: string | null
): string | null {
  if (!user || typeof user !== 'object') {
    return extractFromJwt(accessToken);
  }
  const u = user as Record<string, unknown>;
  const d =
    u['data'] && typeof u['data'] === 'object' && !Array.isArray(u['data'])
      ? (u['data'] as Record<string, unknown>)
      : undefined;
  const topUser =
    u['user'] && typeof u['user'] === 'object' && !Array.isArray(u['user'])
      ? (u['user'] as Record<string, unknown>)
      : undefined;
  const dataUser =
    d?.['user'] && typeof d['user'] === 'object' && !Array.isArray(d['user'])
      ? (d['user'] as Record<string, unknown>)
      : undefined;

  const hit = pickFirstNonEmailStringId(
    u['id'],
    u['user_id'],
    u['userId'],
    topUser?.['id'],
    topUser?.['user_id'],
    d?.['id'],
    d?.['user_id'],
    dataUser?.['id'],
    dataUser?.['user_id'],
    u['_id']
  );
  if (hit) {
    return hit;
  }
  return extractFromJwt(accessToken);
}
