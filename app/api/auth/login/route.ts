import { getPool } from "@/lib/db/mysql";
import { verifyPassword, validateEmail } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
} from "@/lib/auth/rate-limit";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/http";
import { redisConfigured } from "@/lib/redis";
import type { RowDataPacket } from "mysql2";

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "user";
};

export async function POST(req: Request) {
  try {
    if (!redisConfigured()) {
      return jsonError("REDIS_URL is niet geconfigureerd (sessies).", 503);
    }

    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    const emailErr = validateEmail(email);
    if (emailErr) return jsonError(emailErr, 400);
    if (!password) return jsonError("Wachtwoord is verplicht.", 400);

    const rateKey = `login:${email}`;
    if (!(await checkLoginRateLimit(rateKey))) {
      return jsonError("Te veel pogingen. Probeer het later opnieuw.", 429);
    }

    const pool = getPool();
    const [rows] = await pool.query<UserRow[]>(
      "SELECT id, email, name, password_hash, role FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return jsonError("Ongeldige e-mail of wachtwoord.", 401);
    }

    await clearLoginRateLimit(rateKey);
    const sessionId = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    const res = jsonOk({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    res.cookies.set(sessionCookieOptions(sessionId));
    return res;
  } catch (e) {
    console.error("login", e);
    return jsonError("Inloggen mislukt.", 500);
  }
}
