import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/session";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { copyrightLine, versionLine } from "@/lib/app-info";

export default async function InstellingenPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 max-lg:px-4 max-lg:pt-[max(1.5rem,env(safe-area-inset-top))] max-lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Link
        href="/bibliotheek"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Terug naar bibliotheek
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Instellingen</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Ingelogd als <span className="font-medium text-[var(--text)]">{session.email}</span>
      </p>

      <div className="card mt-8 divide-y divide-[var(--border)]">
        <section className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-sm font-semibold">Weergave</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Standaard volgt de app je systeeminstelling. Kies Licht of Donker om dat vast te
              zetten.
            </p>
          </div>
          <div className="sm:w-72">
            <ThemeSelector variant="full" />
          </div>
        </section>
        <section className="p-5">
          <h2 className="text-sm font-semibold">Installeren als app</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Installeer Referentie via het browsermenu (Installeren / Toevoegen aan startscherm)
            voor een losse app op desktop of telefoon.
          </p>
        </section>
      </div>

      <footer className="mt-10 space-y-1 text-center text-xs text-[var(--text-subtle)]">
        <p className="tabular-nums">{versionLine()}</p>
        <p>{copyrightLine()}</p>
      </footer>
    </div>
  );
}
