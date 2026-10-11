/** 分享文本 v1：仅包含比赛数据，不含用户账号、数据库 ID、访问凭据或原报名链接。 */
export interface EventTransfer {
  version: 1;
  title: string;
  description?: string;
  matchFormat: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  status: 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'SCHEDULE_READY' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  courtCount: number;
  rounds: number;
  scoreTo: 11 | 15 | 21 | 31;
  capacity?: number;
  participants: Array<{ participantNumber: string; nickname: string; gender: 'MALE' | 'FEMALE'; level?: string; status: 'ACTIVE' | 'REGISTERED' | 'WAITLISTED' | 'WITHDRAWN' }>;
  matches: Array<{ roundNumber: number; courtNumber: number; teamA: string[]; teamB: string[]; teamAScore: number; teamBScore: number; status: 'SCHEDULED' | 'IN_PROGRESS' | 'SCORE_PENDING' | 'COMPLETED' | 'WALKOVER' | 'CANCELLED' }>;
}

const formats = { SINGLES: '单打', DOUBLES: '双打', MIXED_DOUBLES: '双打混双' } as const;
const events = { REGISTRATION_OPEN: '报名中', REGISTRATION_CLOSED: '报名结束', SCHEDULE_READY: '已排阵', IN_PROGRESS: '进行中', FINISHED: '已结束', CANCELLED: '已取消' } as const;
const players = { ACTIVE: '参赛', REGISTERED: '已报名', WAITLISTED: '等位', WITHDRAWN: '已退出' } as const;
const matches = { SCHEDULED: '未开始', IN_PROGRESS: '比赛中', SCORE_PENDING: '待确认', COMPLETED: '已结束', WALKOVER: '弃权结束', CANCELLED: '已取消' } as const;
const HEADER = '转转接龙 · 完整对阵 v1';
const END = '—— 完整对阵结束 ——';
function keyOf<T extends string>(map: Record<T, string>, label: string): T {
  const key = (Object.keys(map) as T[]).find((item) => map[item] === label);
  if (!key) throw new Error('不支持的标记：' + label);
  return key;
}

/** 每个名称使用 JSON 字符串转义，允许昵称含分隔符、引号或换行，不依赖视觉空格对齐。 */
export function formatEventTransfer(data: EventTransfer): string {
  validateEventTransfer(data);
  const lines = [HEADER, '名称：' + JSON.stringify(data.title), '形式：' + formats[data.matchFormat],
    '设置：' + [data.courtCount, data.rounds, data.scoreTo, data.capacity ?? data.participants.length].join(' | ') + '（场地 | 轮数 | 分制 | 人数上限）',
    '状态：' + events[data.status], '说明：' + JSON.stringify(data.description ?? ''), '', '参赛名单（编号 | 昵称 | 性别 | 水平 | 状态） · 共 ' + data.participants.length + ' 人'];
  for (const p of data.participants) lines.push([p.participantNumber, JSON.stringify(p.nickname), p.gender === 'MALE' ? '男' : '女', JSON.stringify(p.level ?? ''), players[p.status]].join(' | '));
  lines.push('', '对阵（场地 | A队 VS B队 | 比分 | 状态） · 共 ' + data.matches.length + ' 场');
  let round = 0;
  for (const m of [...data.matches].sort((a, b) => a.roundNumber - b.roundNumber || a.courtNumber - b.courtNumber)) {
    if (round !== m.roundNumber) { round = m.roundNumber; lines.push('第 ' + round + ' 轮'); }
    lines.push([m.courtNumber + '号场', m.teamA.join('/') + ' VS ' + m.teamB.join('/'), m.teamAScore + ':' + m.teamBScore, matches[m.status]].join(' | '));
  }
  lines.push(END);
  return lines.join('\n');
}

/** 文本先完整解析和校验，再允许持久化。缺少结束标记的截断分享必须拒绝，不能静默补排。 */
export function parseEventTransfer(text: string): EventTransfer {
  if (text.length > 180000) throw new Error('对阵文字过长');
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== HEADER || lines[lines.length - 1] !== END) throw new Error('请粘贴新版“复制完整对阵（可导入）”生成的全部文字；旧版或截断文字无法还原');
  const settings = (lines[3] ?? '').match(/^设置：(\d+) \| (\d+) \| (\d+) \| (\d+)（场地 \| 轮数 \| 分制 \| 人数上限）$/);
  if (!settings || !lines[1]?.startsWith('名称：') || !lines[2]?.startsWith('形式：') || !lines[4]?.startsWith('状态：') || !lines[5]?.startsWith('说明：')) throw new Error('比赛信息格式不完整');
  const data: EventTransfer = {
    version: 1, title: parseString(lines[1].slice(3)), description: parseString(lines[5].slice(3)) || undefined,
    matchFormat: keyOf(formats, lines[2].slice(3)), status: keyOf(events, lines[4].slice(3)),
    courtCount: Number(settings[1]), rounds: Number(settings[2]), scoreTo: Number(settings[3]) as EventTransfer['scoreTo'], capacity: Number(settings[4]),
    participants: [], matches: [],
  };
  const rosterCount = lines[6]?.match(/^参赛名单（编号 \| 昵称 \| 性别 \| 水平 \| 状态） · 共 (\d+) 人$/);
  if (!rosterCount) throw new Error('缺少参赛名单');
  let index = 7;
  for (; index < lines.length && !lines[index]!.startsWith('对阵（'); index++) {
    const fields = splitFields(lines[index]!);
    if (fields.length !== 5 || !['男', '女'].includes(fields[2]!)) throw new Error('参赛名单格式错误');
    data.participants.push({ participantNumber: fields[0]!, nickname: parseString(fields[1]!), gender: fields[2] === '男' ? 'MALE' : 'FEMALE', level: parseString(fields[3]!) || undefined, status: keyOf(players, fields[4]!) });
  }
  if (index >= lines.length) throw new Error('缺少对阵列表');
  const matchCount = lines[index]?.match(/^对阵（场地 \| A队 VS B队 \| 比分 \| 状态） · 共 (\d+) 场$/);
  if (!matchCount || data.participants.length !== Number(rosterCount[1])) throw new Error('参赛名单不完整，请重新复制全部文字');
  let round = 0;
  for (index++; index < lines.length - 1; index++) {
    const line = lines[index]!; const heading = line.match(/^第 (\d+) 轮$/);
    if (heading) { round = Number(heading[1]); continue; }
    const fields = splitFields(line); const court = fields[0]?.match(/^(\d+)号场$/); const sides = fields[1]?.split(' VS '); const score = fields[2]?.match(/^(\d+):(\d+)$/);
    if (fields.length !== 4 || !court || !sides || sides.length !== 2 || !score) throw new Error('对阵行格式错误：' + line);
    data.matches.push({ roundNumber: round, courtNumber: Number(court[1]), teamA: sides[0]!.split('/'), teamB: sides[1]!.split('/'), teamAScore: Number(score[1]), teamBScore: Number(score[2]), status: keyOf(matches, fields[3]!) });
  }
  if (data.matches.length !== Number(matchCount[1])) throw new Error('对阵场次不完整，请重新复制全部文字');
  validateEventTransfer(data); return data;
}
function parseString(text: string): string { try { const value: unknown = JSON.parse(text); if (typeof value === 'string') return value; } catch {} throw new Error('名称或说明格式错误，请保留文字中的引号'); }
function splitFields(line: string): string[] {
  const fields: string[] = []; let start = 0; let quoted = false; let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quoted) { escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (char === '|' && !quoted) { fields.push(line.slice(start, index).trim()); start = index + 1; }
  }
  fields.push(line.slice(start).trim()); return fields;
}
export function validateEventTransfer(data: EventTransfer): void {
  const fail = (message: string): never => { throw new Error(message); };
  const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (data.version !== 1 || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 40) fail('球局名称必须为 1～40 字');
  if (!Object.prototype.hasOwnProperty.call(formats, data.matchFormat) || !Object.prototype.hasOwnProperty.call(events, data.status)) fail('比赛形式或状态无效');
  if (!integer(data.courtCount, 1, 16) || !integer(data.rounds, 1, 20) || ![11, 15, 21, 31].includes(data.scoreTo)) fail('场地、轮数或分制无效');
  if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 500)) fail('比赛说明不能超过 500 字');
  if (!Array.isArray(data.participants) || data.participants.length > 64 || !Array.isArray(data.matches) || data.matches.length > data.rounds * data.courtCount) fail('名单或场次数量无效');
  if (data.capacity !== undefined && !integer(data.capacity, 2, 64)) fail('人数上限无效');
  const roster = new Map<string, EventTransfer['participants'][number]>(); const names = new Set<string>();
  for (const p of data.participants) {
    if (typeof p.participantNumber !== 'string' || !/^[1-9]\d{0,19}$/.test(p.participantNumber) || roster.has(p.participantNumber)) fail('选手编号无效或重复');
    if (typeof p.nickname !== 'string' || !p.nickname.trim() || p.nickname.length > 20 || names.has(p.nickname.trim().toLowerCase())) fail('昵称无效或重复');
    if (!['MALE', 'FEMALE'].includes(p.gender) || !Object.prototype.hasOwnProperty.call(players, p.status) || (p.level !== undefined && (typeof p.level !== 'string' || p.level.length > 30))) fail('选手性别、水平或状态无效');
    roster.set(p.participantNumber, p); names.add(p.nickname.trim().toLowerCase());
  }
  const slots = new Set<string>(); const roundPlayers = new Set<string>(); const teamSize = data.matchFormat === 'SINGLES' ? 1 : 2;
  for (const m of data.matches) {
    if (!integer(m.roundNumber, 1, data.rounds) || !integer(m.courtNumber, 1, data.courtCount) || slots.has(m.roundNumber + ':' + m.courtNumber)) fail('轮次或场地无效、重复');
    slots.add(m.roundNumber + ':' + m.courtNumber);
    if (!Object.prototype.hasOwnProperty.call(matches, m.status) || !Array.isArray(m.teamA) || !Array.isArray(m.teamB) || m.teamA.length !== teamSize || m.teamB.length !== teamSize) fail('对阵队伍或状态无效');
    const ids = [...m.teamA, ...m.teamB];
    if (new Set(ids).size !== ids.length || ids.some((id) => !roster.has(id))) fail('对阵包含重复或未在名单中的人员');
    if (m.status !== 'CANCELLED') for (const id of ids) { const key = m.roundNumber + ':' + id; if (roundPlayers.has(key)) fail('同一轮中同一人员不能出现在多个场地'); roundPlayers.add(key); }
    if (data.matchFormat === 'MIXED_DOUBLES' && [m.teamA, m.teamB].some((team) => new Set(team.map((id) => roster.get(id)!.gender)).size !== 2)) fail('混双每队必须一男一女');
    const cap = 31;
    if (!integer(m.teamAScore, 0, cap) || !integer(m.teamBScore, 0, cap)) fail('比分超出分制范围');
    if (m.status === 'SCHEDULED' && (m.teamAScore !== 0 || m.teamBScore !== 0)) fail('未开始对阵必须为 0:0');
    // v1 历史分享文本没有封顶分字段：旧版 30:29 曾是合法终局，仅在导入/导出
    // 已完成记录时兼容。新计分仍使用 31 分封顶，30:29 不会被判定为已结束。
    const legacyCapResult = data.scoreTo !== 31 && Math.max(m.teamAScore, m.teamBScore) === 30 && Math.min(m.teamAScore, m.teamBScore) === 29;
    if (m.status === 'COMPLETED' && !isFinalTransferScore(data.scoreTo, m.teamAScore, m.teamBScore) && !legacyCapResult) fail('已结束对阵的比分不符合羽毛球规则');
    if (m.status === 'WALKOVER' && m.teamAScore === m.teamBScore) fail('弃权结束比分不能相同');
  }
  if (['IN_PROGRESS', 'SCHEDULE_READY', 'FINISHED'].includes(data.status) && !data.matches.length) fail('该球局状态需要包含对阵');
  if (data.status === 'FINISHED' && data.matches.some((m) => !['COMPLETED', 'WALKOVER', 'CANCELLED'].includes(m.status))) fail('已结束球局仍包含未结束对阵');
}
export function isFinalTransferScore(target: number, a: number, b: number): boolean {
  const win = Math.max(a, b); const lose = Math.min(a, b);
  if (a === b) return false;
  if (target === 31) return win === 31 && lose < 31;
  if (lose <= target - 2) return win === target;
  return win < 31 ? win - lose === 2 : win === 31 && [1, 2].includes(win - lose);
}
export function suggestedImportTitle(title: string, existing: readonly string[]): string {
  const titles = new Set(existing.map((name) => name.trim()));
  for (let number = 2; ; number++) { const suffix = '（导入' + number + '）'; const candidate = title.slice(0, 40 - suffix.length) + suffix; if (!titles.has(candidate)) return candidate; }
}
