import { jwtDecode } from 'jwt-decode';

/** Contrato GET `/game/actions?user=`: o backend valida que `user` é um e-mail. */
export function looksLikeEmail(s: string): boolean {
  const t = String(s || '').trim();
  return t.includes('@') && !/\s/.test(t);
}

/**
 * E-mail do utilizador autenticado para query params `user=` (perfil e, em fallback, JWT).
 */
export function extractEmailFromAccessToken(accessToken?: string | null): string {
  if (!accessToken || typeof accessToken !== 'string') {
    return '';
  }
  try {
    const claims = jwtDecode<Record<string, unknown>>(accessToken);
    for (const k of ['email', 'preferred_username', 'unique_name', 'upn']) {
      const v = claims[k];
      if (typeof v === 'string' && looksLikeEmail(v)) {
        return v.trim();
      }
    }
  } catch {
    /* token inválido ou não-JWT */
  }
  return '';
}

/**
 * E-mail a usar em `/game/actions` para o utilizador da sessão (nunca UUID em `_id`).
 */
export function pickSessionEmailForGameApi(user: unknown, accessToken?: string | null): string {
  if (user && typeof user === 'object') {
    const u = user as Record<string, unknown>;
    for (const k of ['email', 'username', 'login']) {
      const v = u[k];
      if (typeof v === 'string' && looksLikeEmail(v)) {
        return v.trim();
      }
    }
    const id = u['_id'];
    if (typeof id === 'string' && looksLikeEmail(id)) {
      return id.trim();
    }
  }
  return extractEmailFromAccessToken(accessToken);
}

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

/**
 * Id do time (Game4U) a partir do perfil `/auth/user` para GET `/game/team-actions?team=`.
 */
export function pickTeamIdFromUserProfile(user: unknown): string | null {
  if (!user || typeof user !== 'object') {
    return null;
  }
  const u = user as Record<string, unknown>;
  for (const k of ['team_id', 'teamId', 'default_team_id', 'primary_team_id']) {
    const v = u[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  const extra = u['extra'];
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    const ex = extra as Record<string, unknown>;
    for (const k of ['team_id', 'teamId']) {
      const v = ex[k];
      if (v != null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
  }
  const teams = u['teams'];
  if (!Array.isArray(teams) || teams.length === 0) {
    return null;
  }
  for (const entry of teams) {
    if (entry == null) {
      continue;
    }
    if (typeof entry === 'string' || typeof entry === 'number') {
      const s = String(entry).trim();
      if (s) {
        return s;
      }
    }
    if (typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      const id = o['_id'] ?? o['id'] ?? o['team_id'];
      if (id != null && String(id).trim() !== '') {
        return String(id).trim();
      }
    }
  }
  return null;
}

/**
 * Nome amigável para `team_id` numérico Game4U quando o perfil não traz `team_name`.
 * Evita inferir o time só a partir de `team_name` em `/game/actions` (ex.: CS no deal).
 */
export const GAME4U_KNOWN_TEAM_ID_LABELS: Readonly<Record<string, string>> = {
  '6': 'Financeiro'
};

export function displayNameForGame4uTeamId(teamId: unknown): string {
  if (teamId == null) {
    return '';
  }
  const key = String(teamId).trim();
  return key ? GAME4U_KNOWN_TEAM_ID_LABELS[key] || '' : '';
}

/**
 * Nome do time para a sidebar do jogador: usa `team_name` no perfil ou em `extra`,
 * ou `team_name` / `name` no primeiro elemento de `teams`. Não mostra só o id numérico
 * (ex.: quando `teams` vem de `team_id` como `[ "4" ]` após GET `/auth/user`).
 */
export function resolveTeamDisplayNameForPlayerSidebar(
  teamsFirst: unknown,
  extra?: Record<string, unknown> | null,
  userTopLevel?: Record<string, unknown> | null
): string {
  const pick = (v: unknown): string =>
    typeof v === 'string' && v.trim() ? v.trim() : '';

  if (userTopLevel) {
    const fromUserTeamId = displayNameForGame4uTeamId(
      userTopLevel['team_id'] ?? userTopLevel['teamId']
    );
    if (fromUserTeamId) {
      return fromUserTeamId;
    }
    const direct = pick(userTopLevel['team_name']) || pick(userTopLevel['teamName']);
    if (direct) {
      return direct;
    }
    const team = userTopLevel['team'];
    if (team && typeof team === 'object') {
      const o = team as Record<string, unknown>;
      for (const k of ['team_name', 'name', 'display_name']) {
        const s = pick(o[k]);
        if (s) {
          return s;
        }
      }
    }
  }
  if (extra) {
    const fromExtraTeamId = displayNameForGame4uTeamId(extra['team_id'] ?? extra['teamId']);
    if (fromExtraTeamId) {
      return fromExtraTeamId;
    }
    const fromExtra = pick(extra['team_name']) || pick(extra['teamName']);
    if (fromExtra) {
      return fromExtra;
    }
  }

  if (teamsFirst != null && typeof teamsFirst === 'object') {
    const o = teamsFirst as Record<string, unknown>;
    const fromObjId = displayNameForGame4uTeamId(o['_id'] ?? o['id'] ?? o['team_id']);
    if (fromObjId) {
      return fromObjId;
    }
    for (const k of ['team_name', 'name', 'display_name', 'title']) {
      const s = pick(o[k]);
      if (s) {
        return s;
      }
    }
  }

  if (typeof teamsFirst === 'string' || typeof teamsFirst === 'number') {
    const s = String(teamsFirst).trim();
    const fromScalarId = displayNameForGame4uTeamId(s);
    if (fromScalarId) {
      return fromScalarId;
    }
    if (s && !/^\d+$/.test(s)) {
      return s;
    }
  }

  return '';
}
