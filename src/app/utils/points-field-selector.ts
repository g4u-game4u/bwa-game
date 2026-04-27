import { UserProfile } from './user-profile';

function num(v: unknown): number {
  if (v === undefined || v === null || v === '') {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Points field used in dashboards: SUPERVISOR reads `pontos_supervisor`, others read `points`.
 */
export function getPointsForProfile(profile: UserProfile, pc: Record<string, unknown>): number {
  if (profile === UserProfile.SUPERVISOR) {
    return num(pc['pontos_supervisor']);
  }
  return num(pc['points']);
}

/**
 * Coins are always read from `coins` regardless of profile.
 */
export function getCoinsForProfile(_profile: UserProfile, pc: Record<string, unknown>): number {
  return num(pc['coins']);
}
