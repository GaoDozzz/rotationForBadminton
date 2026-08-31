import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FinishRule, MatchFormat, ParticipantSource, RegistrationMode, getMatchShape, type ScoreRule } from '@zzjl/contracts';
import { calculateRankings, generateFreeRotation, validateFinalScore, validateManualRoster } from '@zzjl/game-core';
import { randomBytes } from 'node:crypto';
import { RedisService } from '../../cache/redis.service';
import { PrismaService } from '../../database/prisma.service';
import { EventStatus, MatchSide, MatchStatus, ParticipantStatus, Prisma } from '../../generated/prisma/client';
import type { CreateEventDto, JoinEventDto, UpdateMatchPlayersDto, UpdateMatchScoreDto } from './event.dto';
import { IdentityService } from './identity.service';

type MatchFilter = 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED';

@Injectable()
export class EventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  async listMine(openid: string) {
    const user = await this.identity.ensureUser(openid);
    return this.prisma.event.findMany({
      where: { organizerId: user.id, deletedAt: null },
      include: { _count: { select: { participants: true, matches: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(openid: string, dto: CreateEventDto) {
    const organizer = await this.identity.ensureUser(openid);
    return this.redis.withLock(`event-create:${organizer.id}`, async () => {
      const participants = this.validateCreateInput(dto);
      return this.prisma.$transaction(async (tx) => {
        const directStart = dto.registrationMode === RegistrationMode.OrganizerManaged;
        const event = await tx.event.create({ data: {
          organizerId: organizer.id, title: dto.title.trim(), description: dto.description?.trim() || undefined,
          shareCode: await this.uniqueShareCode(tx), matchFormat: dto.matchFormat, registrationMode: dto.registrationMode,
          status: directStart ? EventStatus.IN_PROGRESS : EventStatus.REGISTRATION_OPEN,
          capacity: directStart ? participants.length : dto.capacity, courtCount: dto.courtCount,
          scoreTo: dto.scoreTo, rounds: dto.rounds, startedAt: directStart ? new Date() : undefined,
        } });
        if (participants.length) await tx.participant.createMany({ data: participants.map((entry) => ({
          eventId: event.id, participantNumber: entry.participantNumber, nickname: entry.nickname,
          gender: entry.gender, level: entry.level, source: ParticipantSource.OrganizerEntry, status: ParticipantStatus.ACTIVE,
        })) });
        if (directStart) await this.generateSchedule(tx, event.id);
        await this.audit(tx, event.id, organizer.id, 'EVENT_CREATED', 'event', event.id, null, event);
        return tx.event.findUniqueOrThrow({ where: { id: event.id }, include: { participants: true, matches: { include: { players: true } } } });
      });
    });
  }

  async getByShareCode(shareCode: string) {
    const event = await this.prisma.event.findUnique({ where: { shareCode }, include: { participants: { where: { status: { not: ParticipantStatus.WITHDRAWN } } } } });
    if (!event || event.deletedAt) throw new NotFoundException('球局不存在或已删除');
    return event;
  }

  async join(shareCode: string, openid: string, dto: JoinEventDto) {
    return this.redis.withLock(`join:${shareCode}:${openid}`, async () => {
      const user = await this.identity.ensureUser(openid, dto.nickname.trim());
      return this.prisma.$transaction(async (tx) => {
        const event = await tx.event.findUnique({ where: { shareCode } });
        if (!event || event.deletedAt) throw new NotFoundException('球局不存在或已删除');
        if (event.status !== EventStatus.REGISTRATION_OPEN) throw new ConflictException('该球局当前不可报名');
        if (await tx.participant.findFirst({ where: { eventId: event.id, userId: user.id } })) throw new ConflictException('你已经报名该球局');
        const activeCount = await tx.participant.count({ where: { eventId: event.id, status: { in: [ParticipantStatus.ACTIVE, ParticipantStatus.REGISTERED] } } });
        const participant = await tx.participant.create({ data: {
          eventId: event.id, userId: user.id, participantNumber: String(activeCount + 1), nickname: dto.nickname.trim(),
          gender: dto.gender, level: dto.level?.trim() || undefined, source: ParticipantSource.WechatSelfService,
          status: event.capacity !== null && activeCount >= event.capacity ? ParticipantStatus.WAITLISTED : ParticipantStatus.ACTIVE,
        } });
        await this.audit(tx, event.id, user.id, 'PARTICIPANT_JOINED', 'participant', participant.id, null, participant);
        return participant;
      });
    });
  }

  async start(eventId: string, openid: string) {
    const organizer = await this.identity.ensureUser(openid);
    return this.redis.withLock(`schedule:${eventId}`, () => this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      if (![EventStatus.REGISTRATION_OPEN, EventStatus.REGISTRATION_CLOSED, EventStatus.SCHEDULE_READY].includes(event.status)) throw new ConflictException('当前球局状态不能生成对阵');
      await this.generateSchedule(tx, event.id);
      const updated = await tx.event.update({ where: { id: event.id }, data: { status: EventStatus.IN_PROGRESS, startedAt: event.startedAt ?? new Date() } });
      await this.audit(tx, event.id, organizer.id, 'EVENT_STARTED', 'event', event.id, event, updated);
      return updated;
    }));
  }

  async softDelete(eventId: string, openid: string) {
    const organizer = await this.identity.ensureUser(openid);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      const updated = await tx.event.update({ where: { id: eventId }, data: { deletedAt: new Date(), deletedById: organizer.id } });
      await this.audit(tx, eventId, organizer.id, 'EVENT_DELETED', 'event', eventId, event, updated);
      return { deleted: true };
    });
  }

  async listMatches(eventId: string, filter: MatchFilter) {
    const statuses = filterStatuses(filter);
    return this.prisma.match.findMany({
      where: { eventId, status: statuses ? { in: statuses } : { not: MatchStatus.CANCELLED } },
      include: { players: { include: { participant: true } } },
      orderBy: [{ roundNumber: 'asc' }, { courtNumber: 'asc' }],
    });
  }

  /**
   * 0:0 会把场次完整重置为未开始。11/15/21 分制采用羽毛球延长分：达到目标分且领先两分结束，
   * 29:29 后先到 30 分结束；31 分制不延长，先到 31 分结束。排名始终从已完成场次重新计算，
   * 因而修改或重置已结束比分不会残留旧积分。
   */
  async updateMatchScore(eventId: string, matchId: string, openid: string, dto: UpdateMatchScoreDto) {
    const organizer = await this.identity.ensureUser(openid);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      const match = await tx.match.findFirst({ where: { id: matchId, eventId }, include: { players: { include: { participant: true } } } });
      if (!match || match.status === MatchStatus.CANCELLED) throw new NotFoundException('对阵不存在或已取消');

      const rule = scoreRuleFor(event.scoreTo);
      const maximum = event.scoreTo === 31 ? 31 : 30;
      if (dto.teamAScore > maximum || dto.teamBScore > maximum) throw new BadRequestException(`比分不能超过 ${maximum}`);
      const hasStarted = dto.teamAScore > 0 || dto.teamBScore > 0;
      const looksFinished = event.scoreTo === 31
        ? Math.max(dto.teamAScore, dto.teamBScore) === 31
        : Math.max(dto.teamAScore, dto.teamBScore) >= event.scoreTo && (Math.abs(dto.teamAScore - dto.teamBScore) >= 2 || Math.max(dto.teamAScore, dto.teamBScore) === 30);
      let completed = false;
      if (looksFinished) {
        const validation = validateFinalScore(dto.teamAScore, dto.teamBScore, rule);
        if (!validation.valid) throw new BadRequestException(validation.message);
        completed = true;
      }

      const now = new Date();
      const updated = await tx.match.update({
        where: { id: match.id },
        data: {
          teamAScore: dto.teamAScore, teamBScore: dto.teamBScore,
          status: completed ? MatchStatus.COMPLETED : hasStarted ? MatchStatus.IN_PROGRESS : MatchStatus.SCHEDULED,
          startedAt: hasStarted ? match.startedAt ?? now : null,
          completedAt: completed ? now : null, confirmedAt: completed ? now : null,
          resultType: completed ? 'NORMAL' : null,
        },
        include: { players: { include: { participant: true } } },
      });
      const remaining = await tx.match.count({ where: { eventId, status: { notIn: [MatchStatus.COMPLETED, MatchStatus.WALKOVER, MatchStatus.CANCELLED] } } });
      if (remaining === 0 && event.status !== EventStatus.FINISHED) await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.FINISHED, finishedAt: now } });
      else if (remaining > 0 && event.status === EventStatus.FINISHED) await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.IN_PROGRESS, finishedAt: null } });
      await this.audit(tx, eventId, organizer.id, 'MATCH_SCORE_UPDATED', 'match', match.id, match, updated);
      return updated;
    });
  }

  /** 只有未计分、未开始的场次允许换人，防止已产生积分的比赛被静默改写参赛关系。 */
  async updateMatchPlayers(eventId: string, matchId: string, openid: string, dto: UpdateMatchPlayersDto) {
    const organizer = await this.identity.ensureUser(openid);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      const match = await tx.match.findFirst({ where: { id: matchId, eventId }, include: { players: { include: { participant: true } } } });
      if (!match || match.status === MatchStatus.CANCELLED) throw new NotFoundException('对阵不存在或已取消');
      if (match.status !== MatchStatus.SCHEDULED || (match.teamAScore ?? 0) !== 0 || (match.teamBScore ?? 0) !== 0) throw new ConflictException('只有未开始且未计分的场次可以调整人员');

      const shape = getMatchShape(event.matchFormat as MatchFormat);
      if (dto.teamAPlayerIds.length !== shape.teamSize || dto.teamBPlayerIds.length !== shape.teamSize) throw new BadRequestException(`每队必须选择 ${shape.teamSize} 人`);
      const allIds = [...dto.teamAPlayerIds, ...dto.teamBPlayerIds];
      if (new Set(allIds).size !== allIds.length) throw new BadRequestException('同一场比赛不能重复选择参赛者');
      const selectedParticipants = await tx.participant.findMany({ where: { eventId, id: { in: allIds }, status: ParticipantStatus.ACTIVE } });
      if (selectedParticipants.length !== allIds.length) throw new BadRequestException('只能选择该球局当前有效的参赛者');
      if (event.matchFormat === MatchFormat.MixedDoubles) {
        const genders = new Map(selectedParticipants.map((participant) => [participant.id, participant.gender]));
        for (const team of [dto.teamAPlayerIds, dto.teamBPlayerIds]) {
          if (new Set(team.map((id) => genders.get(id))).size !== 2) throw new BadRequestException('混双每队必须由一名男选手和一名女选手组成');
        }
      }

      await tx.matchPlayer.deleteMany({ where: { matchId } });
      await tx.matchPlayer.createMany({ data: [
        ...dto.teamAPlayerIds.map((participantId, position) => ({ matchId, participantId, side: MatchSide.A, position })),
        ...dto.teamBPlayerIds.map((participantId, position) => ({ matchId, participantId, side: MatchSide.B, position })),
      ] });
      const updated = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { players: { include: { participant: true } } } });
      await this.audit(tx, eventId, organizer.id, 'MATCH_PLAYERS_UPDATED', 'match', matchId, match, updated);
      return updated;
    });
  }

  async getRankings(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        participants: { where: { status: { not: ParticipantStatus.WAITLISTED } } },
        matches: { where: { status: MatchStatus.COMPLETED }, include: { players: true } },
      },
    });
    if (!event) throw new NotFoundException('球局不存在或已删除');
    const rule = scoreRuleFor(event.scoreTo);
    const rankings = calculateRankings(
      event.participants.map((participant) => participant.id),
      event.matches.flatMap((match) => match.teamAScore === null || match.teamBScore === null ? [] : [{
        id: match.id, format: event.matchFormat as MatchFormat,
        teamAPlayerIds: match.players.filter((player) => player.side === MatchSide.A).map((player) => player.participantId),
        teamBPlayerIds: match.players.filter((player) => player.side === MatchSide.B).map((player) => player.participantId),
        teamAScore: match.teamAScore, teamBScore: match.teamBScore, scoreRule: rule, resultType: 'NORMAL' as const,
      }]),
    );
    const participants = new Map(event.participants.map((participant) => [participant.id, participant]));
    return rankings.map((entry) => ({ ...entry, participant: participants.get(entry.participantId) }));
  }

  async previewWithdraw(eventId: string, participantId: string, openid: string) {
    const organizer = await this.identity.ensureUser(openid);
    await this.assertOrganizer(this.prisma, eventId, organizer.id);
    const participant = await this.prisma.participant.findFirst({ where: { id: participantId, eventId } });
    if (!participant || participant.status === ParticipantStatus.WITHDRAWN) throw new NotFoundException('参赛者不存在或已经退出');
    const affected = await this.prisma.match.findMany({ where: { eventId, status: MatchStatus.SCHEDULED, players: { some: { participantId } } }, select: { id: true, roundNumber: true, courtNumber: true } });
    return { participant, affectedMatches: affected, message: `退出后将重新生成剩余轮次，原定总轮数不变；已结束和比赛中的场次保持不变。当前受影响 ${affected.length} 场。` };
  }

  async confirmWithdraw(eventId: string, participantId: string, openid: string) {
    const organizer = await this.identity.ensureUser(openid);
    return this.redis.withLock(`withdraw:${eventId}`, () => this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      const participant = await tx.participant.findFirst({ where: { id: participantId, eventId } });
      if (!participant || participant.status === ParticipantStatus.WITHDRAWN) throw new NotFoundException('参赛者不存在或已经退出');
      await tx.participant.update({ where: { id: participantId }, data: { status: ParticipantStatus.WITHDRAWN, withdrawnAt: new Date() } });
      await tx.match.updateMany({ where: { eventId, status: MatchStatus.SCHEDULED }, data: { status: MatchStatus.CANCELLED } });
      await tx.event.update({ where: { id: eventId }, data: { scheduleVersion: { increment: 1 } } });
      await this.generateSchedule(tx, eventId, true);
      await this.audit(tx, eventId, organizer.id, 'PARTICIPANT_WITHDRAWN', 'participant', participantId, participant, null);
      return tx.event.findUniqueOrThrow({ where: { id: eventId } });
    }));
  }

  /**
   * 手动重排只替换尚未开始的场次。比赛中、待确认、有争议和已结束场次作为历史输入保留，
   * 新赛程从最后一个已锁定轮次之后继续生成，并以 event.rounds 为终点，避免重排后总轮数膨胀。
   * 取消旧赛程与生成新赛程放在同一事务和分布式锁内，任何一步失败都会整体回滚。
   */
  async regenerateMatches(eventId: string, openid: string) {
    const organizer = await this.identity.ensureUser(openid);
    return this.redis.withLock(`schedule:${eventId}`, () => this.prisma.$transaction(async (tx) => {
      const event = await this.assertOrganizer(tx, eventId, organizer.id);
      if (event.status !== EventStatus.IN_PROGRESS) throw new ConflictException('只有进行中的球局可以重新排列对阵');
      const pendingCount = await tx.match.count({ where: { eventId, status: MatchStatus.SCHEDULED } });
      if (pendingCount === 0) throw new ConflictException('当前没有可重新排列的未开始场次');
      await tx.match.updateMany({ where: { eventId, status: MatchStatus.SCHEDULED }, data: { status: MatchStatus.CANCELLED } });
      await tx.event.update({ where: { id: eventId }, data: { scheduleVersion: { increment: 1 } } });
      await this.generateSchedule(tx, eventId, true);
      const updated = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      await this.audit(tx, eventId, organizer.id, 'MATCHES_REGENERATED', 'event', eventId, { scheduleVersion: event.scheduleVersion, pendingCount }, { scheduleVersion: updated.scheduleVersion });
      return updated;
    }));
  }

  private validateCreateInput(dto: CreateEventDto) {
    const shape = getMatchShape(dto.matchFormat);
    if (dto.registrationMode === RegistrationMode.OrganizerManaged) {
      const validation = validateManualRoster(dto.participants);
      if (!validation.valid) throw new BadRequestException(validation.issues.map((item) => item.message).join('；'));
      if (validation.normalized.length < shape.playersPerMatch) throw new BadRequestException(`${formatLabel(dto.matchFormat)}至少需要 ${shape.playersPerMatch} 人`);
      if (dto.matchFormat === MatchFormat.MixedDoubles) {
        const men = validation.normalized.filter((participant) => participant.gender === 'MALE').length;
        const women = validation.normalized.filter((participant) => participant.gender === 'FEMALE').length;
        if (men !== women) throw new BadRequestException('混双录入的男女人数必须相等');
        if (dto.courtCount > Math.floor(Math.min(men, women) / 2)) throw new BadRequestException('场地数超过当前混双人数可同时进行的比赛数');
      } else if (dto.courtCount > Math.floor(validation.normalized.length / shape.playersPerMatch)) {
        throw new BadRequestException('场地数超过当前人数可同时进行的比赛数');
      }
      return validation.normalized;
    }
    if (!dto.capacity || dto.capacity < shape.playersPerMatch) throw new BadRequestException('微信报名球局必须设置有效人数上限');
    if (dto.matchFormat === MatchFormat.MixedDoubles && dto.capacity % 2 !== 0) throw new BadRequestException('混双报名人数上限必须是偶数');
    return [];
  }

  /**
   * 首次生成完整的 1～event.rounds；退出或手动重排时保留已开始/已完成的轮次，
   * 并补齐该范围内所有缺失轮次。即使用户提前计了后面的轮次，中间轮次也不会消失。
   */
  private async generateSchedule(tx: Prisma.TransactionClient, eventId: string, regenerating = false): Promise<void> {
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    const participants = await tx.participant.findMany({ where: { eventId, status: ParticipantStatus.ACTIVE }, orderBy: { joinedAt: 'asc' } });
    const shape = getMatchShape(event.matchFormat as MatchFormat);
    if (participants.length < shape.playersPerMatch) throw new BadRequestException('有效参赛人数不足，无法生成对阵');
    if (event.matchFormat === MatchFormat.MixedDoubles) {
      const men = participants.filter((participant) => participant.gender === 'MALE').length;
      const women = participants.filter((participant) => participant.gender === 'FEMALE').length;
      if (!regenerating && men !== women) throw new BadRequestException('混双开始前男女人数必须相等');
      if (men < 2 || women < 2) throw new BadRequestException('混双至少需要两名男选手和两名女选手');
      if (!regenerating && event.courtCount > Math.floor(Math.min(men, women) / 2)) throw new BadRequestException('当前男女参赛人数不足以使用所设场地数');
    }
    const locked = regenerating ? await tx.match.findMany({
      where: { eventId, status: { in: [MatchStatus.IN_PROGRESS, MatchStatus.SCORE_PENDING, MatchStatus.SCORE_DISPUTED, MatchStatus.COMPLETED, MatchStatus.WALKOVER] } }, include: { players: true },
    }) : [];
    const lockedHistory = locked.map((match) => ({
      roundNumber: match.roundNumber,
      teamAPlayerIds: match.players.filter((player) => player.side === MatchSide.A).map((player) => player.participantId),
      teamBPlayerIds: match.players.filter((player) => player.side === MatchSide.B).map((player) => player.participantId),
    }));
    const baseInput = {
      participantIds: participants.map((participant) => participant.id),
      participantGenders: Object.fromEntries(participants.map((participant) => [participant.id, participant.gender])),
      format: event.matchFormat as MatchFormat,
      courtCount: event.courtCount,
    };
    const scheduleMatches: ReturnType<typeof generateFreeRotation>['matches'] = [];
    if (!regenerating) {
      scheduleMatches.push(...generateFreeRotation({ ...baseInput, rounds: event.rounds, startRound: 1 }).matches);
    } else {
      // 不能只从“最大已锁定轮次 + 1”开始，否则用户提前计了后面轮次时，
      // 中间尚未开始的轮次会被取消却无法补回。这里逐段补齐 1～event.rounds
      // 内没有锁定比赛的所有轮次，并把较早的新场次作为后续区段的历史。
      const lockedRoundNumbers = new Set(lockedHistory.map((match) => match.roundNumber));
      let roundNumber = 1;
      while (roundNumber <= event.rounds) {
        if (lockedRoundNumbers.has(roundNumber)) { roundNumber += 1; continue; }
        const rangeStart = roundNumber;
        while (roundNumber <= event.rounds && !lockedRoundNumbers.has(roundNumber)) roundNumber += 1;
        const rangeLength = roundNumber - rangeStart;
        const history = [...lockedHistory, ...scheduleMatches].filter((match) => match.roundNumber < rangeStart);
        scheduleMatches.push(...generateFreeRotation({ ...baseInput, rounds: rangeLength, startRound: rangeStart, history }).matches);
      }
    }
    for (const seed of scheduleMatches) await tx.match.create({ data: {
      eventId, roundNumber: seed.roundNumber, courtNumber: seed.courtNumber, scheduleVersion: event.scheduleVersion,
      players: { create: [
        ...seed.teamAPlayerIds.map((participantId, position) => ({ participantId, side: MatchSide.A, position })),
        ...seed.teamBPlayerIds.map((participantId, position) => ({ participantId, side: MatchSide.B, position })),
      ] },
    } });
  }

  private async assertOrganizer(tx: Prisma.TransactionClient | PrismaService, eventId: string, userId: string) {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.deletedAt) throw new NotFoundException('球局不存在或已删除');
    if (event.organizerId !== userId) throw new ForbiddenException('仅组织者可以执行此操作');
    return event;
  }

  private async uniqueShareCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomBytes(9).toString('base64url');
      if (!await tx.event.findUnique({ where: { shareCode: code }, select: { id: true } })) return code;
    }
    throw new ConflictException('分享码生成失败，请重试');
  }

  private async audit(tx: Prisma.TransactionClient, eventId: string, actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
    await tx.auditLog.create({ data: {
      eventId, actorId, action, entityType, entityId,
      before: before === null ? undefined : JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,
      after: after === null ? undefined : JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue,
    } });
  }
}

function formatLabel(format: MatchFormat): string {
  if (format === MatchFormat.Singles) return '单打';
  if (format === MatchFormat.MixedDoubles) return '双打混双';
  return '双打';
}

function scoreRuleFor(scoreTo: number): ScoreRule {
  return scoreTo === 31
    ? { scoreTo: 31, finishRule: FinishRule.FirstTo }
    : { scoreTo: scoreTo as 11 | 15 | 21, finishRule: FinishRule.DeuceWithCap, scoreCap: 30 };
}

function filterStatuses(filter: MatchFilter): MatchStatus[] | undefined {
  if (filter === 'PENDING') return [MatchStatus.SCHEDULED, MatchStatus.SCORE_PENDING, MatchStatus.SCORE_DISPUTED];
  if (filter === 'LIVE') return [MatchStatus.IN_PROGRESS];
  if (filter === 'FINISHED') return [MatchStatus.COMPLETED, MatchStatus.WALKOVER];
  return undefined;
}








