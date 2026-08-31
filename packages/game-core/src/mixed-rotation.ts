import { MatchFormat } from '@zzjl/contracts';
import { recommendRotationRounds, type GenerateRotationInput, type RotationHistoryMatch, type RotationMatchSeed, type RotationSchedule } from './rotation';

/**
 * 生成严格混双赛程：每支队伍始终由一男一女组成。
 *
 * 男女分别按累计上场次数、连续上场次数和休息时长选择，因此不会因某一性别人数较多
 * 而破坏混双结构；每块场地再枚举两男两女的两种合法搭档拆分，优先减少重复搭档、
 * 重复对手和完整对阵。退出重排允许男女剩余人数暂时不相等，但只使用两侧都能匹配的
 * 人数，初次创建时的“男女总人数相等”由服务层强制校验。
 */
export function generateMixedDoublesRotation(input: GenerateRotationInput): RotationSchedule {
  if (input.format !== MatchFormat.MixedDoubles) throw new Error('Mixed doubles rotation requires MIXED_DOUBLES format');
  const ids = [...input.participantIds];
  if (new Set(ids).size !== ids.length) throw new Error('Participant ids must be unique');
  const genders = input.participantGenders;
  if (!genders) throw new Error('Mixed doubles requires participant genders');
  const men = ids.filter((id) => genders[id] === 'MALE');
  const women = ids.filter((id) => genders[id] === 'FEMALE');
  if (men.length < 2 || women.length < 2) throw new Error('Mixed doubles requires at least two men and two women');
  if (!Number.isInteger(input.courtCount) || input.courtCount < 1) throw new Error('Court count must be a positive integer');
  const recommendedRounds = recommendRotationRounds(ids.length);
  const rounds = input.rounds ?? recommendedRounds;
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 20) throw new Error('Rounds must be an integer between 0 and 20');

  const history = [...(input.history ?? [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const playCounts = new Map(ids.map((id) => [id, 0]));
  const lastPlayedRound = new Map(ids.map((id) => [id, 0]));
  const streakCounts = new Map(ids.map((id) => [id, 0]));
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const matchupCounts = new Map<string, number>();
  registerHistory(history, ids, playCounts, lastPlayedRound, streakCounts, partnerCounts, opponentCounts, matchupCounts);

  const effectiveCourts = Math.min(input.courtCount, Math.floor(men.length / 2), Math.floor(women.length / 2));
  const perGender = effectiveCourts * 2;
  const firstRound = input.startRound ?? ((history.length ? Math.max(...history.map((match) => match.roundNumber)) : 0) + 1);
  const matches: RotationMatchSeed[] = [];

  for (let offset = 0; offset < rounds; offset += 1) {
    const roundNumber = firstRound + offset;
    const remainingMen = eligiblePool(men, perGender, roundNumber, lastPlayedRound, streakCounts);
    const remainingWomen = eligiblePool(women, perGender, roundNumber, lastPlayedRound, streakCounts);
    const played = new Set<string>();

    for (let courtNumber = 1; courtNumber <= effectiveCourts; courtNumber += 1) {
      let best: { teamA: [string, string]; teamB: [string, string]; cost: number } | undefined;
      // 同时枚举两名男选手和两名女选手，不能固定首位男选手为锚点；
      // 否则一块场地时该选手会被每轮强制选中，破坏体力与上场次数均衡。
      for (let firstManIndex = 0; firstManIndex < remainingMen.length; firstManIndex += 1) {
        for (let secondManIndex = firstManIndex + 1; secondManIndex < remainingMen.length; secondManIndex += 1) {
          const firstMan = remainingMen[firstManIndex]; const secondMan = remainingMen[secondManIndex];
          if (!firstMan || !secondMan) continue;
          for (let firstWomanIndex = 0; firstWomanIndex < remainingWomen.length; firstWomanIndex += 1) {
            for (let secondWomanIndex = firstWomanIndex + 1; secondWomanIndex < remainingWomen.length; secondWomanIndex += 1) {
              const firstWoman = remainingWomen[firstWomanIndex]; const secondWoman = remainingWomen[secondWomanIndex];
              if (!firstWoman || !secondWoman) continue;
              const partitions: Array<[[string, string], [string, string]]> = [
                [[firstMan, firstWoman], [secondMan, secondWoman]],
                [[firstMan, secondWoman], [secondMan, firstWoman]],
              ];
              for (const [teamA, teamB] of partitions) {
                const selected = [...teamA, ...teamB];
                const selectionCost = selected.reduce((sum, id) => sum + value(playCounts, id), 0) * 1_000_000
                  + selected.reduce((sum, id) => sum + value(streakCounts, id), 0) * 30_000
                  + selected.reduce((sum, id) => sum + value(lastPlayedRound, id), 0) * 100;
                const cost = selectionCost + mixedCost(teamA, teamB, partnerCounts, opponentCounts, matchupCounts, roundNumber);
                if (!best || cost < best.cost) best = { teamA, teamB, cost };
              }
            }
          }
        }
      }
      if (!best) throw new Error('Unable to generate mixed doubles match');
      const match = { roundNumber, courtNumber, teamAPlayerIds: [...best.teamA], teamBPlayerIds: [...best.teamB] };
      matches.push(match); registerMatch(match, playCounts, partnerCounts, opponentCounts, matchupCounts);
      for (const id of [...best.teamA, ...best.teamB]) played.add(id);
      removeIds(remainingMen, [best.teamA[0], best.teamB[0]]);
      removeIds(remainingWomen, [best.teamA[1], best.teamB[1]]);
    }
    updateStreaks(ids, played, roundNumber, lastPlayedRound, streakCounts);
  }
  return { recommendedRounds, rounds, matches };
}

function eligiblePool(ids: readonly string[], requiredCount: number, roundNumber: number, lastPlayedRound: ReadonlyMap<string, number>, streakCounts: ReadonlyMap<string, number>): string[] {
  const rested = ids.filter((id) => !(value(lastPlayedRound, id) === roundNumber - 1 && value(streakCounts, id) >= 2));
  return rested.length >= requiredCount ? rested : [...ids];
}

function mixedCost(teamA: [string, string], teamB: [string, string], partners: ReadonlyMap<string, number>, opponents: ReadonlyMap<string, number>, matchups: ReadonlyMap<string, number>, round: number): number {
  const partnerRepeats = pairCount(partners, teamA[0], teamA[1]) + pairCount(partners, teamB[0], teamB[1]);
  let opponentRepeats = 0; for (const a of teamA) for (const b of teamB) opponentRepeats += pairCount(opponents, a, b);
  return (matchups.get(matchupKey(teamA, teamB)) ?? 0) * 1_000_000 + partnerRepeats * 20_000 + opponentRepeats * 2_000 + tieCost(`${teamA.join(':')}|${teamB.join(':')}`, round);
}

function registerHistory(history: readonly RotationHistoryMatch[], ids: readonly string[], plays: Map<string, number>, last: Map<string, number>, streaks: Map<string, number>, partners: Map<string, number>, opponents: Map<string, number>, matchups: Map<string, number>): void {
  const rounds = new Map<number, RotationHistoryMatch[]>();
  for (const match of history) rounds.set(match.roundNumber, [...(rounds.get(match.roundNumber) ?? []), match]);
  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    const played = new Set<string>();
    for (const match of rounds.get(round) ?? []) { registerMatch(match, plays, partners, opponents, matchups); for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) played.add(id); }
    updateStreaks(ids, played, round, last, streaks);
  }
}
function registerMatch(match: RotationHistoryMatch, plays: Map<string, number>, partners: Map<string, number>, opponents: Map<string, number>, matchups: Map<string, number>): void {
  const a = [...match.teamAPlayerIds]; const b = [...match.teamBPlayerIds];
  for (const id of [...a, ...b]) if (plays.has(id)) plays.set(id, value(plays, id) + 1);
  if (a[0] && a[1]) incrementPair(partners, a[0], a[1]); if (b[0] && b[1]) incrementPair(partners, b[0], b[1]);
  for (const left of a) for (const right of b) incrementPair(opponents, left, right);
  if (a.length === 2 && b.length === 2) { const key = matchupKey(a as [string, string], b as [string, string]); matchups.set(key, (matchups.get(key) ?? 0) + 1); }
}
function updateStreaks(ids: readonly string[], played: ReadonlySet<string>, round: number, last: Map<string, number>, streaks: Map<string, number>): void {
  for (const id of ids) { if (!played.has(id)) { streaks.set(id, 0); continue; } streaks.set(id, value(last, id) === round - 1 ? value(streaks, id) + 1 : 1); last.set(id, round); }
}
function pairKey(a: string, b: string): string { return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; }
function pairCount(map: ReadonlyMap<string, number>, a: string, b: string): number { return map.get(pairKey(a, b)) ?? 0; }
function incrementPair(map: Map<string, number>, a: string, b: string): void { const key = pairKey(a, b); map.set(key, (map.get(key) ?? 0) + 1); }
function matchupKey(a: [string, string], b: [string, string]): string { const left = [...a].sort().join('\u0001'); const right = [...b].sort().join('\u0001'); return left < right ? `${left}\u0002${right}` : `${right}\u0002${left}`; }
function removeIds(target: string[], ids: readonly string[]): void { const set = new Set(ids); target.splice(0, target.length, ...target.filter((id) => !set.has(id))); }
function value(map: ReadonlyMap<string, number>, id: string): number { return map.get(id) ?? 0; }
function tieCost(text: string, salt: number): number { return hash(`${salt}:${text}`) % 997; }
function stableCompare(a: string, b: string, salt: number): number { return hash(`${salt}:${a}`) - hash(`${salt}:${b}`) || a.localeCompare(b); }
function hash(text: string): number { let result = 2166136261; for (let index = 0; index < text.length; index += 1) { result ^= text.charCodeAt(index); result = Math.imul(result, 16777619); } return result >>> 0; }




