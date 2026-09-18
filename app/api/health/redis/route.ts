import { NextResponse } from "next/server";
import { redisConfigured, redisPing } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Zelfde idee als news-app /api/health/redis */
export async function GET() {
  if (!redisConfigured()) {
    return NextResponse.json({
      configured: false,
      ok: false,
      message: "REDIS_URL niet gezet",
    });
  }

  const ok = await redisPing();
  return NextResponse.json({
    configured: true,
    ok,
    message: ok ? "Redis bereikbaar" : "Redis niet bereikbaar",
  });
}
