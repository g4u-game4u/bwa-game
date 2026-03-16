/**
 * Pure utility for selecting the correct points field based on user profile.
 *
 * Extracted from DashboardSupervisorComponent.loadSupervisorInfoCard()
 * so the core invariant can be property-tested without Angular dependencies.
 *
 * SUPERVISOR reads `pontos_supervisor` for points, all other profiles read `points`.
 * Coins always come from the `coins` field regardless of profile.
 */

import { UserProfile } from './user-profile';

/**
 * Selects the correct points value based on the user's profile.
 *
 * - SUPERVISOR: reads from `pontos_supervisor` field
 * - All other profiles (JOGADOR, GESTOR, DIRETOR, SUPERVISOR_TECNICO): reads from `points` field
 * - Returns 0 if the field is missing, NaN, or falsy
 */
export function getPointsForProfile(
  profile: UserProfile,
  pointCategories: Record<string, any>
): number {
  if (profile === UserProfile.SUPERVISOR) {
    return Number(pointCategories['pontos_supervisor']) || 0;
  }
  return Number(pointCategories['points']) || 0;
}

/**
 * Selects the coins value from point categories.
 * Coins always come from the `coins` field regardless of profile.
 *
 * @returns The coins value, or 0 if missing/invalid
 */
export function getCoinsForProfile(
  _profile: UserProfile,
  pointCategories: Record<string, any>
): number {
  return Number(pointCategories['coins']) || 0;
}
