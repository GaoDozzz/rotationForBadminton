import { MatchFormat, getMatchShape } from '@zzjl/contracts';

export interface RotationMatchSeed {
  roundNumber: number;
  courtNumber: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
}

export interface RotationHistoryMatch {
  roundNumber: number;
  teamAPlayerIds: readonly string[];
  teamBPlayerIds: readonly string[];
}

export interface GenerateRotationInput {
  participantIds: readonly string[];
  participantGenders?: Readonly<Record<string, 'MALE' | 'FEMALE'>>;
  format: MatchFormat;
  courtCount: number;
  rounds?: number;
  startRound?: number;
  history?: readonly RotationHistoryMatch[];
}

export interface RotationSchedule {
  recommendedRounds: number;
  rounds: number;
  matches: RotationMatchSeed[];
}

/** 首版自由转统一推荐 10 轮，组织者可在 1～20 轮之间调整。 */
export function recommendRotationRounds(participantCount: number): number {
  return Number.isInteger(participantCount) && participantCount >= 2 ? 10 : 1;
}

/**
 * 生成确定性的自由转赛程。
 *
 * 先按累计上场次数、连续上场次数和休息时长选择本轮人员；有足够替补时，
 * 已连续上场两轮的人员必须休息。单打在 12 人以内枚举本轮所有完整配对，
 * 从全局选择重复对手最少的一组，避免逐场贪心在四人局中反复落入同一拆分。
 * 更大规模使用同一成本函数的贪心降级，以控制 20 轮排阵时的计算量。
 *
 * history 只包含已经开始或完成的锁定场次。退出重排时，它同时延续个人上场、
 * 连续上场、搭档和对手记录；调用方通过 rounds 传入“剩余轮数”，不会补出额外轮次。
 */
export function generateFreeRotation(input: GenerateRotationInput): RotationSchedule {
  const participantIds = [...input.participantIds];
  if (new Set(participantIds).size !== participantIds.length) throw new Error('Participant ids must be unique');

  const shape = getMatchShape(input.format);
  if (participantIds.length < shape.playersPerMatch) throw new Error(`${input.format} requires at least ${shape.playersPerMatch} participants`);
  if (!Number.isInteger(input.courtCount) || input.courtCount < 1) throw new Error('Court count must be a positive integer');

  const recommendedRounds = recommendRotationRounds(participantIds.length);
  const rounds = input.rounds ?? recommendedRounds;
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 20) throw new Error('Rounds must be an integer between 0 and 20');

  const history = [...(input.history ?? [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const playCounts = new Map(participantIds.map((id) => [id, 0]));
  const lastPlayedRound = new Map(participantIds.map((id) => [id, 0]));
  const streakCounts = new Map(participantIds.map((id) => [id, 0]));
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const matchupCounts = new Map<string, number>();
  registerHistory(history, playCounts, lastPlayedRound, streakCounts, partnerCounts, opponentCounts, matchupCounts);

  const effectiveCourts = Math.min(input.courtCount, Math.floor(participantIds.length / shape.playersPerMatch));
  const playersPerRound = effectiveCourts * shape.playersPerMatch;
  const matches: RotationMatchSeed[] = [];
  const firstRound = input.startRound ?? ((history.length ? Math.max(...history.map((match) => match.roundNumber)) : 0) + 1);

  for (let offset = 0; offset < rounds; offset += 1) {
    const roundNumber = firstRound + offset;
    const active = selectActivePlayers(participantIds, playersPerRound, roundNumber, playCounts, lastPlayedRound, streakCounts);
    const roundMatches = input.format === MatchFormat.Singles
      ? assignSinglesRound(active, effectiveCourts, roundNumber, opponentCounts)
      : assignDoublesRound(active, effectiveCourts, roundNumber, partnerCounts, opponentCounts, matchupCounts);

    const playedThisRound = new Set<string>();
    for (const match of roundMatches) {
      matches.push(match);
      registerPairHistory(match, playCounts, partnerCounts, opponentCounts, matchupCounts);
      for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) playedThisRound.add(id);
    }
    updateStreaks(participantIds, playedThisRound, roundNumber, lastPlayedRound, streakCounts);
  }

  return { recommendedRounds, rounds, matches };
}

function selectActivePlayers(
  participantIds: readonly string[], playerCount: number, roundNumber: number,
  playCounts: ReadonlyMap<string, number>, lastPlayedRound: ReadonlyMap<string, number>, streakCounts: ReadonlyMap<string, number>,
): string[] {
  return [...participantIds].sort((a, b) => {
    const aMustRest = count(lastPlayedRound, a) === roundNumber - 1 && count(streakCounts, a) >= 2 ? 1 : 0;
    const bMustRest = count(lastPlayedRound, b) === roundNumber - 1 && count(streakCounts, b) >= 2 ? 1 : 0;
    return aMustRest - bMustRest
      || count(playCounts, a) - count(playCounts, b)
      || count(streakCounts, a) - count(streakCounts, b)
      || count(lastPlayedRound, a) - count(lastPlayedRound, b)
      || stableCompare(a, b, roundNumber);
  }).slice(0, playerCount);
}

function assignSinglesRound(active: readonly string[], courtCount: number, roundNumber: number, opponentCounts: ReadonlyMap<string, number>): RotationMatchSeed[] {
  if (active.length <= 12) {
    let bestPairs: Array<[string, string]> | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const pairs of enumeratePairings(active)) {
      const signature = pairs.map(([a, b]) => pairKey(a, b)).sort().join('|');
      const cost = pairs.reduce((sum, [a, b]) => sum + pairCount(opponentCounts, a, b) * 100_000, 0) + tieCost(signature, roundNumber);
      if (cost < bestCost) { bestCost = cost; bestPairs = pairs; }
    }
    if (!bestPairs) throw new Error('Unable to select singles players');
    return bestPairs.map(([a, b], index) => ({ roundNumber, courtNumber: index + 1, teamAPlayerIds: [a], teamBPlayerIds: [b] }));
  }

  const remaining = [...active];
  const result: RotationMatchSeed[] = [];
  for (let court = 1; court <= courtCount; court += 1) {
    let best: { a: string; b: string; cost: number } | undefined;
    for (let i = 0; i < remaining.length; i += 1) for (let j = i + 1; j < remaining.length; j += 1) {
      const a = remaining[i]; const b = remaining[j];
      if (!a || !b) continue;
      const cost = pairCount(opponentCounts, a, b) * 100_000 + tieCost(`${a}:${b}`, roundNumber);
      if (!best || cost < best.cost) best = { a, b, cost };
    }
    if (!best) throw new Error('Unable to select singles players');
    result.push({ roundNumber, courtNumber: court, teamAPlayerIds: [best.a], teamBPlayerIds: [best.b] });
    removeIds(remaining, [best.a, best.b]);
  }
  return result;
}

function enumeratePairings(ids: readonly string[]): Array<Array<[string, string]>> {
  if (ids.length === 0) return [[]];
  const first = ids[0];
  if (!first) return [[]];
  const result: Array<Array<[string, string]>> = [];
  for (let index = 1; index < ids.length; index += 1) {
    const partner = ids[index];
    if (!partner) continue;
    const remaining = ids.filter((_, itemIndex) => itemIndex !== 0 && itemIndex !== index);
    for (const tail of enumeratePairings(remaining)) result.push([[first, partner], ...tail]);
  }
  return result;
}

function assignDoublesRound(
  active: readonly string[], courtCount: number, roundNumber: number,
  partnerCounts: ReadonlyMap<string, number>, opponentCounts: ReadonlyMap<string, number>, matchupCounts: ReadonlyMap<string, number>,
): RotationMatchSeed[] {
  const remaining = [...active];
  const result: RotationMatchSeed[] = [];
  for (let court = 1; court <= courtCount; court += 1) {
    const anchor = remaining[0];
    if (!anchor) throw new Error('Unable to select doubles anchor');
    let best: { teamA: [string, string]; teamB: [string, string]; cost: number } | undefined;
    for (let i = 1; i < remaining.length; i += 1) for (let j = i + 1; j < remaining.length; j += 1) for (let k = j + 1; k < remaining.length; k += 1) {
      const b = remaining[i]; const c = remaining[j]; const d = remaining[k];
      if (!b || !c || !d) continue;
      const partitions: Array<[[string, string], [string, string]]> = [
        [[anchor, b], [c, d]], [[anchor, c], [b, d]], [[anchor, d], [b, c]],
      ];
      for (const [teamA, teamB] of partitions) {
        const cost = doublesCost(teamA, teamB, partnerCounts, opponentCounts, matchupCounts, roundNumber);
        if (!best || cost < best.cost) best = { teamA, teamB, cost };
      }
    }
    if (!best) throw new Error('Unable to select doubles match');
    result.push({ roundNumber, courtNumber: court, teamAPlayerIds: [...best.teamA], teamBPlayerIds: [...best.teamB] });
    removeIds(remaining, [...best.teamA, ...best.teamB]);
  }
  return result;
}

function doublesCost(
  teamA: readonly [string, string], teamB: readonly [string, string], partnerCounts: ReadonlyMap<string, number>,
  opponentCounts: ReadonlyMap<string, number>, matchupCounts: ReadonlyMap<string, number>, roundNumber: number,
): number {
  const repeatedMatchup = matchupCounts.get(matchupKey(teamA, teamB)) ?? 0;
  const repeatedPartners = pairCount(partnerCounts, teamA[0], teamA[1]) + pairCount(partnerCounts, teamB[0], teamB[1]);
  let repeatedOpponents = 0;
  for (const a of teamA) for (const b of teamB) repeatedOpponents += pairCount(opponentCounts, a, b);
  return repeatedMatchup * 1_000_000 + repeatedPartners * 20_000 + repeatedOpponents * 2_000 + tieCost(`${teamA.join(':')}|${teamB.join(':')}`, roundNumber);
}

function registerHistory(
  history: readonly RotationHistoryMatch[], playCounts: Map<string, number>, lastPlayedRound: Map<string, number>, streakCounts: Map<string, number>,
  partnerCounts: Map<string, number>, opponentCounts: Map<string, number>, matchupCounts: Map<string, number>,
): void {
  const byRound = new Map<number, RotationHistoryMatch[]>();
  for (const match of history) byRound.set(match.roundNumber, [...(byRound.get(match.roundNumber) ?? []), match]);
  for (const roundNumber of [...byRound.keys()].sort((a, b) => a - b)) {
    const played = new Set<string>();
    for (const match of byRound.get(roundNumber) ?? []) {
      registerPairHistory(match, playCounts, partnerCounts, opponentCounts, matchupCounts);
      for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) played.add(id);
    }
    updateStreaks([...playCounts.keys()], played, roundNumber, lastPlayedRound, streakCounts);
  }
}

function registerPairHistory(
  match: RotationHistoryMatch, playCounts: Map<string, number>, partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>, matchupCounts: Map<string, number>,
): void {
  const teamA = [...match.teamAPlayerIds]; const teamB = [...match.teamBPlayerIds];
  for (const id of [...teamA, ...teamB]) if (playCounts.has(id)) playCounts.set(id, count(playCounts, id) + 1);
  registerPairs(teamA, partnerCounts); registerPairs(teamB, partnerCounts);
  for (const a of teamA) for (const b of teamB) incrementPair(opponentCounts, a, b);
  if (teamA.length === 2 && teamB.length === 2) {
    const key = matchupKey(teamA as [string, string], teamB as [string, string]);
    matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);
  }
}

function updateStreaks(participantIds: readonly string[], played: ReadonlySet<string>, roundNumber: number, lastPlayedRound: Map<string, number>, streakCounts: Map<string, number>): void {
  for (const id of participantIds) {
    if (!played.has(id)) { streakCounts.set(id, 0); continue; }
    const consecutive = count(lastPlayedRound, id) === roundNumber - 1;
    streakCounts.set(id, consecutive ? count(streakCounts, id) + 1 : 1);
    lastPlayedRound.set(id, roundNumber);
  }
}

function registerPairs(ids: readonly string[], target: Map<string, number>): void {
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    const a = ids[i]; const b = ids[j]; if (a && b) incrementPair(target, a, b);
  }
}
function incrementPair(target: Map<string, number>, a: string, b: string): void { const key = pairKey(a, b); target.set(key, (target.get(key) ?? 0) + 1); }
function pairCount(target: ReadonlyMap<string, number>, a: string, b: string): number { return target.get(pairKey(a, b)) ?? 0; }
function pairKey(a: string, b: string): string { return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; }
function matchupKey(teamA: readonly [string, string], teamB: readonly [string, string]): string {
  const a = [...teamA].sort().join('\u0001'); const b = [...teamB].sort().join('\u0001');
  return a < b ? `${a}\u0002${b}` : `${b}\u0002${a}`;
}
function removeIds(target: string[], ids: readonly string[]): void { const used = new Set(ids); target.splice(0, target.length, ...target.filter((id) => !used.has(id))); }
function count(target: ReadonlyMap<string, number>, key: string): number { return target.get(key) ?? 0; }
function tieCost(value: string, salt: number): number { return hash(`${salt}:${value}`) % 997; }
function stableCompare(a: string, b: string, salt: number): number { return hash(`${salt}:${a}`) - hash(`${salt}:${b}`) || a.localeCompare(b); }
function hash(value: string): number { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return result >>> 0; }


