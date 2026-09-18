import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  redisConfigured,
  redisDel,
  redisGet,
  redisSetEx,
} from "@/lib/redis";

export const SESSION_COOKIE = "referentie_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "user";
};

function sessionRedisKey(sessionId: string): string {
  return `sess:${sessionId}`;
}

export async function createSession(
  payload: SessionPayload,
): Promise<string> {
  if (!redisConfigured()) {
    throw new Error("REDIS_URL is not set (sessies vereisen Redis)");
  }
  const sessionId = randomUUID();
  await redisSetEx(sessionRedisKey(sessionId), payload, MAX_AGE_SEC);
  return sessionId;
}

export async function destroySession(sessionId: string): Promise<void> {
  if (!redisConfigured()) return;
  await redisDel(sessionRedisKey(sessionId));
}

export async function getSessionById(
  sessionId: string,
): Promise<SessionPayload | null> {
  if (!redisConfigured()) return null;
  return redisGet<SessionPayload>(sessionRedisKey(sessionId));
}

/** Secure cookies werken niet over http:// (LAN); zet COOKIE_SECURE=true achter HTTPS. */
export function cookieSecure(): boolean {
  const flag = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "";
  if (base.startsWith("https://")) return true;
  return false;
}

export function sessionCookieOptions(sessionId: string) {
  const secure = cookieSecure();
  return {
    name: SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return getSessionById(sessionId);
}

export async function getSessionFromRequest(
  req: NextRequest,
): Promise<SessionPayload | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return getSessionById(sessionId);
}
