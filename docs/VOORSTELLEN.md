# Voorstellen: Referentie richting Bookends

Stand van de code: commit `9a63a3c` (18 okt 2026). `tsc --noEmit` is schoon; `eslint` geeft 8 fouten (zie §3.4).

---

## 1. Wat Bookends anders doet — en wat we overnemen

Bookends is een desktopprogramma voor literatuurbeheer: een bibliotheek in drie panelen,
een dichte tabel in het midden, groepen en slimme groepen links, en een inspector
met tabbladen rechts. Het voelt als gereedschap: compact, snel en volledig met het toetsenbord te bedienen.

| Bookends | Referentie nu | Voorstel |
|---|---|---|
| Lijst als **tabel met sorteerbare kolommen** (auteur, jaar, titel, tijdschrift, type, toegevoegd) | Kaartjes met 2 regels titel | Tabelweergave als standaard op desktop, kaartjes alleen op de telefoon. Kolommen kiezen, sorteren en breedtes onthouden |
| **Groepen** (handmatig, genest) en **slimme groepen** (opgeslagen zoekregels) | Alleen vaste filters (status, favoriet, PDF) | Tabellen `groups` en `group_items`; slimme groep = JSON met regels (`veld`, `operator`, `waarde`), die op de server naar SQL wordt omgezet |
| Vaste bronnen: *Alle*, *Recent toegevoegd*, *Niet ingedeeld*, *Prullenbak*, *Dubbelen* | Alleen *Alle* | Toevoegen; *Prullenbak* met soft delete (`deleted_at`) in plaats van direct verwijderen |
| **Trefwoorden en kleurlabels**, beoordeling | Alleen favoriet en leesstatus | Tabel `tags` en `reference_tags`; kleurlabel (7 kleuren) als kolom in `ref_items` |
| **Referentietypen** met eigen velden (artikel, boek, hoofdstuk, congres, proefschrift, web) | Type-kolom bestaat, maar de UI kent alleen artikelen | Een veldschema per type; formulier en inspector bouwen zich op uit dat schema |
| **Alles inline bewerken** in de inspector | Alleen DOI is bewerkbaar na aanmaken | Elk veld klikbaar en bewerkbaar, auteurs als lijst die je kunt verslepen |
| **Online zoeken** (PubMed, Crossref, Google Scholar) als bron in de zijbalk | Aparte pagina `/zoeken` | Opnemen als sectie "Online" in de zijbalk, met resultaten in dezelfde tabel en een knop "Importeren" |
| **Import/export**: RIS, BibTeX, EndNote XML, PubMed (nbib) | Alleen BibTeX-export van één artikel | Import van RIS en BibTeX (ook bulk); export van selectie of groep |
| **Bibliografie in honderden stijlen** | APA/MLA/Chicago, zelf geschreven | `citeproc-js` met CSL-stijlen; voor IC/medisch in elk geval **Vancouver**, AMA en NEJM. Kopiëren als opgemaakte tekst (HTML op het klembord), dus zonder `*sterretjes*` |
| **Manuscript scannen**: tijdelijke citaten `{Jansen, 2021 #id}` in Word worden een bibliografie | — | Later: een .docx uploaden, scannen en een opgemaakte versie terugkrijgen |
| **PDF**: tekst selecteren, markeren, notities per pagina, alles samenvatten in de notities | Canvas-weergave zonder tekstlaag; highlights met de hand intypen | pdf.js-tekstlaag, selecteren → markeren (rects echt opslaan), highlights verwijderen, naar notities exporteren |
| **Volledige tekst doorzoeken** van PDF's | Zoekt alleen in titel, abstract, tijdschrift | Tekst bij upload extraheren (`extract-text.ts` bestaat al), opslaan in `attachments.fulltext` met een FULLTEXT-index |
| **Meerdere bijlagen**, automatisch hernoemen (`Auteur_Jaar_Titel.pdf`) | Eén PDF; een nieuwe upload overschrijft de oude | Meerdere bijlagen per referentie, met een naampatroon in instellingen |
| **Dubbelen vinden en samenvoegen** | — | Zoeken op DOI, PMID en genormaliseerde titel+jaar; samenvoegen met keuze per veld |
| **Retraction-waarschuwing** | — | Crossref/Retraction Watch-vlag bij het ophalen van metadata; rode badge in de lijst |
| **Meerdere items selecteren** en daarna in bulk bewerken | Eén item tegelijk | Shift/Ctrl-klik; daarna bulkacties: groep, status, label, export, verwijderen |

**Wat Referentie al beter doet dan Bookends**, en dus moet blijven: de PWA met mobiele
weergave, automatisch een open-access-PDF ophalen via DOI, kruisverwijzingen
(Crossref/OpenAlex), het opdrachtenpalet en delen via de share-sheet.

---

## 2. Professionele uitstraling

De basis is goed: CSS-variabelen, een donker thema, Geist en Source Serif. Wat het nu nog "web-app" laat voelen:

1. **Werkbalk over de volle breedte** in plaats van knoppen per paneel: links
   zijbalk-toggle en terug/vooruit, midden een zoekveld (met dropdown voor het zoekveld:
   alles / auteur / titel / volledige tekst), rechts weergave (tabel/kaart), *Nieuw*, *Delen*
   en de inspector-toggle.
2. **Dichte tabel**: 13px tekst, rijen van 28px, afwisselende rijkleur, een kopregel die blijft staan,
   jaar in `tabular-nums`, kleurlabel als stip van 8px. Een instelling "Compact / Ruim".
3. **Zijbalk als source list**: sectiekoppen (Bibliotheek, Groepen, Slimme groepen,
   Online), inklapbare driehoekjes, aantallen rechts uitgelijnd in grijs.
4. **Inspector met tabbladen**: *Info · Abstract · Notities · Bijlagen · Verwijzingen*,
   in plaats van één lange kolom met acht secties. De PDF opent als eigen weergave
   (dubbelklik of spatie, zoals Quick Look) in plaats van altijd 50% van de breedte te nemen.
5. **Panelen van versleepbare breedte**, opgeslagen in `localStorage`.
6. **Statusbalk onderaan**: "1.234 referenties · 3 geselecteerd · gesynchroniseerd".
7. **Toasts en dialogen** in plaats van `alert()`/`confirm()` (nu 25× gebruikt).
   Verwijderen verplaatst het item naar de prullenbak en toont een toast met **Ongedaan maken**.
8. **Typografie**: titels in de inspector in serif (zit er al in), de lijst volledig in sans.
   Gebruik maximaal twee gewichten in de lijst, zodat die rustig blijft.
9. **Accentkleur spaarzaam**: alleen voor selectie en de primaire knop.
   De statusbadges in de lijst worden kleine stippen of een kolom.
10. **README en login**: de README is nog de standaardtekst van create-next-app; schrijf er een echte
    README voor (wat het is, installatie, deploy). Zet op de loginpagina het product en de schermafbeelding centraal.

---

## 3. Codereview

### 3.1 Bugs

| # | Waar | Probleem | Oplossing |
|---|---|---|---|
| B1 | `lib/references/queries.ts:131` | De zoekbalk belooft "titel, auteur, DOI", maar op **auteur wordt niet gezocht** | Een `EXISTS`-subquery op `authors.family_name LIKE ?` toevoegen |
| B2 | `app/api/references/from-pdf/route.ts:94` + `lib/uploads/pdf.ts:88` | De route accepteert een `.pdf` op extensie, maar `savePdfForReference` eist `file.type === "application/pdf"`. Bij een lege MIME-type (komt voor op iOS/Android) wordt de **referentie wel aangemaakt, maar de PDF faalt** → een wees-referentie zonder PDF | In beide functies op de magic bytes controleren (gebeurt al in `savePdfBufferForReference`); de buffer die al ingelezen is direct doorgeven |
| B3 | `lib/uploads/pdf.ts:59` | Bij een nieuwe upload wordt de oude `attachments`-rij verwijderd, maar **het oude bestand blijft op schijf**. Daarnaast verdwijnen de highlights via de CASCADE | Eerst de oude `storage_path` ophalen en het bestand na de commit verwijderen; vragen of highlights mee moeten |
| B4 | `components/library/LibraryApp.tsx:130` | `load` hangt af van `selectedId` → **bij elke klik op een artikel wordt de hele lijst opnieuw opgehaald** (tot 500 items plus N+1 queries, zie P1) | `selectedId` uit de dependencies halen; het eerste item selecteren in een aparte effect of via een functionele update |
| B5 | `LibraryApp.tsx:305` | Notities worden alleen met de knop opgeslagen; **wisselen van artikel gooit niet-opgeslagen tekst weg** | Na 800 ms automatisch opslaan, plus opslaan bij wisselen of `beforeunload` |
| B6 | `app/api/references/[id]/route.ts:28` | PATCH valideert niets: een ongeldige `status` levert een MySQL-enumfout op → **500**; `type` en `year` worden niet gecontroleerd | Een schema-validatie (bijv. `zod`) voor alle request-bodies |
| B7 | `lib/cite/formats.ts` | APA 7: voor de laatste auteur hoort "&", en elke voornaam moet een initiaal krijgen (`J. P.`). De MLA-functie bouwt een string op en knipt die daarna met een regex weer af. Markdown-`*` komt mee in het geplakte citaat | CSL via `citeproc-js` (zie §1); zo verdwijnt deze hele module |
| B8 | `app/api/auth/register/route.ts:37` | Race condition: twee gelijktijdige eerste registraties worden **allebei admin** | De telling en de insert in één transactie met `SELECT … FOR UPDATE`, of een unieke "setup"-vlag |

### 3.2 Beveiliging

| # | Waar | Probleem | Oplossing |
|---|---|---|---|
| S1 | `lib/doi/oa-pdf.ts:148` | **SSRF**: `redirect: "follow"` controleert alleen de *eind*-URL. Tussenliggende redirects naar `http://192.168.x.x` worden al wel opgevraagd. De DNS-resolutie wordt ook niet gecontroleerd (een publieke hostnaam die naar 10.x wijst) | `redirect: "manual"` met een eigen lus (max. 5), elke hop door `isPublicHttpsUrl`, en het IP na `dns.lookup` controleren |
| S2 | `lib/auth/rate-limit.ts` | De login-limiet geldt alleen per e-mailadres, niet per IP → je kunt zonder limiet veel accounts proberen | Een tweede teller per IP (`x-forwarded-for` achter de proxy) |
| S3 | `public/sw.js:27` | De service worker cachet navigaties, dus ook de HTML van `/bibliotheek` met naam en e-mail. Na uitloggen blijft die op een gedeeld toestel offline beschikbaar | Bij uitloggen `caches.delete()`; persoonlijke pagina's niet cachen, alleen de shell |
| S4 | `app/api/references/[id]/pdf/route.ts:22` | `filename="${encodeURIComponent(...)}"` toont procent-codes als bestandsnaam | `filename="ascii-fallback"; filename*=UTF-8''${encodeURIComponent(name)}` |
| S5 | `lib/auth/session.ts` | Naam en rol staan in de Redis-sessie; wijzigt de rol of wordt een account verwijderd, dan blijft de sessie 14 dagen geldig | Bij elk verzoek alleen `userId` gebruiken en de rol uit de DB lezen (met cache), of sessies van een gebruiker kunnen intrekken |
| S6 | Alle POST-routes | Geen CSRF-controle naast `SameSite=Lax`. Dat is in de praktijk meestal genoeg, maar een `Origin`-check is goedkoop | Middleware die `Origin` vergelijkt met `APP_URL` bij elke niet-GET-aanvraag |

### 3.3 Prestaties en datamodel

| # | Waar | Probleem | Oplossing |
|---|---|---|---|
| P1 | `queries.ts:150` | **N+1**: per referentie een aparte query voor de auteurs (tot 501 queries per lijst) | Eén query met `WHERE reference_id IN (…)` en daarna in JS groeperen, of `JSON_ARRAYAGG` |
| P2 | `queries.ts:140` | Twee gecorreleerde subqueries per rij voor `has_pdf` en `attachment_id` | `LEFT JOIN` op een afgeleide tabel, of `attachment_count` als kolom bijhouden |
| P3 | `queries.ts:145` | `LIMIT 500` zonder melding of paginering | Paginering per pagina (cursor) plus een virtuele lijst (`@tanstack/react-virtual`) |
| P4 | `queries.ts:84` | `upsertAuthors` zonder transactie; maakt bij elke wijziging nieuwe `authors`-rijen aan en ruimt oude nooit op (de tabel groeit eindeloos, bladeren per auteur is onmogelijk) | Een transactie, auteurs ontdubbelen op (genormaliseerde) naam, wezen opruimen. Nodig voor de auteurslijst zoals in Bookends |
| P5 | `queries.ts:192` | `LOWER(r.doi) = ?` kan geen index gebruiken; geen unieke DOI per gebruiker | De DOI bij het opslaan normaliseren (lowercase) en `UNIQUE (user_id, doi)` |
| P6 | `PdfViewer.tsx` | Rendert **alle pagina's tegelijk** op canvas en laadt het document bij elke resize opnieuw → zwaar geheugengebruik bij grote PDF's op de telefoon | Het document één keer laden, pagina's lazy renderen via `IntersectionObserver`, de tekstlaag toevoegen |
| P7 | `updateReference` | Doet `getReference` → `UPDATE` → `getReference` (3 rondes plus de auteurs) | Een dynamische `SET` met alleen de meegegeven velden |

### 3.4 Codekwaliteit

- **`LibraryApp.tsx` is 1.850 regels** met ruim 30 `useState`'s. Opsplitsen in
  `Sidebar`, `ReferenceTable`, `Inspector/*`, `CommandPalette`, `AddSheet`, `ReferenceForm`
  en de data in een hook (`useLibrary`), liefst met SWR of TanStack Query (cache,
  optimistic updates voor ster en status in plaats van na elke klik de hele lijst opnieuw te laden).
- **ESLint, 8 fouten**: 6× `react-hooks/set-state-in-effect` (LibraryApp 152/157/161/166,
  CitationPanel 59, ThemeSelector 25). Die zijn op te lossen met een `key={selected.id}` op de inspector
  (de state reset dan vanzelf) of afgeleide state. Daarnaast 2× `require` in `ecosystem.config.cjs`.
  En **`public/**` ontbreekt in `globalIgnores`**, waardoor de pdf.js-worker 1.400 waarschuwingen geeft.
- **Logout via `window.location.href`**: `router.replace("/login")` plus `router.refresh()`.
- **Fetch-afhandeling herhaalt zich ~15×** (try/json/alert): een kleine `api()`-helper
  die `{ ok, data, error }` teruggeeft en een toast toont.
- **Geen tests**. Begin met unit-tests op de pure functies (`lib/doi/normalize`,
  `from-text`, `cite/formats`) via Vitest, en één Playwright-test voor login → DOI importeren.
- **Schema-migraties**: `sql/schema.sql` met `CREATE IF NOT EXISTS` werkt niet meer zodra
  de kolommen hierboven erbij komen. Neem een migratiemap op (`sql/migrations/001_…sql`) met een
  tabel `schema_migrations`, en laat `db:init` die uitvoeren.
- `scripts/__pycache__/` staat niet in `.gitignore`.

---

## 4. Voorgestelde volgorde

1. **Fundament (klein, direct merkbaar)**: B1–B6, S1, S3, P1, P2, ESLint schoon, `api()`-helper en toasts.
2. **Opsplitsen en datalaag**: componenten splitsen, TanStack Query, migraties, auteurs ontdubbelen (P4), soft delete en prullenbak.
3. **Bookends-indeling**: werkbalk, tabelweergave met kolommen, inspector met tabbladen, versleepbare panelen, statusbalk, meervoudige selectie.
4. **Organiseren**: groepen, slimme groepen, trefwoorden, kleurlabels, dubbelen.
5. **Citeren en uitwisselen**: citeproc-js met CSL (Vancouver, AMA, APA 7), RIS/BibTeX-import, export van een bibliografie per groep.
6. **PDF-werk**: tekstlaag, echte highlights, zoeken in volledige tekst, meerdere bijlagen met naampatroon.
7. **Extra**: retraction-waarschuwing, manuscript scannen (.docx), online zoeken in de zijbalk.
