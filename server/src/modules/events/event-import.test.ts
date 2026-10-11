import { describe, expect, it, vi } from 'vitest';
import { formatEventTransfer, type EventTransfer } from '@zzjl/contracts';
import type { PrismaService } from '../../database/prisma.service';
import type { RedisService } from '../../cache/redis.service';
import type { IdentityService } from './identity.service';
import { EventsService } from './events.service';

const fixture: EventTransfer = {
  version: 1, title: '周五 | 自由转', description: '地点：球馆\n请准时',
  matchFormat: 'MIXED_DOUBLES', status: 'IN_PROGRESS', courtCount: 1, rounds: 2, scoreTo: 21, capacity: 4,
  participants: [
    { participantNumber: '1', nickname: '张 | 三', gender: 'MALE', status: 'ACTIVE' },
    { participantNumber: '2', nickname: '李"四', gender: 'FEMALE', status: 'ACTIVE' },
    { participantNumber: '3', nickname: '王五', gender: 'MALE', status: 'WITHDRAWN', level: 'L3' },
    { participantNumber: '4', nickname: '赵六', gender: 'FEMALE', status: 'ACTIVE' },
  ],
  matches: [
    { roundNumber: 1, courtNumber: 1, teamA: ['1', '2'], teamB: ['3', '4'], teamAScore: 21, teamBScore: 18, status: 'COMPLETED' },
    { roundNumber: 2, courtNumber: 1, teamA: ['1', '4'], teamB: ['3', '2'], teamAScore: 0, teamBScore: 0, status: 'SCHEDULED' },
  ],
}
function setup(duplicate = false) {
  const event = { id: 'new-event', scheduleVersion: 0 };
  const tx = {
    event: {
      findFirst: vi.fn(async () => duplicate ? { id: 'existing' } : null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (_input: unknown) => event),
      findUniqueOrThrow: vi.fn(async () => event),
    },
    participant: { create: vi.fn(async ({ data }: { data: { participantNumber: string } }) => ({ id: 'new-player-' + data.participantNumber })) },
    match: { create: vi.fn(async (_input: unknown) => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const transaction = vi.fn(async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx));
  const service = new EventsService(
    { $transaction: transaction } as unknown as PrismaService,
    { withLock: async <T>(_key: string, fn: () => Promise<T>) => fn() } as unknown as RedisService,
    { ensureUser: async () => ({ id: 'current-organizer' }) } as unknown as IdentityService,
  );
  return { service, tx, transaction };
}
describe('online event import', () => {
  it('persists original matches and new identity inside one transaction', async () => {
    const { service, tx, transaction } = setup();
    await service.importEvent('openid', formatEventTransfer(fixture));
    expect(transaction).toHaveBeenCalledTimes(1);
    const eventData = tx.event.create.mock.calls[0]![0] as unknown as { data: { registrationMode: string; organizerId: string; status: string } };
    expect(eventData.data.registrationMode).toBe('ORGANIZER_MANAGED');
    expect(eventData.data.organizerId).toBe('current-organizer');
    expect(tx.participant.create).toHaveBeenCalledTimes(4);
    expect(tx.match.create).toHaveBeenCalledTimes(2);
    const match = tx.match.create.mock.calls[0]![0] as unknown as { data: { teamAScore: number; teamBScore: number; players: { create: Array<{ participantId: string }> } } };
    expect([match.data.teamAScore, match.data.teamBScore]).toEqual([21, 18]);
    expect(match.data.players.create.map((p) => p.participantId)).toEqual(['new-player-1', 'new-player-2', 'new-player-3', 'new-player-4']);
  });
  it('rejects same-name import before writing anything', async () => {
    const { service, tx } = setup(true);
    await expect(service.importEvent('openid', formatEventTransfer(fixture))).rejects.toThrow('名称');
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.match.create).not.toHaveBeenCalled();
  });
  it('rejects corrupt text before starting a transaction', async () => {
    const { service, transaction } = setup();
    await expect(service.importEvent('openid', '损坏的文字')).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
