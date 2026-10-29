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

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Hulp</h2>
      <div className="card mt-3 divide-y divide-[var(--border)]">
        <details className="group p-5" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
            Een Word-document (.docx) met bronnen maken
            <span className="text-[var(--text-subtle)] transition group-open:rotate-90" aria-hidden>
              ›
            </span>
          </summary>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-[var(--text-muted)]">
            <p>
              Je schrijft in Word en zet op de plek van een bron een <strong>tijdelijk citaat</strong>.
              Referentie maakt daar daarna echte citaten van, in de stijl die je kiest, met een
              literatuurlijst achteraan, zoals &quot;Scan&quot; in Bookends.
            </p>
            <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-[var(--text)]">
              <li>
                <span className="font-medium text-[var(--text)]">Tijdelijk citaat kopiëren.</span> Klik
                in de bibliotheek met de rechtermuisknop op een artikel en kies{" "}
                <Kbd>Tijdelijk citaat kopiëren</Kbd>. Je krijgt dan iets als{" "}
                <Code>{"{Meyhoff 2022 #3fa9c1e2}"}</Code>. Selecteer je eerst meerdere artikelen
                (Shift- of Ctrl-klik), dan worden het er meer in één citaat:{" "}
                <Code>{"{Meyhoff 2022 #3fa9c1e2; Rhodes 2024 #a1b2c3d4}"}</Code>.
              </li>
              <li>
                <span className="font-medium text-[var(--text)]">Plakken in Word.</span> Plak het citaat
                in je tekst op de plek waar de bron moet komen, bijvoorbeeld na een zin:{" "}
                <em>Vochtbeperking lijkt veilig {"{Meyhoff 2022 #3fa9c1e2}"}.</em> Een DOI mag ook:{" "}
                <Code>{"{doi:10.1056/NEJMoa2202707}"}</Code>. Sla het document op als{" "}
                <strong>.docx</strong>.
              </li>
              <li>
                <span className="font-medium text-[var(--text)]">Opmaken.</span> Kies in de werkbalk het
                downloadicoon (Exporteren) → <Kbd>Word-manuscript opmaken…</Kbd>, of via{" "}
                <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> → <Kbd>Word-manuscript opmaken (.docx)</Kbd>. Kies je
                document, de citeerstijl (bijv. Vancouver of APA 7) en de kop van de literatuurlijst.
              </li>
              <li>
                <span className="font-medium text-[var(--text)]">Downloaden.</span> Klik op{" "}
                <Kbd>Opmaken en downloaden</Kbd>. Je krijgt een nieuw bestand, bijv.{" "}
                <em>Artikel (Vancouver (NLM)).docx</em>, met citaten als <Code>(1)</Code> of{" "}
                <Code>(Meyhoff et al., 2022)</Code> en de literatuurlijst achteraan. Een verslag toont
                hoeveel citaten en bronnen er zijn verwerkt, en welke tijdelijke citaten niet
                herkend zijn (die blijven ongewijzigd staan).
              </li>
            </ol>
            <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
              <p className="font-medium text-[var(--text)]">Goed om te weten</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>
                  <strong>Bewaar je versie met tijdelijke citaten.</strong> De citaten in het nieuwe
                  bestand zijn gewone tekst. Voeg je later bronnen toe of verschuif je tekst, maak dan
                  opnieuw op vanuit je eigen versie.
                </li>
                <li>
                  Vancouver, AMA en NEJM nummeren in de volgorde waarin je de bronnen noemt; AMA en
                  NEJM zetten de nummers in superscript.
                </li>
                <li>
                  Citaten werken in de lopende tekst, niet in voetnoten, tekstvakken of kop- en
                  voetteksten.
                </li>
                <li>
                  Je document wordt niet op de server bewaard; je krijgt alleen het opgemaakte
                  bestand terug.
                </li>
                <li>
                  Alleen een literatuurlijst nodig? Selecteer de artikelen en kies{" "}
                  <Kbd>Bibliografie kopiëren</Kbd> (rechtermuisknop of het paneel rechts), en plak
                  in Word: de opmaak gaat mee.
                </li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <footer className="mt-10 space-y-1 text-center text-xs text-[var(--text-subtle)]">
        <p className="tabular-nums">{versionLine()}</p>
        <p>{copyrightLine()}</p>
      </footer>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-px text-xs font-medium whitespace-nowrap text-[var(--text)]">
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono text-[0.8125rem] break-all text-[var(--text)]">
      {children}
    </code>
  );
}
