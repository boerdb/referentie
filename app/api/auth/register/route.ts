import { randomUUID } from "crypto";
import { getPool } from "@/lib/db/mysql";
import {
  hashPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/http";
import { redisConfigured } from "@/lib/redis";
import type { RowDataPacket } from "mysql2";

export async function POST(req: Request) {
  try {
    if (!redisConfigured()) {
      return jsonError("REDIS_URL is niet geconfigureerd (sessies).", 503);
    }

    const open =
      process.env.REGISTRATION_OPEN === "true" ||
      process.env.REGISTRATION_OPEN === "1";
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const name = body.name?.trim() ?? "";

    const emailErr = validateEmail(email);
    if (emailErr) return jsonError(emailErr, 400);
    const passErr = validatePassword(password);
    if (passErr) return jsonError(passErr, 400);

    const pool = getPool();
    const [countRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM users",
    );
    const userCount = Number(countRows[0]?.c ?? 0);
    if (!open && userCount > 0) {
      return jsonError("Registratie is gesloten.", 403);
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing.length > 0) {
      return jsonError("Dit e-mailadres is al geregistreerd.", 409);
    }

    const id = randomUUID();
    const role = userCount === 0 ? "admin" : "user";
    const passwordHash = await hashPassword(password);
    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [id, email, name || email.split("@")[0], passwordHash, role],
    );

    const sessionId = await createSession({
      userId: id,
      email,
      name: name || email.split("@")[0],
      role,
    });
    const res = jsonOk({ user: { id, email, name, role } });
    res.cookies.set(sessionCookieOptions(sessionId));
    return res;
  } catch (e) {
    console.error("register", e);
    return jsonError("Registreren mislukt.", 500);
  }
}
