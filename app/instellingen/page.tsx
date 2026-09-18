import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { ThemeSelector } from "@/components/theme/ThemeSelector";

export default async function InstellingenPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-lg p-6">
      <Link href="/bibliotheek" className="text-sm text-[var(--accent)] underline">
        ← Bibliotheek
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Instellingen</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{session.email}</p>

      <div className="panel mt-6 space-y-4 rounded-xl border p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Thema</span>
          <p className="text-xs text-[var(--text-muted)]">
            Standaard volgt de app je systeem (Windows/macOS). Kies Licht of Donker om dat vast
            te zetten.
          </p>
          <ThemeSelector variant="full" />
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Installeer deze app via het browsermenu (Installeren / Toevoegen aan startscherm) voor
          een standalone PWA op desktop of telefoon.
        </p>
      </div>
    </div>
  );
}
