import { envStr } from './loadEnv';

const DEFAULT_BATCH = 200;

export type FunifierPlayerRow = {
  email: string;
  /** From player_status.extra (name, full_name, etc.) when present. */
  funifierName?: string;
};

function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u.endsWith('/')) {
    u += '/';
  }
  return u;
}

function pickNameFromExtra(extra: unknown): string | undefined {
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const e = extra as Record<string, unknown>;
  const candidates = [e.name, e.full_name, e.displayName, e.nome, e.fullName];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') {
      return String(c).trim();
    }
  }
  return undefined;
}

/**
 * Paginates Funifier `player_status` aggregate (same pattern as team-management-dashboard).
 * Uses Basic auth on `/database/*` (token is base64(apiKey:secret), header `Basic <token>`).
 */
export async function fetchFunifierPlayers(
  options: { batchSize?: number; maxPlayers?: number; requiredEmails?: Set<string> } = {}
): Promise<FunifierPlayerRow[]> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const maxPlayers = options.maxPlayers;
  const required = options.requiredEmails;

  const baseUrl = normalizeBaseUrl(
    envStr('FUNIFIER_BASE_URL', 'funifier_base_url') ||
      'https://service2.funifier.com/v3/'
  );
  const basicToken = envStr('FUNIFIER_BASIC_TOKEN', 'funifier_basic_token');
  if (!basicToken) {
    throw new Error('Missing FUNIFIER_BASIC_TOKEN (or funifier_basic_token) in .env');
  }

  const hardCap = parseInt(envStr('FUNIFIER_FETCH_CAP', 'funifier_fetch_cap') || '50000', 10);

  const endpoint =
    envStr('FUNIFIER_PLAYER_AGGREGATE_PATH', 'funifier_player_aggregate_path') ||
    'database/player_status/aggregate?strict=true';
  const aggregatePayload: unknown[] = [{ $project: { _id: 1, extra: 1 } }];

  const players = new Map<string, { funifierName?: string }>();
  let startIndex = 0;
  let hasMore = true;

  const haveAllRequired = (): boolean => {
    if (!required || required.size === 0) {
      return false;
    }
    for (const e of required) {
      if (!players.has(e)) {
        return false;
      }
    }
    return true;
  };

  while (hasMore) {
    if (maxPlayers != null && players.size >= maxPlayers) {
      break;
    }
    if (players.size >= hardCap) {
      console.warn('FUNIFIER_FETCH_CAP reached:', hardCap);
      break;
    }
    const rangeHeader = `items=${startIndex}-${startIndex + batchSize}`;
    const url = `${baseUrl}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicToken}`,
        Range: rangeHeader
      },
      body: JSON.stringify(aggregatePayload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Funifier aggregate failed ${res.status}: ${text.slice(0, 500)}`);
    }

    const raw = (await res.json()) as unknown;
    const errObj = raw as { errorMessage?: string; errorCode?: string };
    if (errObj && typeof errObj === 'object' && errObj.errorMessage) {
      throw new Error(
        `Funifier aggregate error: ${errObj.errorCode ?? ''} ${errObj.errorMessage} (endpoint ${endpoint})`
      );
    }
    let batch: unknown[];
    if (Array.isArray(raw)) {
      batch = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as { result?: unknown[] }).result)) {
      batch = (raw as { result: unknown[] }).result;
    } else {
      batch = [];
    }
    if (envStr('MIGRATION_DEBUG', 'migration_debug') === '1' && startIndex === 0) {
      console.warn('[migration] Funifier first batch length:', batch.length);
      if (batch[0]) {
        console.warn('[migration] sample keys:', Object.keys(batch[0] as object));
      } else if (raw && typeof raw === 'object') {
        console.warn('[migration] raw top-level keys:', Object.keys(raw as object));
      }
    }
    if (!batch.length) {
      hasMore = false;
      break;
    }

    for (const row of batch) {
      if (maxPlayers != null && players.size >= maxPlayers) {
        break;
      }
      const doc = row as { _id?: string; extra?: { email?: string } };
      const id = doc._id != null ? String(doc._id).trim() : '';
      const extraEmail =
        doc.extra && doc.extra.email != null ? String(doc.extra.email).trim().toLowerCase() : '';
      const primary = (extraEmail || id).toLowerCase();
      if (!primary.includes('@')) {
        continue;
      }
      const fn = pickNameFromExtra(doc.extra);
      const prev = players.get(primary);
      if (!prev) {
        players.set(primary, { funifierName: fn });
      } else if (fn && !prev.funifierName) {
        players.set(primary, { funifierName: fn });
      }
    }

    if (required && haveAllRequired()) {
      hasMore = false;
      break;
    }

    if (batch.length < batchSize) {
      hasMore = false;
    } else {
      startIndex += batchSize;
    }
  }

  return [...players.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, v]) => ({ email, funifierName: v.funifierName }));
}

/** @deprecated Prefer fetchFunifierPlayers — returns emails only. */
export async function fetchFunifierPlayerEmails(
  options: { batchSize?: number; maxPlayers?: number; requiredEmails?: Set<string> } = {}
): Promise<string[]> {
  const rows = await fetchFunifierPlayers(options);
  return rows.map(r => r.email);
}
