"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { cn } from "@/lib/utils";

export default function LoginPage() {
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
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
        credentials: "same-origin",
      });
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        setError("Onverwacht antwoord van de server.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Mislukt");
        return;
      }
      // Volledige navigatie zodat de sessiecookie zeker meekomt
      window.location.assign("/bibliotheek");
    } catch {
      setError("Geen verbinding met de server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 max-lg:px-4 max-lg:py-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-11 w-11 rounded-xl [&>svg]:h-5 [&>svg]:w-5" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {mode === "login" ? "Inloggen bij Referentie" : "Account aanmaken"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Beheer, lees en citeer je wetenschappelijke literatuur.
          </p>
        </div>

        <div className="card-login rounded-xl p-6">
          <div
            className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
            role="tablist"
          >
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={cn(
                  "rounded-md py-1.5 text-sm font-medium transition",
                  mode === m
                    ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {m === "login" ? "Inloggen" : "Registreren"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <Field label="Naam" htmlFor="name">
                <input
                  id="name"
                  autoComplete="name"
                  className="input w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="Jan Jansen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            )}
            <Field label="E-mailadres" htmlFor="email">
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input w-full rounded-lg px-3 py-2 text-sm"
                placeholder="naam@instelling.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Wachtwoord"
              htmlFor="password"
              hint={mode === "register" ? "Minimaal 8 tekens" : undefined}
            >
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="input w-full rounded-lg px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Even geduld…" : mode === "login" ? "Inloggen" : "Account aanmaken"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-subtle)]">
          <Link href="/api/health/redis" className="hover:text-[var(--text-muted)] hover:underline">
            Systeemstatus
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="text-xs text-[var(--text-subtle)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
