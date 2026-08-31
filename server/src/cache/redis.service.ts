import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClientType;
  private connecting?: Promise<unknown>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = createClient({
      url: config.get<string>('redisUrl') ?? 'redis://zzjl_app:unconfigured@127.0.0.1:6379',
    });
    this.client.on('error', () => {
      // Connection errors are surfaced to the current operation. Avoid logging passwords
      // embedded in a Redis URL or producing duplicate logs for every reconnect attempt.
    });
  }

  /**
   * Runs a critical section under a short Redis lease. The random token and compare-delete
   * script prevent one request from releasing a newer request's lock after its lease expires.
   * Durable correctness still comes from PostgreSQL constraints and transactions; Redis only
   * reduces duplicate work during rapid taps or simultaneous organizer actions.
   */
  async withLock<T>(key: string, work: () => Promise<T>, ttlMs = 10_000): Promise<T> {
    await this.ensureConnected();
    const token = randomUUID();
    const lockKey = `zzjl:lock:${key}`;
    const acquired = await this.client.set(lockKey, token, { NX: true, PX: ttlMs });
    if (!acquired) throw new Error('操作正在处理中，请稍后重试');
    try {
      return await work();
    } finally {
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [lockKey], arguments: [token] },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isReady) return;
    this.connecting ??= this.client.connect().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
  }
}
