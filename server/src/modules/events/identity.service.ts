import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class IdentityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Local development identity is isolated behind this service. Production will replace the
   * x-dev-openid header with a verified wx.login exchange without changing event ownership
   * or draft-limit queries, because both already use the server-side User primary key.
   */
  async ensureUser(openid: string, nickname = '本地组织者') {
    return this.prisma.user.upsert({
      where: { openid },
      update: {},
      create: { openid, nickname },
    });
  }
}
