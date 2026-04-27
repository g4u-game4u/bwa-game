/**
 * Deduplicates players that appear on multiple supervisor teams while preserving
 * which team IDs (and names) each player belongs to.
 */

export interface TeamMember {
  _id: string;
  name: string;
}

export interface TeamMemberGroup {
  teamId: string;
  teamName: string;
  members: TeamMember[];
}

export interface DeduplicatedPlayer {
  playerId: string;
  teamIds: string[];
  /** Team names aligned index-wise with {@link teamIds}. */
  teams: string[];
}

function isValidPlayerId(id: string): boolean {
  return Boolean(id && id !== 'null' && id !== 'undefined');
}

/**
 * Collapses team membership lists so each player appears once, with merged team ids.
 * Team order follows first encounter while iterating `groups` in order.
 */
export function deduplicatePlayers(groups: TeamMemberGroup[]): DeduplicatedPlayer[] {
  const byPlayer = new Map<
    string,
    { teamOrder: { id: string; name: string }[] }
  >();

  for (const g of groups) {
    for (const m of g.members) {
      const id = String(m._id);
      if (!isValidPlayerId(id)) {
        continue;
      }

      let entry = byPlayer.get(id);
      if (!entry) {
        entry = { teamOrder: [] };
        byPlayer.set(id, entry);
      }

      if (!entry.teamOrder.some(t => t.id === g.teamId)) {
        entry.teamOrder.push({ id: g.teamId, name: g.teamName });
      }
    }
  }

  return Array.from(byPlayer.entries()).map(([playerId, { teamOrder }]) => ({
    playerId,
    teamIds: teamOrder.map(t => t.id),
    teams: teamOrder.map(t => t.name)
  }));
}
