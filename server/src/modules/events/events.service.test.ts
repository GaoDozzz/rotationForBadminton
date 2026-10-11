import { describe, expect, it, vi } from 'vitest';
import { MatchFormat } from '@zzjl/contracts';
import type { RedisService } from '../../cache/redis.service';
import type { PrismaService } from '../../database/prisma.service';
import type { IdentityService } from './identity.service';
import { EventsService } from './events.service';

describe('online reset, lineup and ranking regression', () => {
  it('clears previous points, persists new participants and credits only the new lineup', async () => {
    // 使用内存 Prisma 替身运行真实 EventsService，避免启动服务或修改用户的球局数据。
    const participants = Array.from({ length: 5 }, (_, index) => ({
      id: `p${index}`, participantNumber: String(index + 1), nickname: `选手${index}`, status: 'ACTIVE',
    }));
    const event = { id: 'event', organizerId: 'organizer', deletedAt: null, matchFormat: MatchFormat.Doubles, scoreTo: 21, status: 'IN_PROGRESS' };
    const match = {
      id: 'match', eventId: event.id, status: 'COMPLETED', teamAScore: 21, teamBScore: 18, startedAt: new Date(),
      players: ['p0', 'p1', 'p2', 'p3'].map((participantId, index) => ({ participantId, side: index < 2 ? 'A' : 'B', position: index % 2 })),
    };
    const tx = {
      event: {
        findUnique: vi.fn(async () => event),
        findFirst: vi.fn(async () => ({ ...event, participants, matches: match.status === 'COMPLETED' ? [match] : [] })),
        update: vi.fn(async ({ data }: { data: object }) => Object.assign(event, data)),
      },
      match: {
        findFirst: vi.fn(async () => ({ ...match })),
        update: vi.fn(async ({ data }: { data: object }) => { Object.assign(match, data); return { ...match }; }),
        count: vi.fn(async () => match.status === 'COMPLETED' ? 0 : 1),
        findUniqueOrThrow: vi.fn(async () => ({ ...match })),
      },
      participant: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => participants.filter((row) => where.id.in.includes(row.id))) },
      matchPlayer: {
        deleteMany: vi.fn(async () => { match.players = []; }),
        createMany: vi.fn(async ({ data }: { data: typeof match.players }) => { match.players = data; }),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = { ...tx, $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => operation(tx) };
    const service = new EventsService(
      prisma as unknown as PrismaService, {} as RedisService,
      { ensureUser: async () => ({ id: 'organizer' }) } as unknown as IdentityService,
    );
    expect((await service.getRankings(event.id)).find((row) => row.participantId === 'p0')?.points).toBe(3);
    await service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 0, teamBScore: 0 });
    expect(match.status).toBe('SCHEDULED');
    expect((await service.getRankings(event.id)).every((row) => row.points === 0 && row.matchesPlayed === 0)).toBe(true);
    await service.updateMatchPlayers(event.id, match.id, 'openid', { teamAPlayerIds: ['p4', 'p1'], teamBPlayerIds: ['p2', 'p3'] });
    expect(match.players.map((row) => row.participantId)).toEqual(['p4', 'p1', 'p2', 'p3']);
    await service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 21, teamBScore: 16 });
    const rankings = await service.getRankings(event.id);
    expect(rankings.find((row) => row.participantId === 'p0')?.points).toBe(0);
    expect(rankings.find((row) => row.participantId === 'p4')?.points).toBe(5);
    await service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 18, teamBScore: 21 });
    expect((await service.getRankings(event.id)).find((row) => row.participantId === 'p4')?.points).toBe(-3);
    await service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 30, teamBScore: 29 });
    expect(match.status).toBe('IN_PROGRESS');
    await service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 31, teamBScore: 30 });
    expect(match.status).toBe('COMPLETED');
    expect((await service.getRankings(event.id)).find((row) => row.participantId === 'p4')?.points).toBe(1);
    await expect(service.updateMatchScore(event.id, match.id, 'openid', { teamAScore: 32, teamBScore: 30 })).rejects.toThrow('31');
  });
});
