import {
  destroySession,
  getSessionFromRequest,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { jsonOk } from "@/lib/api/http";

export async function POST(req: Request) {
  const sessionId = req.headers.get("cookie")?.match(
    new RegExp(`${SESSION_COOKIE}=([^;]+)`),
  )?.[1];
  if (sessionId) {
    await destroySession(sessionId);
  }
  const res = jsonOk({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET() {
  return jsonOk({ message: "POST om uit te loggen." });
}
