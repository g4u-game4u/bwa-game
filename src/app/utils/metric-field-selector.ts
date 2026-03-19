/**
 * Pure utility for selecting the correct metric fields (cnpj, entrega) based on user profile.
 *
 * Extracted from DashboardSupervisorComponent.loadSupervisorInfoCard()
 * so the core invariant can be property-tested without Angular dependencies.
 *
 * SUPERVISOR reads `extra.cnpj_sup` and `extra.entrega_sup`.
 * All other profiles read `extra.cnpj` and `extra.entrega`.
 */

import { UserProfile } from './user-profile';

export interface MetricFields {
  cnpj: number;
  entrega: number;
}

/**
 * Selects the correct cnpj and entrega metric values based on the user's profile.
 *
 * - SUPERVISOR: reads from `cnpj_sup` and `entrega_sup` fields in extra
 * - All other profiles (JOGADOR, GESTOR, DIRETOR, SUPERVISOR_TECNICO): reads from `cnpj` and `entrega`
 * - Returns 0 for any missing, NaN, or falsy field
 */
export function getMetricFieldsForProfile(
  profile: UserProfile,
  extra: Record<string, any>
): MetricFields {
  if (profile === UserProfile.SUPERVISOR) {
    return {
      cnpj: extra['cnpj_sup'] ? parseFloat(extra['cnpj_sup']) || 0 : 0,
      entrega: extra['entrega_sup'] ? parseFloat(extra['entrega_sup']) || 0 : 0,
    };
  }
  return {
    cnpj: extra['cnpj'] ? parseFloat(extra['cnpj']) || 0 : 0,
    entrega: extra['entrega'] ? parseFloat(extra['entrega']) || 0 : 0,
  };
}

