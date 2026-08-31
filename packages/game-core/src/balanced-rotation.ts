import { MatchFormat, getMatchShape } from '@zzjl/contracts';
import {
  generateFreeRotation as generateLegacyRotation,
  recommendRotationRounds,
  type GenerateRotationInput,
  type RotationHistoryMatch,
  type RotationMatchSeed,
  type RotationSchedule,
} from './rotation';

export type { GenerateRotationInput, RotationHistoryMatch, RotationMatchSeed, RotationSchedule } from './rotation';
export { recommendRotationRounds } from './rotation';

/**
 * 单打专用的联合搜索入口。
 *
 * 旧算法先挑选上场者再为已选人员配对，四人一场地时容易形成 AB / CD 两组交替，
 * 即使场内配对器会避免重复，也没有机会选择跨组对手。本实现对 12 人以内的小规模
 * 单打同时枚举“谁上场”和“如何配对”，统一比较上场次数、连续体力与重复对手成本。
 * 双打和更大规模单打仍复用经过测试的确定性算法，避免组合数量指数增长。
 */
export function generateBalancedFreeRotation(input: GenerateRotationInput): RotationSchedule {
  if (input.format !== MatchFormat.Singles || input.participantIds.length > 12) return generateLegacyRotation(input);

  const participantIds = [...input.participantIds];
  if (new Set(participantIds).size !== participantIds.length) throw new Error('Participant ids must be unique');
  const shape = getMatchShape(input.format);
  if (participantIds.length < shape.playersPerMatch) throw new Error('SINGLES requires at least 2 participants');
  if (!Number.isInteger(input.courtCount) || input.courtCount < 1) throw new Error('Court count must be a positive integer');
  const recommendedRounds = recommendRotationRounds(participantIds.length);
  const rounds = input.rounds ?? recommendedRounds;
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 20) throw new Error('Rounds must be an integer between 0 and 20');

  const history = [...(input.history ?? [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const playCounts = new Map(participantIds.map((id) => [id, 0]));
  const lastPlayedRound = new Map(participantIds.map((id) => [id, 0]));
  const streakCounts = new Map(participantIds.map((id) => [id, 0]));
  const opponentCounts = new Map<string, number>();
  registerHistory(history, participantIds, playCounts, lastPlayedRound, streakCounts, opponentCounts);

  const effectiveCourts = Math.min(input.courtCount, Math.floor(participantIds.length / 2));
  const playerCount = effectiveCourts * 2;
  const firstRound = input.startRound ?? ((history.length ? Math.max(...history.map((match) => match.roundNumber)) : 0) + 1);
  const matches: RotationMatchSeed[] = [];

  for (let offset = 0; offset < rounds; offset += 1) {
    const roundNumber = firstRound + offset;
    const mustRest = new Set(participantIds.filter((id) => value(lastPlayedRound, id) === roundNumber - 1 && value(streakCounts, id) >= 2));
    const restedPool = participantIds.filter((id) => !mustRest.has(id));
    const pool = restedPool.length >= playerCount ? restedPool : participantIds;
    let best: { pairs: Array<[string, string]>; cost: number } | undefined;

    for (const selected of combinations(pool, playerCount)) {
      for (const pairs of enumeratePairings(selected)) {
        const playCost = selected.reduce((sum, id) => sum + value(playCounts, id), 0) * 1_000_000;
        const streakCost = selected.reduce((sum, id) => sum + value(streakCounts, id), 0) * 30_000;
        const restCost = selected.reduce((sum, id) => sum + value(lastPlayedRound, id), 0) * 100;
        const opponentCost = pairs.reduce((sum, [a, b]) => sum + pairCount(opponentCounts, a, b), 0) * 150_000;
        const signature = pairs.map(([a, b]) => pairKey(a, b)).sort().join('|');
        const cost = playCost + streakCost + restCost + opponentCost + tieCost(signature, roundNumber);
        if (!best || cost < best.cost) best = { pairs, cost };
      }
    }
    if (!best) throw new Error('Unable to generate singles round');

    const played = new Set<string>();
    best.pairs.forEach(([a, b], index) => {
      matches.push({ roundNumber, courtNumber: index + 1, teamAPlayerIds: [a], teamBPlayerIds: [b] });
      playCounts.set(a, value(playCounts, a) + 1); playCounts.set(b, value(playCounts, b) + 1);
      incrementPair(opponentCounts, a, b); played.add(a); played.add(b);
    });
    updateStreaks(participantIds, played, roundNumber, lastPlayedRound, streakCounts);
  }

  return { recommendedRounds, rounds, matches };
}

function registerHistory(
  history: readonly RotationHistoryMatch[], participantIds: readonly string[], playCounts: Map<string, number>,
  lastPlayedRound: Map<string, number>, streakCounts: Map<string, number>, opponentCounts: Map<string, number>,
): void {
  const byRound = new Map<number, RotationHistoryMatch[]>();
  for (const match of history) byRound.set(match.roundNumber, [...(byRound.get(match.roundNumber) ?? []), match]);
  for (const roundNumber of [...byRound.keys()].sort((a, b) => a - b)) {
    const played = new Set<string>();
    for (const match of byRound.get(roundNumber) ?? []) {
      const a = match.teamAPlayerIds[0]; const b = match.teamBPlayerIds[0];
      if (!a || !b) continue;
      if (playCounts.has(a)) playCounts.set(a, value(playCounts, a) + 1);
      if (playCounts.has(b)) playCounts.set(b, value(playCounts, b) + 1);
      incrementPair(opponentCounts, a, b); played.add(a); played.add(b);
    }
    updateStreaks(participantIds, played, roundNumber, lastPlayedRound, streakCounts);
  }
}

function combinations(ids: readonly string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (ids.length < size) return [];
  const result: string[][] = [];
  for (let index = 0; index <= ids.length - size; index += 1) {
    const head = ids[index]; if (!head) continue;
    for (const tail of combinations(ids.slice(index + 1), size - 1)) result.push([head, ...tail]);
  }
  return result;
}

function enumeratePairings(ids: readonly string[]): Array<Array<[string, string]>> {
  if (ids.length === 0) return [[]];
  const first = ids[0]; if (!first) return [[]];
  const result: Array<Array<[string, string]>> = [];
  for (let index = 1; index < ids.length; index += 1) {
    const partner = ids[index]; if (!partner) continue;
    const remaining = ids.filter((_, itemIndex) => itemIndex !== 0 && itemIndex !== index);
    for (const tail of enumeratePairings(remaining)) result.push([[first, partner], ...tail]);
  }
  return result;
}

function updateStreaks(ids: readonly string[], played: ReadonlySet<string>, roundNumber: number, lastPlayedRound: Map<string, number>, streakCounts: Map<string, number>): void {
  for (const id of ids) {
    if (!played.has(id)) { streakCounts.set(id, 0); continue; }
    streakCounts.set(id, value(lastPlayedRound, id) === roundNumber - 1 ? value(streakCounts, id) + 1 : 1);
    lastPlayedRound.set(id, roundNumber);
  }
}
function incrementPair(target: Map<string, number>, a: string, b: string): void { const key = pairKey(a, b); target.set(key, (target.get(key) ?? 0) + 1); }
function pairCount(target: ReadonlyMap<string, number>, a: string, b: string): number { return target.get(pairKey(a, b)) ?? 0; }
function pairKey(a: string, b: string): string { return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; }
function value(target: ReadonlyMap<string, number>, key: string): number { return target.get(key) ?? 0; }
function tieCost(text: string, salt: number): number { return hash(`${salt}:${text}`) % 997; }
function hash(text: string): number { let result = 2166136261; for (let index = 0; index < text.length; index += 1) { result ^= text.charCodeAt(index); result = Math.imul(result, 16777619); } return result >>> 0; }
