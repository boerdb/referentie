"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Mislukt");
      return;
    }
    router.replace("/bibliotheek");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card-login w-full max-w-md rounded-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Referentie</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Wetenschappelijke artikelen — desktop & PWA
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          {mode === "register" && (
            <input
              className="input w-full rounded-lg px-3 py-2 text-sm"
              placeholder="Naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            required
            className="input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={8}
            className="input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-lg py-2.5 text-sm font-medium"
          >
            {loading ? "Even geduld…" : mode === "login" ? "Inloggen" : "Account aanmaken"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          {mode === "login" ? (
            <>
              Nog geen account?{" "}
              <button type="button" className="text-[var(--accent)] underline" onClick={() => setMode("register")}>
                Registreren
              </button>
            </>
          ) : (
            <>
              Al een account?{" "}
              <button type="button" className="text-[var(--accent)] underline" onClick={() => setMode("login")}>
                Inloggen
              </button>
            </>
          )}
        </p>

        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          <Link href="/api/health/redis" className="underline">
            Redis-status
          </Link>
        </p>
      </div>
    </div>
  );
}
