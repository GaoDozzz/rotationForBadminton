import { getMatchShape } from '@zzjl/contracts';
import { validateFinalScore } from './scoring';
import type { ConfirmedMatch, RankingEntry } from './types';

type MutableStats = Omit<RankingEntry, 'rank'>;

/**
 * 从当前所有有效完赛记录重新聚合排名。
 *
 * 该函数刻意不接收“上一版排名”做增量加减。组织者修改历史比分时，增量方案
 * 很容易漏掉旧比分的反向冲销，最终让排行榜与比赛明细不一致。首版单场规模
 * 很小，完整重算成本可控，并且天然支持改单、比赛作废和赛程版本切换。
 */
export function calculateRankings(
  participantIds: readonly string[],
  matches: readonly ConfirmedMatch[],
): RankingEntry[] {
  const stats = new Map<string, MutableStats>();

  for (const participantId of participantIds) {
    if (stats.has(participantId)) {
      throw new Error(`Duplicate participant id: ${participantId}`);
    }
    stats.set(participantId, emptyStats(participantId));
  }

  for (const match of matches) {
    applyMatch(stats, match);
  }

  const sorted = [...stats.values()].sort(compareStats);
  let previous: MutableStats | undefined;
  let previousRank = 0;

  return sorted.map((entry, index) => {
    /*
     * 采用竞赛排名法：1,2,2,4。只有当所有排序字段都相同时才并列，
     * 避免数组索引把并列球员错误显示成不同名次。
     */
    const rank = previous && compareStats(previous, entry) === 0 ? previousRank : index + 1;
    previous = entry;
    previousRank = rank;
    return { ...entry, rank };
  });
}

function applyMatch(stats: Map<string, MutableStats>, match: ConfirmedMatch): void {
  const shape = getMatchShape(match.format);
  assertTeam(match.id, 'A', match.teamAPlayerIds, shape.teamSize);
  assertTeam(match.id, 'B', match.teamBPlayerIds, shape.teamSize);

  const allPlayers = [...match.teamAPlayerIds, ...match.teamBPlayerIds];
  if (new Set(allPlayers).size !== allPlayers.length) {
    throw new Error(`Match ${match.id} contains duplicated participants`);
  }

  const validation =
    match.resultType === 'WALKOVER'
      ? validateWalkoverScore(match.teamAScore, match.teamBScore)
      : validateFinalScore(match.teamAScore, match.teamBScore, match.scoreRule);

  if (!validation.valid) {
    throw new Error(`Invalid score in match ${match.id}: ${validation.message}`);
  }

  const difference = Math.abs(match.teamAScore - match.teamBScore);
  const teamAWon = match.teamAScore > match.teamBScore;

  applyTeam(stats, match.teamAPlayerIds, {
    scored: match.teamAScore,
    conceded: match.teamBScore,
    points: teamAWon ? difference : -difference,
    won: teamAWon,
  });
  applyTeam(stats, match.teamBPlayerIds, {
    scored: match.teamBScore,
    conceded: match.teamAScore,
    points: teamAWon ? -difference : difference,
    won: !teamAWon,
  });
}

function applyTeam(
  stats: Map<string, MutableStats>,
  playerIds: readonly string[],
  result: { scored: number; conceded: number; points: number; won: boolean },
): void {
  for (const playerId of playerIds) {
    const entry = stats.get(playerId);
    if (!entry) {
      throw new Error(`Match references unknown participant: ${playerId}`);
    }
    entry.points += result.points;
    entry.scored += result.scored;
    entry.conceded += result.conceded;
    entry.matchesPlayed += 1;
    entry.wins += result.won ? 1 : 0;
    entry.losses += result.won ? 0 : 1;
  }
}

function assertTeam(matchId: string, side: 'A' | 'B', ids: string[], expected: number): void {
  if (ids.length !== expected) {
    throw new Error(`Match ${matchId} team ${side} must contain ${expected} player(s)`);
  }
}

function validateWalkoverScore(
  teamAScore: number,
  teamBScore: number,
): ReturnType<typeof validateFinalScore> {
  if (
    !Number.isInteger(teamAScore) ||
    !Number.isInteger(teamBScore) ||
    teamAScore < 0 ||
    teamBScore < 0 ||
    teamAScore === teamBScore
  ) {
    return { valid: false, code: 'WALKOVER_SCORE_INVALID', message: '弃权比分必须是非负且不相等的整数' };
  }
  return {
    valid: true,
    winner: teamAScore > teamBScore ? 'A' : 'B',
    pointDifference: Math.abs(teamAScore - teamBScore),
  };
}

function emptyStats(participantId: string): MutableStats {
  return {
    participantId,
    points: 0,
    wins: 0,
    losses: 0,
    scored: 0,
    conceded: 0,
    matchesPlayed: 0,
  };
}

function compareStats(a: MutableStats, b: MutableStats): number {
  return (
    b.points - a.points ||
    b.wins - a.wins ||
    b.scored - a.scored ||
    a.conceded - b.conceded
  );
}

