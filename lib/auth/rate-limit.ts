import { redisConfigured, redisDel, redisIncr } from "@/lib/redis";

const WINDOW_SEC = 15 * 60;
const MAX_ATTEMPTS = 8;

export async function checkLoginRateLimit(key: string): Promise<boolean> {
  if (!redisConfigured()) return true;
  const count = await redisIncr(`ratelimit:${key}`, WINDOW_SEC);
  return count <= MAX_ATTEMPTS;
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  if (!redisConfigured()) return;
  await redisDel(`ratelimit:${key}`);
}

const DOI_WINDOW_SEC = 60;
const DOI_MAX = 30;

export async function checkDoiRateLimit(userId: string): Promise<boolean> {
  if (!redisConfigured()) return true;
  const count = await redisIncr(`doi:${userId}`, DOI_WINDOW_SEC);
  return count <= DOI_MAX;
}
