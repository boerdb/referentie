import { createClient } from "redis";

/** Zelfde patroon als news-app: prefix + lazy connect */
const KEY_PREFIX = "referentie:";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<RedisClient> | null = null;

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

async function getClient(): Promise<RedisClient> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }

  if (client?.isOpen) return client;

  if (!connectPromise) {
    const nextClient = createClient({ url });
    nextClient.on("error", (err) => {
      console.error("[redis]", err.message);
    });
    connectPromise = nextClient.connect().then(() => {
      client = nextClient;
      return nextClient;
    });
  }

  return connectPromise;
}

function fullKey(key: string): string {
  return key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
}

export async function redisGet<T>(key: string): Promise<T | null> {
  const c = await getClient();
  const raw = await c.get(fullKey(key));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export async function redisSet(key: string, value: unknown): Promise<void> {
  const c = await getClient();
  const payload =
    typeof value === "string" ? value : JSON.stringify(value);
  await c.set(fullKey(key), payload);
}

export async function redisSetEx(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const c = await getClient();
  const payload =
    typeof value === "string" ? value : JSON.stringify(value);
  await c.set(fullKey(key), payload, { EX: ttlSec });
}

export async function redisDel(key: string): Promise<void> {
  const c = await getClient();
  await c.del(fullKey(key));
}

export async function redisIncr(key: string, ttlSec?: number): Promise<number> {
  const c = await getClient();
  const k = fullKey(key);
  const n = await c.incr(k);
  if (ttlSec !== undefined && n === 1) {
    await c.expire(k, ttlSec);
  }
  return n;
}

export async function redisPing(): Promise<boolean> {
  if (!redisConfigured()) return false;
  try {
    const c = await getClient();
    const pong = await c.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
