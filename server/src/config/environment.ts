interface EnvironmentConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
}

/**
 * Local health/rules endpoints remain bootable before Docker is started, so database URLs
 * are optional only in development. Production refuses to start without both stores because
 * silently falling back to local memory would split the source of truth across processes.
 */
export function validateEnvironment(raw: Record<string, unknown>): EnvironmentConfig {
  const nodeEnv = String(raw.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Unsupported NODE_ENV: ${nodeEnv}`);
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received: ${raw.PORT}`);
  }

  const databaseUrl = optionalUrl(raw.DATABASE_URL, 'postgresql:', 'DATABASE_URL');
  const redisUrl = optionalUrl(raw.REDIS_URL, 'redis:', 'REDIS_URL');
  if (nodeEnv === 'production' && (!databaseUrl || !redisUrl)) {
    throw new Error('DATABASE_URL and REDIS_URL are required in production');
  }

  return {
    nodeEnv: nodeEnv as EnvironmentConfig['nodeEnv'],
    port,
    databaseUrl,
    redisUrl,
  };
}

function optionalUrl(value: unknown, protocol: string, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  const url = new URL(String(value));
  if (url.protocol !== protocol) throw new Error(`${name} must use ${protocol}//`);
  return url.toString();
}
