import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EventQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async get(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        participants: { orderBy: { joinedAt: 'asc' } },
        _count: { select: { participants: true, matches: true } },
      },
    });
    if (!event || event.deletedAt) throw new NotFoundException('球局不存在或已删除');
    return event;
  }
}


