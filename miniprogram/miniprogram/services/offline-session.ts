import { Gender, MatchFormat, RegistrationMode } from '../shared/contracts';
import type { ApiEventRecord, ApiMatchPlayer, ApiMatchRecord, ApiParticipant, ApiRankingEntry, EventDraftInput, EventDraftRecord } from '../shared/models';

interface OfflineEvent extends ApiEventRecord { participants: ApiParticipant[]; matches: ApiMatchRecord[]; }
interface PlayerStats { plays: number; lastRound: number; streak: number; }
interface PairStats { partners: Map<string, number>; opponents: Map<string, number>; matchups: Map<string, number>; }
interface CandidateMatch { teamA: ApiParticipant[]; teamB: ApiParticipant[]; cost: number; }

let offlineDrafts: EventDraftRecord[] = [];
const offlineEvents = new Map<string, OfflineEvent>();

/**
 * 进入离线模式时复制一份原有草稿快照。离线编辑、新建和删除只作用于内存副本，
 * 不会覆盖设备中原本存在的持久草稿。
 */
export function beginOfflineSession(persistentDrafts: readonly EventDraftRecord[]): void {
  offlineDrafts = clone([...persistentDrafts]);
  offlineEvents.clear();
}

/** 退出离线模式时显式清空本次临时数据。 */
export function resetOfflineSession(): void { offlineDrafts = []; offlineEvents.clear(); }

export function listOfflineDrafts(): EventDraftRecord[] { return clone(offlineDrafts).sort((a, b) => b.updatedAt - a.updatedAt); }
export function getOfflineDraft(id: string): EventDraftRecord | undefined { const draft = offlineDrafts.find((item) => item.id === id); return draft ? clone(draft) : undefined; }
export function saveOfflineDraft(input: EventDraftInput, editingId?: string): EventDraftRecord {
  const now = Date.now(); const existing = editingId ? offlineDrafts.find((item) => item.id === editingId) : undefined;
  const record: EventDraftRecord = { ...clone(input), id: existing?.id ?? localId('offline-draft'), createdAt: existing?.createdAt ?? now, updatedAt: now };
  offlineDrafts = existing ? offlineDrafts.map((item) => item.id === existing.id ? record : item) : [record, ...offlineDrafts];
  return clone(record);
}
export function deleteOfflineDraft(id: string): void { offlineDrafts = offlineDrafts.filter((item) => item.id !== id); }

export function listOfflineEvents(): ApiEventRecord[] {
  return [...offlineEvents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicEvent);
}

export function createOfflineEvent(draft: EventDraftInput): ApiEventRecord {
  if (draft.registrationMode !== RegistrationMode.OrganizerManaged) throw new Error('离线模式无法使用微信自主报名，请改用组织者录入');
  const participants: ApiParticipant[] = draft.manualParticipants.map((item) => ({
    id: localId('offline-player'), participantNumber: item.participantNumber, nickname: item.nickname,
    gender: item.gender, level: item.level, status: 'ACTIVE',
  }));
  assertEnoughPlayers(draft.matchFormat, participants);
  const now = new Date().toISOString();
  const record: OfflineEvent = {
    id: localId('offline-event'), title: draft.title, description: draft.description, shareCode: '', matchFormat: draft.matchFormat,
    registrationMode: RegistrationMode.OrganizerManaged, status: 'IN_PROGRESS', capacity: participants.length,
    courtCount: draft.courtCount, scoreTo: draft.scoreTo, rounds: draft.rounds, participants, matches: [], createdAt: now, updatedAt: now,
  };
  record.matches = generateSchedule(record, []); offlineEvents.set(record.id, record); return publicEvent(record);
}

export function getOfflineEvent(eventId: string): ApiEventRecord { return publicEvent(requireEvent(eventId)); }
export function deleteOfflineEvent(eventId: string): { deleted: boolean } { return { deleted: offlineEvents.delete(eventId) }; }

export function listOfflineMatches(eventId: string, filter: 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED'): ApiMatchRecord[] {
  const matches = requireEvent(eventId).matches.filter((match) => match.status !== 'CANCELLED');
  return clone(matches.filter((match) => filter === 'ALL'
    || (filter === 'PENDING' && ['SCHEDULED', 'SCORE_PENDING', 'SCORE_DISPUTED'].includes(match.status))
    || (filter === 'LIVE' && match.status === 'IN_PROGRESS')
    || (filter === 'FINISHED' && ['COMPLETED', 'WALKOVER'].includes(match.status))));
}

export function updateOfflineScore(eventId: string, matchId: string, teamAScore: number, teamBScore: number): ApiMatchRecord {
  const event = requireEvent(eventId); const match = requireMatch(event, matchId);
  validateScoreRange(event.scoreTo, teamAScore, teamBScore);
  match.teamAScore = teamAScore; match.teamBScore = teamBScore;
  if (teamAScore === 0 && teamBScore === 0) match.status = 'SCHEDULED';
  else match.status = validateFinalScore(event.scoreTo, teamAScore, teamBScore) ? 'COMPLETED' : 'IN_PROGRESS';
  event.updatedAt = new Date().toISOString(); return clone(match);
}

export function updateOfflinePlayers(eventId: string, matchId: string, teamAPlayerIds: string[], teamBPlayerIds: string[]): ApiMatchRecord {
  const event = requireEvent(eventId); const match = requireMatch(event, matchId);
  if (match.status !== 'SCHEDULED' || (match.teamAScore ?? 0) !== 0 || (match.teamBScore ?? 0) !== 0) throw new Error('开始计分后不能调整参赛人员，请先重置比分');
  const teamSize = event.matchFormat === MatchFormat.Singles ? 1 : 2; const ids = [...teamAPlayerIds, ...teamBPlayerIds];
  if (teamAPlayerIds.length !== teamSize || teamBPlayerIds.length !== teamSize || new Set(ids).size !== ids.length) throw new Error('对阵人员数量不正确或存在重复人员');
  const players = ids.map((id) => event.participants.find((item) => item.id === id && item.status !== 'WITHDRAWN'));
  if (players.some((item) => !item)) throw new Error('只能选择当前可参赛人员');
  if (event.matchFormat === MatchFormat.MixedDoubles && (!isMixedTeam(players.slice(0, 2)) || !isMixedTeam(players.slice(2, 4)))) throw new Error('混双每队必须由一男一女组成');
  match.players = makeMatchPlayers(players as ApiParticipant[], teamSize); event.updatedAt = new Date().toISOString(); return clone(match);
}

export function listOfflineRankings(eventId: string): ApiRankingEntry[] {
  const event = requireEvent(eventId);
  const rows = new Map(event.participants.map((participant) => [participant.id, {
    participantId: participant.id, rank: 0, points: 0, wins: 0, losses: 0, scored: 0, conceded: 0, matchesPlayed: 0, participant: clone(participant),
  }]));
  for (const match of event.matches.filter((item) => ['COMPLETED', 'WALKOVER'].includes(item.status))) {
    const a = match.teamAScore ?? 0; const b = match.teamBScore ?? 0; const difference = Math.abs(a - b); const aWon = a > b;
    for (const player of match.players) {
      const row = rows.get(player.participant.id); if (!row) continue;
      const own = player.side === 'A' ? a : b; const other = player.side === 'A' ? b : a; const won = player.side === 'A' ? aWon : !aWon;
      row.points += won ? difference : -difference; row.wins += won ? 1 : 0; row.losses += won ? 0 : 1;
      row.scored += own; row.conceded += other; row.matchesPlayed += 1;
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.scored - a.scored || a.conceded - b.conceded || a.participant.participantNumber.localeCompare(b.participant.participantNumber, undefined, { numeric: true }));
  let previous: ApiRankingEntry | undefined;
  return sorted.map((row, index) => { const tied = previous && previous.points === row.points && previous.wins === row.wins && previous.scored === row.scored && previous.conceded === row.conceded; row.rank = tied ? previous!.rank : index + 1; previous = row; return clone(row); });
}

export function regenerateOfflineMatches(eventId: string): ApiEventRecord {
  const event = requireEvent(eventId); const locked = event.matches.filter((match) => match.status !== 'SCHEDULED');
  event.matches = generateSchedule(event, locked); event.updatedAt = new Date().toISOString(); return publicEvent(event);
}

export function previewOfflineWithdraw(eventId: string, participantId: string): { participant: { id: string; nickname: string }; affectedMatches: Array<{ id: string; roundNumber: number; courtNumber: number }>; message: string } {
  const event = requireEvent(eventId); const participant = event.participants.find((item) => item.id === participantId);
  if (!participant || participant.status === 'WITHDRAWN') throw new Error('参赛者不存在或已经退出');
  const affectedMatches = event.matches.filter((match) => match.status === 'SCHEDULED' && match.players.some((player) => player.participant.id === participantId)).map(({ id, roundNumber, courtNumber }) => ({ id, roundNumber, courtNumber }));
  return { participant: { id: participant.id, nickname: participant.nickname }, affectedMatches, message: `该选手涉及 ${affectedMatches.length} 场未开始对阵。确认后将标记为已退出，并在保留已进行场次和总轮数的前提下重新排阵。` };
}

export function confirmOfflineWithdraw(eventId: string, participantId: string): ApiEventRecord {
  const event = requireEvent(eventId); const participant = event.participants.find((item) => item.id === participantId);
  if (!participant || participant.status === 'WITHDRAWN') throw new Error('参赛者不存在或已经退出');
  // 先校验退出后的候选名单，避免校验失败时已经把内存中的人员错误标记为退出。
  const remaining = event.participants.filter((item) => item.status !== 'WITHDRAWN' && item.id !== participantId);
  assertEnoughPlayers(event.matchFormat, remaining); participant.status = 'WITHDRAWN';
  return regenerateOfflineMatches(eventId);
}

function generateSchedule(event: OfflineEvent, lockedMatches: readonly ApiMatchRecord[]): ApiMatchRecord[] {
  const active = event.participants.filter((item) => item.status !== 'WITHDRAWN'); assertEnoughPlayers(event.matchFormat, active);
  const playersPerMatch = event.matchFormat === MatchFormat.Singles ? 2 : 4;
  const maximumCourts = event.matchFormat === MatchFormat.MixedDoubles
    ? Math.floor(Math.min(active.filter((item) => item.gender === Gender.Male).length, active.filter((item) => item.gender === Gender.Female).length) / 2)
    : Math.floor(active.length / playersPerMatch);
  const courtCount = Math.max(1, Math.min(event.courtCount, maximumCourts));
  const stats = new Map<string, PlayerStats>(active.map((player) => [player.id, { plays: 0, lastRound: 0, streak: 0 }]));
  const pairs: PairStats = { partners: new Map(), opponents: new Map(), matchups: new Map() };
  const lockedByRound = new Map<number, ApiMatchRecord[]>();
  for (const match of lockedMatches) lockedByRound.set(match.roundNumber, [...(lockedByRound.get(match.roundNumber) ?? []), clone(match)]);
  const result: ApiMatchRecord[] = [];

  /*
   * 重排始终遍历 1..event.rounds，而不是按剩余人数重新计算轮数。这保证临时退出后
   * 轮次编号和总轮数不变。含比赛中或已结束场次的轮次整体锁定，其余轮次重排。
   */
  for (let round = 1; round <= event.rounds; round += 1) {
    const locked = lockedByRound.get(round);
    if (locked?.length) {
      for (const match of locked.sort((a, b) => a.courtNumber - b.courtNumber)) { result.push(match); registerMatch(match, round, stats, pairs); }
      continue;
    }
    const used = new Set<string>();
    for (let court = 1; court <= courtCount; court += 1) {
      const candidate = chooseMatch(event.matchFormat, active.filter((item) => !used.has(item.id)), round, court, stats, pairs);
      if (!candidate) break;
      [...candidate.teamA, ...candidate.teamB].forEach((item) => used.add(item.id));
      const match: ApiMatchRecord = {
        id: localId('offline-match'), roundNumber: round, courtNumber: court, status: 'SCHEDULED', teamAScore: 0, teamBScore: 0,
        players: makeMatchPlayers([...candidate.teamA, ...candidate.teamB], candidate.teamA.length),
      };
      result.push(match); registerMatch(match, round, stats, pairs);
    }
  }
  return result;
}

function chooseMatch(format: MatchFormat, available: ApiParticipant[], round: number, court: number, stats: Map<string, PlayerStats>, pairs: PairStats): CandidateMatch | undefined {
  if (format === MatchFormat.Singles) return chooseSingles(available, round, court, stats, pairs);
  if (format === MatchFormat.MixedDoubles) return chooseMixed(available, round, court, stats, pairs);
  return chooseDoubles(available, round, court, stats, pairs);
}

function chooseSingles(players: ApiParticipant[], round: number, court: number, stats: Map<string, PlayerStats>, pairs: PairStats): CandidateMatch | undefined {
  let best: CandidateMatch | undefined;
  for (const pair of combinations(shortlist(players, round, court, stats, 8), 2)) {
    const a = pair[0]!; const b = pair[1]!;
    const candidate = { teamA: [a], teamB: [b], cost: selectionCost([a, b], round, stats) + pairCount(pairs.opponents, a.id, b.id) * 160 + tieCost([a, b], round, court) };
    if (!best || candidate.cost < best.cost) best = candidate;
  }
  return best;
}

function chooseDoubles(players: ApiParticipant[], round: number, court: number, stats: Map<string, PlayerStats>, pairs: PairStats): CandidateMatch | undefined {
  let best: CandidateMatch | undefined;
  for (const group of combinations(shortlist(players, round, court, stats, 9), 4)) {
    const partitions = [
      [[group[0]!, group[1]!], [group[2]!, group[3]!]], [[group[0]!, group[2]!], [group[1]!, group[3]!]], [[group[0]!, group[3]!], [group[1]!, group[2]!]],
    ] as ApiParticipant[][][];
    for (const partition of partitions) {
      const teamA = partition[0]!; const teamB = partition[1]!;
      const candidate = { teamA, teamB, cost: selectionCost(group, round, stats) + relationshipCost(teamA, teamB, pairs) + tieCost(group, round, court) };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
  }
  return best;
}

function chooseMixed(players: ApiParticipant[], round: number, court: number, stats: Map<string, PlayerStats>, pairs: PairStats): CandidateMatch | undefined {
  const men = shortlist(players.filter((item) => item.gender === Gender.Male), round, court, stats, 7);
  const women = shortlist(players.filter((item) => item.gender === Gender.Female), round, court, stats, 7);
  let best: CandidateMatch | undefined;
  for (const malePair of combinations(men, 2)) for (const femalePair of combinations(women, 2)) {
    const group = [...malePair, ...femalePair];
    const layouts = [[[malePair[0]!, femalePair[0]!], [malePair[1]!, femalePair[1]!]], [[malePair[0]!, femalePair[1]!], [malePair[1]!, femalePair[0]!]]] as ApiParticipant[][][];
    for (const layout of layouts) {
      const teamA = layout[0]!; const teamB = layout[1]!;
      const candidate = { teamA, teamB, cost: selectionCost(group, round, stats) + relationshipCost(teamA, teamB, pairs) + tieCost(group, round, court) };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
  }
  return best;
}

function shortlist(players: ApiParticipant[], round: number, court: number, stats: Map<string, PlayerStats>, limit: number): ApiParticipant[] {
  return [...players].sort((a, b) => selectionCost([a], round, stats) - selectionCost([b], round, stats) || seeded(a.id, round, court) - seeded(b.id, round, court)).slice(0, limit);
}

function selectionCost(players: ApiParticipant[], round: number, stats: Map<string, PlayerStats>): number {
  return players.reduce((sum, player) => {
    const row = stats.get(player.id) ?? { plays: 0, lastRound: 0, streak: 0 };
    // 有替补时优先让连续上场两轮者休息；人数刚好铺满所有场地时无法强制休息。
    return sum + row.plays * 120 + (row.lastRound === round - 1 ? 25 : 0) + (row.streak >= 2 ? 10000 : 0);
  }, 0);
}

function relationshipCost(teamA: ApiParticipant[], teamB: ApiParticipant[], pairs: PairStats): number {
  let cost = 0;
  for (const pair of combinations(teamA, 2)) cost += pairCount(pairs.partners, pair[0]!.id, pair[1]!.id) * 180;
  for (const pair of combinations(teamB, 2)) cost += pairCount(pairs.partners, pair[0]!.id, pair[1]!.id) * 180;
  for (const a of teamA) for (const b of teamB) cost += pairCount(pairs.opponents, a.id, b.id) * 45;
  return cost + (pairs.matchups.get(matchupKey(teamA, teamB)) ?? 0) * 500;
}

function registerMatch(match: ApiMatchRecord, round: number, stats: Map<string, PlayerStats>, pairs: PairStats): void {
  const teamA = match.players.filter((item) => item.side === 'A').map((item) => item.participant);
  const teamB = match.players.filter((item) => item.side === 'B').map((item) => item.participant);
  for (const player of [...teamA, ...teamB]) {
    const row = stats.get(player.id); if (!row) continue;
    row.streak = row.lastRound === round - 1 ? row.streak + 1 : 1; row.lastRound = round; row.plays += 1;
  }
  for (const pair of combinations(teamA, 2)) incrementPair(pairs.partners, pair[0]!.id, pair[1]!.id);
  for (const pair of combinations(teamB, 2)) incrementPair(pairs.partners, pair[0]!.id, pair[1]!.id);
  for (const a of teamA) for (const b of teamB) incrementPair(pairs.opponents, a.id, b.id);
  const key = matchupKey(teamA, teamB); pairs.matchups.set(key, (pairs.matchups.get(key) ?? 0) + 1);
}

function makeMatchPlayers(players: ApiParticipant[], teamSize: number): ApiMatchPlayer[] {
  return players.map((participant, index) => ({ side: index < teamSize ? 'A' : 'B', position: index % teamSize, participant: clone(participant) }));
}
function isMixedTeam(players: Array<ApiParticipant | undefined>): boolean { return players.length === 2 && Boolean(players[0]) && Boolean(players[1]) && players[0]!.gender !== players[1]!.gender; }
function combinations<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, picked: T[]): void => {
    if (picked.length === size) { result.push(picked); return; }
    for (let index = start; index <= values.length - (size - picked.length); index += 1) visit(index + 1, [...picked, values[index]!]);
  };
  visit(0, []); return result;
}
function pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }
function pairCount(map: Map<string, number>, a: string, b: string): number { return map.get(pairKey(a, b)) ?? 0; }
function incrementPair(map: Map<string, number>, a: string, b: string): void { const key = pairKey(a, b); map.set(key, (map.get(key) ?? 0) + 1); }
function matchupKey(teamA: ApiParticipant[], teamB: ApiParticipant[]): string { return [teamA.map((item) => item.id).sort().join('+'), teamB.map((item) => item.id).sort().join('+')].sort().join('::'); }
function tieCost(players: ApiParticipant[], round: number, court: number): number { return players.reduce((sum, item) => sum + seeded(item.id, round, court), 0) / 1000000; }
function seeded(value: string, round: number, court: number): number { let hash = round * 131 + court * 17; for (let index = 0; index < value.length; index += 1) hash = (hash * 33 + value.charCodeAt(index)) >>> 0; return hash % 100000; }

function validateScoreRange(scoreTo: number, a: number, b: number): void {
  const maximum = scoreTo === 31 ? 31 : 30;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > maximum || b > maximum) throw new Error(`比分必须是 0～${maximum} 的整数`);
}
function validateFinalScore(scoreTo: number, a: number, b: number): boolean {
  if (a === b) return false; const winner = Math.max(a, b); const loser = Math.min(a, b);
  if (scoreTo === 31) return winner === 31 && loser < 31;
  if (winner > 30 || loser >= 30) return false;
  if (loser <= scoreTo - 2) return winner === scoreTo;
  if (winner < 30) return winner - loser === 2;
  return winner - loser === 1 || winner - loser === 2;
}
function assertEnoughPlayers(format: MatchFormat, players: readonly ApiParticipant[]): void {
  const minimum = format === MatchFormat.Singles ? 2 : 4;
  if (players.length < minimum) throw new Error(`${format === MatchFormat.Singles ? '单打' : '双打'}至少需要 ${minimum} 名可参赛人员`);
  if (format === MatchFormat.MixedDoubles) {
    const men = players.filter((item) => item.gender === Gender.Male).length; const women = players.filter((item) => item.gender === Gender.Female).length;
    if (men < 2 || women < 2 || men !== women) throw new Error('混双需要男女人数相等，且男女各至少 2 人');
  }
}
function requireEvent(eventId: string): OfflineEvent { const event = offlineEvents.get(eventId); if (!event) throw new Error('离线球局不存在或本次离线数据已清除'); return event; }
function requireMatch(event: OfflineEvent, matchId: string): ApiMatchRecord { const match = event.matches.find((item) => item.id === matchId); if (!match) throw new Error('对阵不存在'); return match; }
function publicEvent(event: OfflineEvent): ApiEventRecord {
  const { matches, ...record } = event;
  return clone({ ...record, participants: event.participants, _count: { participants: event.participants.length, matches: matches.filter((item) => item.status !== 'CANCELLED').length } });
}
function localId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
