/**
 * Redis-test (news-app patroon):
 *   node scripts/test-redis.mjs
 *   REDIS_URL=redis://192.168.1.14:6379 node scripts/test-redis.mjs
 */
import { createClient } from "redis";

const url = process.env.REDIS_URL || "redis://192.168.1.14:6379";

async function main() {
  const client = createClient({ url });
  client.on("error", (err) => console.error("Redis error:", err.message));
  await client.connect();
  const pong = await client.ping();
  console.log("PING:", pong);
  const key = "referentie:health-check";
  await client.set(key, JSON.stringify({ ok: true, at: Date.now() }), { EX: 60 });
  const val = await client.get(key);
  console.log("SET/GET:", val);
  await client.quit();
  console.log("Redis OK:", url.replace(/:[^:@]+@/, ":****@"));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
