/**
 * Pure utility for deduplicating players across multiple teams.
 *
 * Extracted from DashboardSupervisorComponent.deduplicateAndBuildCards()
 * so the core invariant can be property-tested without Angular dependencies.
 */

/** Minimal member shape needed for deduplication. */
export interface TeamMember {
  _id: string;
  name?: string;
  [key: string]: any;
}

/** Input: one team's worth of members. */
export interface TeamMemberGroup {
  teamId: string;
  teamName: string;
  members: TeamMember[];
}

/** Output: deduplicated player with all teams aggregated. */
export interface DeduplicatedPlayer {
  playerId: string;
  playerName: string;
  teams: string[];
  teamIds: string[];
}

/**
 * Deduplicates players across multiple teams.
 *
 * - Each player appears exactly once in the output (keyed by `_id`).
 * - A player's `teams` / `teamIds` arrays contain every team they appeared in.
 * - Members with falsy, "null", or "undefined" `_id` are skipped.
 * - Duplicate team entries for the same player are not added twice.
 * - Output is sorted alphabetically by playerName (pt-BR locale).
 */
export function deduplicatePlayers(groups: TeamMemberGroup[]): DeduplicatedPlayer[] {
  const playerMap = new Map<string, DeduplicatedPlayer>();

  for (const { teamId, teamName, members } of groups) {
    for (const member of members) {
      const memberId = String(member._id);
      if (!memberId || memberId === 'null' || memberId === 'undefined') continue;

      const existing = playerMap.get(memberId);
      if (existing) {
        if (!existing.teamIds.includes(teamId)) {
          existing.teamIds.push(teamId);
          existing.teams.push(teamName);
        }
      } else {
        playerMap.set(memberId, {
          playerId: memberId,
          playerName: member.name || memberId,
          teams: [teamName],
          teamIds: [teamId],
        });
      }
    }
  }

  return Array.from(playerMap.values()).sort((a, b) =>
    a.playerName.localeCompare(b.playerName, 'pt-BR')
  );
}
