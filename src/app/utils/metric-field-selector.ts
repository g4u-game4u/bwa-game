import { UserProfile } from './user-profile';

export interface MetricFields {
  cnpj: number;
  entrega: number;
}

function num(v: unknown): number {
  if (v === undefined || v === null || v === '') {
    return 0;
  }
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolves CNPJ / entrega metric fields from `extra` based on ACL profile.
 * SUPERVISOR uses *_sup fields; other profiles use the regular fields.
 */
export function getMetricFieldsForProfile(
  profile: UserProfile,
  extra: Record<string, unknown>
): MetricFields {
  if (profile === UserProfile.SUPERVISOR) {
    return {
      cnpj: num(extra['cnpj_sup']),
      entrega: num(extra['entrega_sup'])
    };
  }
  return {
    cnpj: num(extra['cnpj']),
    entrega: num(extra['entrega'])
  };
}
