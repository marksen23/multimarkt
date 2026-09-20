# Multi-Marktplatz Produkt-Listing-App — Plan

> **Wichtiger Hinweis zur Verlässlichkeit einzelner Angaben:** Bei den
> Abschnitten zu konkreten Marktplatz-APIs (Verfügbarkeit, Limits,
> Freigabeprozesse, Gebühren) gebe ich meinen Kenntnisstand wieder, der
> veraltet oder unvollständig sein kann — API-Programme, Gebührenmodelle
> und Freigabe-Voraussetzungen ändern sich häufig und ohne Ankündigung.
> Überall dort, wo ich unsicher bin, kennzeichne ich das explizit als
> Vermutung bzw. als "zu verifizieren". Vor dem Start der Umsetzung muss
> jede Marktplatz-Integration gegen die aktuelle offizielle
> Entwickler-Dokumentation des jeweiligen Anbieters geprüft werden — dieser
> Plan ersetzt das nicht.

---

## 1. Vision

Eine App, mit der ein Verkäufer (Privatperson oder kleiner Händler) **ein
Produkt einmal fotografiert und beschreibt** und die App daraus automatisch
**passende Anzeigen für mehrere Online-Marktplätze gleichzeitig erstellt und
veröffentlicht** — inklusive KI-gestützter Bildanalyse, Text- und
Titel-Generierung, marktplatzspezifischer Formatierung (Bildgrößen,
Zeichenlimits, Kategorie-Zuordnung, Pflichtfelder) und automatischem
Publishing über die jeweiligen Schnittstellen.

**Kernversprechen:** Aus "ein Foto + ein paar Stichworte" wird in wenigen
Minuten eine vollständige, marktplatzoptimierte Anzeige auf mehreren
Plattformen gleichzeitig — statt das Produkt manuell 3–5 Mal in
unterschiedliche Formulare einzutragen.

---

## 2. Zielgruppe & Nutzungsszenarien

- **Privatverkäufer** (Kleiderschrank ausmisten, Second-Hand, Umzug):
  wollen mit minimalem Aufwand maximale Reichweite über mehrere
  Kleinanzeigen-/Second-Hand-Plattformen.
- **Kleine/mittlere Online-Händler** (Etsy-Shops, kleine Amazon/eBay-
  Seller): wollen ihr Sortiment über mehrere Vertriebskanäle gleichzeitig
  pflegen, ohne jeden Kanal einzeln zu bespielen.
- **Resale-/Vintage-Händler**: hohe Stückzahl, hohe Foto-Frequenz,
  brauchen Tempo pro Listing.

**Kernschmerzpunkt, den die App löst:** Cross-Listing ist heute überwiegend
manuelle Fleißarbeit (Copy-Paste in mehrere Formulare, unterschiedliche
Bildzuschnitte, unterschiedliche Kategoriebäume) — dazu kommt fehlende
Synchronisation (verkauft auf Plattform A, aber Anzeige auf B/C/D bleibt
sichtbar → Doppelverkäufe, Reklamationen).

---

## 3. Kern-User-Journey

1. **Foto-Erfassung**: Nutzer fotografiert das Produkt (mehrere Fotos,
   idealerweise mit Vorgaben: Hauptmotiv, Detail, Etikett/Größe, Mängel).
2. **KI-Bildanalyse**: App erkennt automatisch
   - Produktkategorie (z. B. "Damen-Jacke", "Kaffeemaschine", "Sofa")
   - relevante Attribute (Marke/Logo falls erkennbar, Farbe, Material,
     ggf. Größe/Modellbezeichnung aus Etikett-Foto via OCR)
   - sichtbaren Zustand (neuwertig / gebraucht / Mängel wie Flecken,
     Kratzer — als Vorschlag, nicht als verbindliche Zusicherung)
   - schneidet/optimiert Bilder automatisch zu (Freistellen,
     Weißabgleich, Zuschnitt je nach Marktplatzvorgabe)
3. **Zustandsabfrage (bestätigend, nicht nur Vorschlag)**: Nutzer bestätigt
   oder korrigiert den von der KI vorgeschlagenen Zustand über eine feste
   Auswahl (z. B. Neu / Wie neu / Gut / Gebraucht / Defekt) — dieser Wert
   ist die verbindliche Grundlage sowohl für den Anzeigentext als auch für
   die Preisrecherche im nächsten Schritt (siehe Abschnitt 9d).
4. **Automatischer Anzeigen-Entwurf inkl. Preisrecherche**: App generiert
   - Titel (marktplatzspezifisch, inkl. Zeichenlimit)
   - Beschreibungstext (Tonalität je Plattform: sachlich/SEO-orientiert
     für Amazon/Etsy, persönlicher für Kleinanzeigen-Plattformen)
   - Kategorie-Zuordnung je Marktplatz-Taxonomie
   - **Preisvorschlag aus Marktvergleich**: die App sucht aktive/verkaufte
     Vergleichsangebote zu Kategorie + Attributen, filtert sie nach dem in
     Schritt 3 bestätigten Zustand (Neu-Preise und Gebraucht-Preise werden
     nie vermischt) und zeigt eine Preisspanne mit Median statt einer
     einzelnen Scheinzahl — Details, Datenquellen und Grenzen dazu in
     Abschnitt 9d.
5. **Review & Freigabe durch den Nutzer** (wichtig — siehe Abschnitt 13:
   rechtlich muss der Verkäufer die Angaben bestätigen, keine
   Blindveröffentlichung von KI-Text ohne Prüfung, insbesondere bei
   Zustandsangaben/Mängeln).
6. **Auswahl der Zielmarktplätze** pro Listing (nicht jedes Produkt passt
   auf jede Plattform — z. B. Möbel eher lokal/Kleinanzeigen, Mode eher
   Vinted/eBay/Etsy).
7. **Publishing**: App schickt die formatierte Anzeige über die jeweilige
   API/Schnittstelle an die ausgewählten Marktplätze.
8. **Status-Dashboard**: zentrale Übersicht aller Listings über alle
   Plattformen — online/Entwurf/Fehler/verkauft.
9. **Cross-Sync bei Verkauf**: wird ein Artikel auf einer Plattform als
   verkauft markiert, werden die übrigen Listings automatisch deaktiviert
   bzw. auf "reserviert/verkauft" gesetzt (End-to-End nur dort möglich, wo
   die API das unterstützt oder der Verkäufer den Verkauf manuell
   bestätigt).

---

## 3a. Orchestrierungs-Ablauf (Ende-zu-Ende, konkret)

Die User-Journey oben beschreibt das Erlebnis aus Nutzersicht. Dieser
Abschnitt beschreibt, **wie die Prozesse aus den Abschnitten 9/10/10a
technisch orchestriert werden** — als konkreter Ablaufgraph mit
Abhängigkeiten, nicht als lose Liste von Features. Vorgabe war: möglichst
kluge Entscheidungen bei Produktpräsentation UND Vertriebsweg-Evaluation
(Plattform, Preis), Produktrecherche eingeschlossen, alles sinnvoll
orchestriert — Trigger ist immer ein oder mehrere Fotos, danach befragt
ein Assistent den Nutzer, dann laufen die Prozesse, am Ende steht ein
Ergebnis samt offener Handlungsschritte.

### Stufe 0 — Sofort-Analyse (synchron, noch vor jeder Nutzerfrage)

Läuft automatisch, sobald die Fotos hochgeladen sind, **bevor** der
Assistent irgendetwas fragt. Ziel: so viel wie möglich aus dem Bild
selbst ableiten, damit das Interview in Stufe 1 nur nach dem fragt, was
sich aus dem Foto nicht sicher ergibt — nicht bei null anfangen.

1. Kategorie-/Attribut-Schätzung durch das multimodale Modell (9a).
2. Google Cloud Vision Web Detection für Marke/Modell (9a-1) — nur
   aufgerufen, wenn die multimodale Schätzung dafür eine niedrige
   Konfidenz meldet (spart die 3,50-$/1.000-Kosten bei eindeutigen Fällen).
3. Barcode-Scan + Lookup (9a-1), falls ein Barcode im Bild erkennbar ist.

**Ergebnis:** ein "Produktprofil-Entwurf" — jedes Feld (Kategorie, Marke,
Material, Farbe, Zustand, Maße …) trägt einen Konfidenzwert
(hoch/mittel/niedrig/fehlend). Dieser Konfidenzwert steuert direkt, was
in Stufe 1 gefragt wird.

### Stufe 1 — Assistenten-Interview (adaptiv, nur zu offenen Punkten)

Der Assistent fragt **nicht alles neu ab**, sondern arbeitet eine feste
Prioritätsliste ab und überspringt jeden Punkt, der aus Stufe 0 bereits
mit hoher Konfidenz feststeht (der wird nur zur Bestätigung mit
angezeigt, nicht aktiv erfragt):

1. **Zustandsbestätigung** — immer Pflicht, unabhängig von der
   Bild-Konfidenz (siehe Abschnitt 13: der Nutzer muss das aktiv
   bestätigen, das darf nie automatisch durchlaufen).
2. **Fehlende Pflichtattribute** für die wahrscheinlichste Zielkategorie
   — welche das sind, ergibt sich aus der Kategorie-Mapping-Tabelle
   (9c: "Pflichtattribute" pro Zielkategorie), nur die tatsächlich
   fehlenden werden nachgefragt.
3. **Marke/Modell-Bestätigung** — nur falls Stufe 0 dafür niedrige
   Konfidenz gemeldet hat.
4. **Logistik-Frage**: versandfähig oder nur Abholung? Steuert direkt
   den Eignungsfilter (10a) — z. B. schließt "nur Abholung" reine
   Versand-Plattformen aus.
5. **Optional: eigene Preisvorstellung/Mindestpreis** — eine Leitplanke
   für die Preisrecherche (9d), ersetzt sie aber nicht.
6. **Zielregion/PLZ** — nur falls für lokale Plattformen relevant
   (Kleinanzeigen-Umkreissuche, nebenan.de-Adressverifikation aus 4b).

Diese Reihenfolge ist bewusst so priorisiert: rechtlich/strukturell
zwingende Punkte (1, 4) zuerst, optionale Komfort-Punkte (5) zuletzt —
der Nutzer kann das Interview nach Punkt 4 auch abbrechen und die App
macht mit den bis dahin vorliegenden Informationen weiter.

### Stufe 2 — Orchestrierte Parallel-Pipeline (nach Interview-Abschluss)

Die in 9/10/10a beschriebenen Prozesse laufen jetzt als **Abhängigkeits-
graph**, nicht sequenziell hintereinander — das minimiert Wartezeit für
den Nutzer, weil unabhängige Prozesse gleichzeitig laufen:

```
                    [Bestätigtes Produktprofil
                     aus Stufe 0 + 1]
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
     Kategorie-Mapping   Preisrecherche   Bildaufbereitung
         (9c)                (9d)              (9a)
              │               │             (läuft komplett
              ▼               │              unabhängig nebenher)
     Eignungsfilter ◄─────────┘
    (Marktplatz-Evaluation,
           10a)
              │
              ▼
   ENV-Berechnung + Tier-
      Zuteilung (10a)
              │
              ▼
     Text-Generierung (9b)
  (nutzt Kategorie + Zustand +
   Preisvorschlag als Kontext)
              │
              ▼
    Review-Entwurf pro
    Tier-0-Plattform
```

**Warum genau diese Reihenfolge/Parallelisierung:**

- **Preisrecherche (9d) und Bildaufbereitung (9a) sind unabhängig von
  der Marktplatz-Auswahl** — sie brauchen nur Kategorie/Zustand bzw. die
  rohen Fotos, nicht das Ergebnis des Eignungsfilters. Deshalb laufen
  sie parallel zum Eignungsfilter statt danach.
- **Der Eignungsfilter (10a) braucht** das Kategorie-Mapping-Ergebnis
  (welche Plattform passt strukturell) **plus** die Logistik-Antwort aus
  dem Interview.
- **Die ENV-Berechnung/Tier-Zuteilung (10a) ist ein Synchronisations-
  punkt** — sie braucht sowohl das Eignungsfilter-Ergebnis (welche
  Plattformen überhaupt zulässig sind) als auch die Preisrecherche
  (`netPrice`-Schätzung für die Formel) und kann deshalb erst starten,
  wenn beide Zweige fertig sind.
- **Die Text-Generierung (9b) kommt bewusst zuletzt**, weil sie von der
  Zielplattform (unterschiedliche Tonalität je Plattform, siehe 9b) und
  vom Preisvorschlag (als optionaler Talking Point im Text) abhängt —
  sie vor der Plattform-/Preisentscheidung laufen zu lassen würde
  bedeuten, den Text hinterher wieder anzupassen.

**Technische Umsetzung:** passt direkt zur Job-Queue-Wahl aus Abschnitt 7
(Redis + BullMQ) — dieser Graph lässt sich eins-zu-eins als **BullMQ
Flow** abbilden (Parent-Child-Job-Abhängigkeiten): Preisrecherche und
Bildaufbereitung sind parallele Kindjobs, die ENV-Berechnung ist ein
Parent-Job, der automatisch wartet, bis seine Kindjobs abgeschlossen
sind, bevor er startet. Das erspart eine selbstgebaute
Orchestrierungslogik für genau dieses Muster.

### Stufe 3 — Ergebnis-Präsentation (inklusive offener Handlungsschritte)

Der Nutzer bekommt am Ende **nicht nur den fertigen Text**, sondern zwei
getrennte Blöcke:

1. **Pro Tier-0-Plattform ein fertiger Entwurf** (Titel, Beschreibung,
   Preisvorschlag mit Quellenangabe aus 9d, zugeschnittene Bilder,
   Kategorie-Zuordnung) — zur Freigabe, wie in der User-Journey Schritt 5
   beschrieben.
2. **Eine explizite "Was du noch tun musst"-Liste** — alles, was die App
   bewusst NICHT automatisch übernimmt:
   - KI-Vorschläge prüfen und bestätigen (Pflichtschritt, Abschnitt 13 —
     insbesondere Zustandsangaben).
   - Preisvorschlag bestätigen oder anpassen.
   - Bei Formatierungs-Hilfe-Plattformen (z. B. Kleinanzeigen.de): Text
     und Bilder manuell dort einstellen — die App bereitet vor, trägt
     aber nicht selbst ein (siehe 4b/4d, kein automatisierter Zugriff).
   - Falls der eBay-Production-API-Zugang noch nicht eingerichtet ist:
     als offener technischer Schritt markiert (siehe Abschnitt 15,
     Phase 0), nicht stillschweigend übersprungen.
   - Falls rechtliche Pflichtangaben fehlen (Grundpreis, Textil-
     kennzeichnung — Abschnitt 13): explizit als offene Lücke gezeigt,
     nie automatisch erfunden oder ausgefüllt.
   - Nach einem Verkauf: bei Plattformen ohne API-Statusrückmeldung
     manuell als verkauft markieren/löschen (Abschnitt 11).

Diese Liste ist bewusst der zentrale Abschluss jedes Durchlaufs — sie
macht sichtbar, was die App tatsächlich automatisiert hat und was beim
Menschen bleibt, statt den falschen Eindruck einer Vollautomatisierung
zu erzeugen, die es (gerade bei den API-losen Plattformen) technisch gar
nicht geben kann.

---

## 4. Marktplatz-Machbarkeitsanalyse (zentrale Weichenstellung)

Das ist der wichtigste Abschnitt für die Produktentscheidung, denn **nicht
jeder wünschenswerte Marktplatz bietet eine offizielle API für
Drittanbieter-Listing-Automatisierung**. Das bestimmt maßgeblich, was
technisch und rechtlich überhaupt machbar ist.

### 4a. Plattformen mit offiziellen Verkäufer-/Listing-APIs (web-verifiziert, Stand September 2026)

**Update:** Die folgenden Angaben wurden — anders als der ursprüngliche
Plan-Entwurf — durch eine gezielte Web-Recherche mit Quellenbelegen
verifiziert bzw. korrigiert. Wo eine Aussage nur über Sekundärquellen
(nicht die offizielle Entwicklerdoku direkt) bestätigt werden konnte,
ist das vermerkt.

- **eBay** — Aktuelle API-Familie: **Sell APIs** (Inventory API,
  Fulfillment API, Account API, Marketing API, Finances API), RESTful,
  OAuth-basiert. **Sandbox-Zugang ist sofort und ohne Prüfung verfügbar**;
  für **Production** ist ein Antrag mit Geschäftsmodell-Beschreibung
  nötig, zusätzlich technische Pflicht: ein Account-Deletion-Notification-
  Endpoint. Ob **Privatpersonen ohne Gewerbe** routinemäßig Production-
  Zugang erhalten, ist **nicht dokumentiert und nicht verifizierbar** —
  ein konkreter Community-Support-Thread mit genau dieser Frage blieb
  unbeantwortet. Indiz dafür, dass es grundsätzlich möglich ist: bekannte
  Cross-Listing-Tools (Vendoo, List Perfectly) nutzen die Sell APIs im
  Auftrag privater/kleiner Verkäufer.
  **Gebühren eBay.de für Privatverkäufer, direkt von der offiziellen
  Hilfeseite:** 320 kostenlose Angebote/Monat, danach 0,50 € pro
  zusätzlichem Angebot; **Verkauf innerhalb Deutschlands ist für
  Privatverkäufer komplett provisionsfrei** (keine Verkaufsprovision).
  Quelle: [eBay.de Verkaufsgebühren](https://www.ebay.de/help/selling/fees-credits/selling-fees?id=4364),
  [eBay Developers Program](https://developer.ebay.com/join/).
- **Etsy** — Aktuelle API: **Open API v3** (Listings über
  `createDraftListing`/`updateListing`, Scope `listings_w`).
  **Registrierung ist self-service und für Seller-Apps "within minutes"
  ohne manuelle Review-Queue freigegeben** — die mit Abstand niedrigste
  Einstiegshürde der drei API-Plattformen. Standard-Rate-Limit: 10.000
  Requests/Tag. **Vintage-Regel bestätigt: mindestens 20 Jahre alt**
  (2026 also Baujahr 2006 oder früher), "vintage-inspiriert" zählt
  ausdrücklich nicht. Gebühren: 0,20 USD Einstellgebühr + 6,5 %
  Transaktionsgebühr + ca. 3 % + 0,25 Zahlungsabwicklung (die exakte
  Zahlungsabwicklungsgebühr für Deutschland/EUR ließ sich nicht direkt
  von der offiziellen Etsy-Gebührenseite bestätigen, nur über
  Sekundärquellen). Quelle:
  [developer.etsy.com – Authentication/Scopes](https://developer.etsy.com/documentation/essentials/authentication/),
  [developer.etsy.com – Rate Limits](https://developer.etsy.com/documentation/essentials/rate-limits/),
  [Etsy Vintage-Richtlinie](https://www.etsy.com/legal/policy/vintage-items-on-etsy/242665563649).
- **Amazon** — Aktuelle API: **Selling Partner API (SP-API)** inkl.
  Listings Items API. **Entscheidender, direkt aus der offiziellen
  Amazon-Doku bestätigter Befund: "Only Professional Selling Accounts
  can register to develop or integrate with Selling Partner API.
  Individual accounts are not eligible."** Das heißt: SP-API-Zugang
  erfordert **zwingend** den kostenpflichtigen Professional-Plan
  (39 €/Monat zzgl. USt., unabhängig vom Umsatz) — der günstigere
  Individual-Plan (0,99 €/Artikel, kein Fixbetrag, gedacht für genau die
  hier relevanten Gelegenheits-Privatverkäufer) **hat gar keinen
  API-Zugang**. Zusätzlich bei bestimmten Rollen (PII-Zugriff) ein
  Architektur-Review durch Amazons Solutions-Architecture-Team nötig.
  **Konsequenz für diesen Plan**: Amazon SP-API ist damit nicht nur
  "streng", sondern für das Zielprofil "breite, private Gebrauchtware"
  strukturell unpassend — ein Nutzer müsste für die Anbindung auf das
  Profi-Konto wechseln und damit genau den Kostenvorteil aufgeben, den
  Amazon für Gelegenheitsverkäufer sonst bietet. Das bestätigt und
  verschärft die bereits in Abschnitt 4e getroffene Entscheidung, Amazon
  für den MVP nicht vorzusehen. Quelle:
  [developer.amazonservices.com – Getting Started for Private Developers](https://developer.amazonservices.com/start/getting-started-for-private-developers)
  (Primärquelle, direkt bestätigt), [SP-API Registration Overview](https://developer-docs.amazon/sp-api/docs/sp-api-registration-overview),
  [sell.amazon.de/preisgestaltung](https://sell.amazon.de/preisgestaltung).
- **Shopify** (falls Nutzer einen eigenen Shop betreiben) — offene
  Admin-API, sehr gut dokumentiert, kein Sonderfreigabeprozess für Standard-
  Nutzung nötig. (Nicht vertieft recherchiert — für die Zielrichtung aus
  4e ohnehin nicht MVP-relevant, da kein eigener Shop vorausgesetzt wird.)
- **WooCommerce/eigene Shopsysteme** — REST-API standardmäßig vorhanden.
  (Ebenfalls nicht vertieft recherchiert, siehe oben.)
- Einzelne größere Marktplätze mit explizitem "Marketplace/Partner API"-
  Programm (z. B. Otto Market, Kaufland.de Marketplace, Real.de,
  Check24-artige Marktplätze) bieten in der Regel API-Zugänge **speziell
  für gewerbliche Händler mit Vertrag**, nicht für Privatverkäufer. Nicht
  Teil dieser Recherche-Runde — weiterhin ungeprüft.

### 4b. Plattformen ohne öffentliche Listing-API für Drittanbieter (web-verifiziert, Stand September 2026)

**Update:** Web-recherchiert und mit Quellen belegt — mehrere Details
korrigieren oder schärfen den ursprünglichen, nicht-recherchierten Stand.

- **Kleinanzeigen.de (vormals eBay Kleinanzeigen)** — **Keine offizielle
  API bestätigt.** Die Nutzungsbedingungen verbieten automatisierten
  Zugriff **ausdrücklich**: „§5 Nr. 1: ohne die ausdrückliche schriftliche
  Zustimmung von Kleinanzeigen Crawler, Spider, Scraper oder andere
  automatisierte Mechanismen zu nutzen, um auf die Kleinanzeigen-Dienste
  zuzugreifen und Inhalte zu sammeln." Zusätzlich technisch abgesichert
  über Bot-Erkennung (Akamai). **Reichweite (offizielle Werbeseite):
  36,25 Mio. monatlich aktive Nutzer**, 62 % Reichweite unter deutschen
  Onlinern. **Gebühren privat: kostenlos bis zu Freikontingenten** (z. B.
  100 Anzeigen/30 Tage in Konsumgüter/Services/Jobs), danach 1,99 € pro
  weitere Anzeige; ab 21.05.2026 zusätzlich eine Pflichtgebühr von
  9,99 € für Artikel ab 45.000 €. Existierende inoffizielle
  Reverse-Engineering-Projekte (z. B. GitHub `tejado/ebk-client`) sind
  Scraper-basiert, nicht autorisiert. Quelle:
  [Nutzungsbedingungen Kleinanzeigen](https://themen.kleinanzeigen.de/nutzungsbedingungen/),
  [themen.kleinanzeigen.de/advertising](https://themen.kleinanzeigen.de/advertising/),
  [hilfe.kleinanzeigen.de – Gebühren](https://hilfe.kleinanzeigen.de/hc/de/articles/17087642921628-Geb%C3%BChren-bei-Kleinanzeigen).
- **Vinted** — Es gibt eine API ("Vinted Pro Integrations": Items/
  Webhooks/Orders-API), aber **strikt auf eine Allowlist beschränkt und
  an einen Vinted-Pro-Account gebunden** — kein offenes Self-Service-
  Entwicklerportal für normale Verkäufer. **Gebührenmodell bestätigt**:
  der **Käufer** zahlt die Käuferschutzgebühr (ca. 5 % + fixer Betrag),
  der Verkäufer erhält den vollen Listenpreis ohne Provisionsabzug. AGB
  verbieten "external software tools including bots, scraping programs,
  crawling programs, and spiders" ohne ausdrückliche Autorisierung.
  Quelle: [ScrapeBadger – Vinted API 2026](https://scrapebadger.com/blog/vinted-api-best-scraping-apis-compared-for-2026),
  [Voolist – Vinted Fees 2026](https://www.voolist.com/blog/vinted-fees-2026),
  [Vinted Terms and Conditions](https://www.vinted.com/old-terms-and-conditions)
  (AGB-Formulierung paraphrasiert, nicht wortgetreu zitiert — direkter
  Volltext-Abruf war technisch nicht möglich).
- **Facebook/Meta Marketplace** — Es existieren zwei Meta-APIs
  (Marketplace Partner Seller API, Marketplace Partner Item API), beide
  aber **reine B2B-Katalog-Tools für ein "invite-only" Commerce-Partner-
  Programm** — keine Lösung für normale private Kleinanzeigen, Meta
  sperrt sogar Verkäufer, die "wie ein Unternehmen" über den normalen
  Consumer-Marketplace verkaufen. Meta hat im Juli 2026 eine eigene
  KI-gestützte "Seller"-App für Marketplace-Verkäufer gelauncht — ein
  Eigenausbau, kein Signal für künftige Drittanbieter-Öffnung. Quelle:
  [developers.facebook.com – Seller API](https://developers.facebook.com/docs/marketplace/partnerships/sellerAPI/),
  [Meta Commerce Partners](https://www.facebook.com/business/marketing-partners/become-a-partner/commerce),
  [about.fb.com – Seller-App Juli 2026](https://about.fb.com/news/2026/07/introducing-seller-app-facebook-marketplace/amp/).
- **Realitäts-Check über etablierte Cross-Listing-Tools**: Vendoo, List
  Perfectly und Crosslist unterstützen Vinted und Facebook Marketplace —
  aber alle explizit über **Browser-Extension-Automatisierung**, nicht
  offizielle APIs, und **keines der drei unterstützt Kleinanzeigen.de**.
  Bestätigt: selbst finanzierte, etablierte Marktteilnehmer landen beim
  selben AGB-widrigen Weg wie in Abschnitt 4d beschrieben. Quelle:
  [Crosslist.com](https://crosslist.com/),
  [Vendoo Help Center](https://help.vendoo.co/en/articles/6260300-which-marketplaces-does-vendoo-support).
- **Marktplaats (NL), willhaben (AT)**: nicht Teil dieser Recherche-Runde
  — weiterhin ungeprüft.

**Weitere deutschlandweite Gebrauchtwaren-/Kleinanzeigen-Portale
(web-verifiziert):**

| Plattform | Warenfokus | Reichweite | Kosten für Verkäufer | API? |
|---|---|---|---|---|
| markt.de | breit | deutschlandweit, ~29–38 Mio. Visits/Monat (Schätzungen divergieren) | privat kostenlos, Hervorhebungen/Immobilien-Vermietung kostenpflichtig | keine gefunden |
| Quoka.de | breit | deutschlandweit, keine verlässliche Zahl gefunden | Grundinserat kostenlos, Premium/VIP/Auto-Push kostenpflichtig | keine offizielle gefunden |
| meinestadt.de (Marktplatz) | — | **vermutlich faktisch eingestellt**: Kleinanzeigen-Subdomain leitet auf Jobs-Bereich um, tritt inzwischen nur noch als Reseller-Partner von Kleinanzeigen.de auf | nicht bewertbar | nicht bewertbar |
| nebenan.de (Marktplatz) | breit, nachbarschaftsbezogen | deutschlandweit, aber **strukturell hyperlokal** (Sichtbarkeit an Wohnadresse/Radius gebunden, adressverifiziert) | kostenlos, nicht-kommerziell | keine gefunden |
| Kalaydo.de | breit | **Kleinanzeigenbereich weiterhin regional** (Rheinland-Kern) — Jobbereich mittlerweile bundesweit beworben, das ist neu ggü. dem alten Stand | viele Kleinanzeigen kostenlos | keine gefunden |
| Locanto.de | breit | deutschlandweit, Großstadt-Fokus, keine aktuelle DE-Nutzerzahl auffindbar | laut Eigenwerbung kostenlos | keine gefunden |
| Hood.de | breit, eBay-Alternative | deutschlandweit, keine verlässliche Nutzerzahl gefunden | **keine** Einstell-/Verkaufsgebühr für Privatverkäufer, kostenpflichtige Zusatzoptionen; Provisionsänderung zum 01.04.2026 angekündigt (Details ungeprüft) | **Ja — offizielle API vorhanden** (korrigiert den ursprünglichen Stand), genutzt von Billbee/brickfox/JTL-Wawi; ggf. an "Platinum Shop" gebunden |
| Shpock (neu recherchiert) | breit | deutschlandweit | **seit 2024 Abo-Pflicht ab 0,99 €/Monat, auch für Gelegenheitsverkäufer** — anderes Modell als die übrigen | keine gefunden |

Für meinestadt.de gilt: **vor einer festen Planung direkt beim Anbieter
verifizieren**, ob überhaupt noch eigene Inserate möglich sind — nicht
als Zielportal einplanen, solange das unklar ist. Für nebenan.de gilt:
architektonisch relevant, da die hyperlokale Sichtbarkeit nicht zum
"einmal veröffentlichen, überall sichtbar"-Modell passt, sondern eigene
Adresslogik bräuchte.

**Fee-Nuance, die für "gebührenfrei" wichtig ist:** bei den meisten
dieser Portale ist nicht das *Inserieren* die Kostenquelle, sondern
optionale bezahlte Sichtbarkeits-Boosts — das Grund-Anzeige-Schalten ist
bei den meisten hier gelisteten kostenlos, **Shpock ist die bestätigte
Ausnahme** (Abo-Pflicht). **Vinted** bleibt der beste Treffer für den
"gebührenfrei"-Wunsch: der Käufer trägt die Schutzgebühr, nicht der
Verkäufer.

**Ankaufsdienste statt Listing (web-verifiziert, mit Korrektur):** Für
Bücher, Medien, Elektronik und Smartphones funktionieren solche Dienste
strukturell anders — kein Anzeigen-Listing, sondern ein sofortiges
algorithmisches Ankaufsangebot. **Korrektur gegenüber dem ursprünglichen
Plan:**
- **momox** deckt **nur Bücher/CDs/DVDs/Games sowie über "momox fashion"
  Kleidung/Schuhe ab — KEINE Elektronik/Smartphones.** Keine Verkaufs-
  gebühr, nur eine 4-€-Rücksendegebühr bei Ablehnung + Rückwunsch.
- **reBuy** deckt zusätzlich Elektronik/Smartphones/Tablets/Wearables ab
  (Testsieger für gebrauchte Smartphones laut Stiftung Warentest,
  Referenz von 2023). Bei Elektronik erfolgt der finale Preis erst nach
  Grading bei Wareneingang, nicht vorab garantiert.
- **Flip4New** (nicht "Flip4shop" — das ist nur der Verkaufs-Shop-Marken-
  name derselben Firma) fokussiert auf Smartphones/Tablets/MacBooks/
  Kameras, Auszahlung innerhalb 24 Std. nach Prüfung.
- **Bisher fehlende, laut Test relevantere Anbieter für Elektronik:**
  **ZOXS** (Testsieger Smartphones, größtes Sortiment, beste
  Durchschnittspreise über viele Kategorien) und **wirkaufens.de**
  (Testsieger Apple Watches, "nie Kosten für den Kunden").
- Für **keinen** der geprüften Ankaufsdienste existiert eine öffentlich
  zugängliche Self-Service-API für Dritte.
- Quelle: [momox.de/so-funktionierts](https://www.momox.de/so-funktionierts/),
  [rebuy.de/verkaufen](https://www.rebuy.de/verkaufen),
  [trusted.de/ankaufportale](https://trusted.de/ankaufportale).

Architektonisch wäre ein Ankaufsdienst-Adapter deutlich einfacher (ein
API-Aufruf/eine Preisabfrage statt vollständigem Listing-Lebenszyklus)
— aber nur für die genannten, engen Produktkategorien sinnvoll, nicht
für "breit gemischtes" Second-Hand im Sinne von Abschnitt 4e. Eine
mögliche spätere Ergänzung (z. B. Phase 3), kein MVP-Bestandteil.

**Mode-/Vintage-Nischenplattformen — Korrektur ggü. ursprünglicher
Annahme:** Depop und Grailed (international, primär US-Markt) sind für
den deutschen Markt **kaum relevant** — Deutschland taucht bei beiden in
Similarweb-Traffic-Daten nicht mal separat auf, nur in der Sammel-
kategorie "Sonstige". Beide haben zudem für internationale (Nicht-US/UK)
Verkäufer spürbar höhere Gebühren (Depop +10 % Auslandsaufschlag, Grailed
effektiv ~14 %+ für internationale Zahlungen). **Für Deutschland
relevantere Alternativen, die vorher fehlten:** Vestiaire Collective
(Premium-/Luxus-Resale mit stärkerer EU-Präsenz), Kleiderkorb
(deutscher Vinted-Nachfolger, kostenlos), Mädchenflohmarkt (deutsche
Plattform mit optionalem Concierge-Service), Sellpy (IKEA-Beteiligung).
Für keine dieser Alternativen wurde eine offene Drittanbieter-API
gefunden. Quelle: [similarweb.com/website/depop.com](https://www.similarweb.com/website/depop.com/),
[desired.de – Vinted-Alternativen](https://www.desired.de/fashion/vinted-alternativen-die-besten-online-verkaufsplattformen-fuer-kleidung--01HF6NW4RF656B1AVQFACD6EYY).

**Konsequenz:** Bekannte kommerzielle Cross-Listing-Tools (z. B. aus dem
Resale-/Vintage-Bereich) lösen die Lücke bei API-losen Plattformen
üblicherweise über **Browser-Automatisierung** (das Tool füllt im
Hintergrund das normale Webformular der Plattform aus) statt über eine
offizielle API. Das ist technisch möglich, aber:

- **rechtlich riskant**: verstößt typischerweise gegen die Nutzungs-
  bedingungen/AGB der jeweiligen Plattform (automatisiertes Erstellen von
  Inhalten, Umgehung von Rate-Limits/Bot-Schutz);
- **technisch instabil**: bricht bei jedem Redesign/A-B-Test der Zielseite,
  erfordert laufende Wartung, ist anfällig für Captchas/Bot-Erkennung;
- **Kontorisiko für den Nutzer**: die Plattform kann das Nutzerkonto bei
  erkannter Automatisierung sperren.

**Empfehlung für den Produktplan:**

1. **MVP strikt auf Plattformen mit offizieller API beschränken** (eBay,
   Etsy, ggf. Amazon, ggf. eigener Shop via Shopify/WooCommerce). Das ist
   die einzige Variante, die technisch robust und rechtlich sauber sofort
   umsetzbar ist.
2. Für API-lose Plattformen (Kleinanzeigen, Vinted, Facebook Marketplace)
   **zunächst nur eine "Formatierungs-Hilfe" anbieten**: die App erzeugt
   den fertigen Text + zugeschnittene Bilder zum **manuellen Copy-Paste**
   durch den Nutzer (inkl. Ein-Klick-Kopieren, vorbefüllte
   Zwischenablage, ggf. Download der Bilder in der richtigen
   Reihenfolge/Größe). Das deckt einen großen Teil des Zeitgewinns ab,
   ohne ToS-Risiko.
3. Browser-Automatisierung für API-lose Plattformen **nur als bewusste,
   spätere Opt-in-Erweiterung** in Betracht ziehen, mit expliziter
   Nutzeraufklärung über das Risiko einer Kontosperre — und nur nach
   erneuter rechtlicher Prüfung der jeweils aktuellen AGB. Ich empfehle,
   diese Entscheidung nicht in der Architektur vorwegzunehmen, sondern
   als eigenen Produkt-/Rechts-Entscheid zu behandeln, bevor daran
   entwickelt wird.
4. **Vor Umsetzungsbeginn**: für jede geplante Zielplattform aktuell und
   direkt bei der Plattform verifizieren, ob/wie ein Entwicklerzugang zu
   bekommen ist, welche Nutzungsbedingungen gelten und ob Privatverkäufer
   überhaupt zulässige Nutzer eines API-Zugangs sind (viele
   Marketplace-APIs sind explizit auf gewerbliche/registrierte Händler
   zugeschnitten).

### 4c. Vertiefung: API-Details der Plattformen mit offiziellem Zugang

Konkretere Angaben zu dem, was die jeweilige API funktional hergibt —
auch hier gilt: Details (exakte Endpunkt-Namen, aktuelle Rate-Limits,
Freigabedauer) vor Umsetzung gegen die aktuelle Doku prüfen, das ändert
sich bei allen drei Anbietern immer wieder.

- **eBay — Sell-API-Familie**: funktional relevant sind vor allem die
  **Inventory API** (Artikel/Bestand anlegen, unabhängig vom eigentlichen
  Angebot), die darauf aufbauende **Offer**-Funktionalität (aus einem
  Inventory-Item ein live geschaltetes Angebot machen, inkl.
  Marktplatz-spezifischer Policy-Zuordnung wie Versand/Zahlung/Rückgabe)
  und die **Fulfillment API** (Bestellabwicklung nach Verkauf). Auth
  läuft über **OAuth 2.0** pro verbundenem Verkäuferkonto (User-Access-
  Token mit Refresh-Flow). eBay trennt zwischen einer Sandbox-Umgebung
  (zum Entwickeln ohne echte Angebote) und der Produktivumgebung, für
  die typischerweise ein Freigabeantrag nötig ist.
- **Amazon — Selling Partner API (SP-API)**: relevant ist v. a. die
  **Listings Items API** (Artikel/Angebote anlegen und pflegen) sowie
  **Catalog-** und **Product Type**-Endpunkte (Amazon verlangt pro
  Produktkategorie ein spezifisches, oft recht strenges Attribut-Schema
  — nicht jede Kategorie ist für jeden Verkäufertyp ohne Weiteres
  freigeschaltet, z. B. bei markenrechtlich sensiblen oder
  genehmigungspflichtigen Kategorien). Zugang läuft über eine
  **Amazon-Entwickler-/App-Registrierung + OAuth**, und Amazon prüft
  Anwendungen typischerweise stärker (u. a. Nachweis eines aktiven
  Verkäuferkontos) als eBay oder Etsy — realistische Vorlaufzeit für
  die Freigabe kann ich nicht seriös beziffern, das schwankt.
- **Etsy — Open API v3**: zentral ist der **Listings**-Endpunkt-Bereich
  (Draft-Listings anlegen, Bilder anhängen, veröffentlichen) sowie
  **Shop**- und **Taxonomy**-Endpunkte (Etsy hat eine eigene, für
  Handmade/Vintage/Craft-Produkte zugeschnittene Kategorietaxonomie).
  Auth über App-Registrierung + OAuth 2.0. Etsy ist von den dreien
  erfahrungsgemäß am zugänglichsten für kleinere/private Anbieter,
  da die Plattform selbst stark auf Kleinanbieter ausgerichtet ist —
  das ist aber ein allgemeiner Eindruck, keine verifizierte aktuelle
  Zulassungsstatistik.

**Gemeinsamkeiten, die die Adapter-Architektur (Abschnitt 10) prägen:**
alle drei trennen konzeptionell zwischen einem plattform-internen
"Produktdatensatz" (Inventory Item / Catalog Item / Listing-Draft) und
dem eigentlichen "live geschalteten Angebot" — das passt gut zum in
Abschnitt 8 beschriebenen Prinzip Product → Listing. Alle drei nutzen
OAuth 2.0 mit Refresh-Tokens; die Unterschiede liegen vor allem im
Umfang der Freigabeprüfung und im Kategorie-/Attribut-Schema.

### 4d. Vertiefung: Automatisierungs-Optionen für API-lose Plattformen (Analyse, keine Bauanleitung)

Für Kleinanzeigen.de, Vinted und Facebook Marketplace (Abschnitt 4b)
gibt es technisch grundsätzlich drei Wege, keinen davon empfehle ich
unbesehen — hier eine ehrliche Einordnung, damit die Entscheidung
bewusst getroffen wird:

1. **Formatierungs-Hilfe / manuelles Copy-Paste** (bereits als
   MVP-Ansatz empfohlen, siehe oben): kein technischer Zugriff auf die
   Plattform durch die App, der Nutzer trägt die fertig aufbereiteten
   Inhalte selbst ein. **Kein ToS-Risiko**, da die App nichts
   automatisiert einreicht — sie bereitet nur Inhalte vor.
2. **Browser-Automatisierung** (z. B. mit einem Headless-Browser-
   Framework, das die normale Web-Oberfläche wie ein Mensch bedient —
   Formularfelder ausfüllen, Klicks auslösen): technisch der
   naheliegendste Weg, weil er sich an der öffentlichen Nutzeroberfläche
   orientiert statt an internen Schnittstellen. Reale Risiken/Grenzen:
   - **Vertragliche/AGB-Ebene**: praktisch alle mir bekannten
     Plattformen dieser Art untersagen automatisierten Zugriff in ihren
     Nutzungsbedingungen — ein Verstoß ist in der Regel kein
     Strafrecht, aber zivilrechtlich relevant (Unterlassungsanspruch,
     Kontosperre, im Wiederholungsfall ggf. Vertragsstrafe, falls die
     AGB das vorsehen).
   - **Technische Gegenmaßnahmen**: Bot-/Captcha-Erkennung, Rate-
     Limiting, Geräte-Fingerprinting — wie stark diese bei den
     konkret genannten Plattformen aktuell ausgeprägt sind, kann ich
     nicht verlässlich einschätzen, das müsste technisch vor Ort
     geprüft werden (und ändert sich laufend als Reaktion auf genau
     solche Automatisierungstools).
   - **Wartungslast**: bricht bei jedem UI-Redesign der Zielseite,
     braucht laufende Pflege — ein laufender Kostenfaktor, nicht ein
     einmaliger Bauaufwand.
   - **Rechtliches Graufeld über das Vertragsrecht hinaus**: je nachdem
     wie umfangreich/strukturiert Daten von der Plattform ausgelesen
     werden (nicht nur eingegeben), können in Deutschland/EU auch
     Aspekte wie der Datenbankherstellerschutz (bei umfangreicher
     Übernahme strukturierter Datenbestände) eine Rolle spielen. Zur
     screen-scraping-spezifischen Rechtsprechung in Deutschland/EU habe
     ich keinen aktuellen, verlässlichen Überblick, der über diese
     grobe Einordnung hinausgeht — das ist ein Punkt für die rechtliche
     Ersteinschätzung (Abschnitt 13), nicht etwas, das ich hier
     abschließend bewerten kann.
3. **Reverse-engineerte interne/mobile API** (die Schnittstelle
   nachbauen, die die offizielle App der Plattform intern selbst
   benutzt, statt die sichtbare Web-Oberfläche zu automatisieren):
   technisch oft stabiler als Browser-Automatisierung (strukturierte
   Antworten statt HTML-Parsing), aber **rechtlich mindestens so riskant
   wie Variante 2** (weiterhin ein nicht offiziell freigegebener,
   AGB-widriger Zugriffsweg) und **zusätzlich fragiler**, weil solche
   internen Schnittstellen ohne jede Ankündigung geändert werden können
   und ich zu keiner der drei genannten Plattformen einen verlässlichen,
   aktuellen Kenntnisstand über Existenz/Aufbau einer solchen
   Schnittstelle habe — das wäre reine Spekulation, die ich hier bewusst
   nicht anstelle.

**Empfehlung unverändert:** Variante 1 für den MVP, Varianten 2/3 nur
als spätere, bewusste Einzelentscheidung pro Plattform — mit
Rechtsprüfung vorab und dem Nutzer gegenüber transparent als
"experimentell, Kontorisiko" gekennzeichnet, falls sie je umgesetzt
werden.

**Konkretisierung, wie Variante 2 technisch umgesetzt würde (auf
Nutzeranfrage, z. B. mit Playwright):** Ein Browser-Automatisierungs-
Adapter fügt sich **ohne Änderung** in das Adapter-Interface aus
Abschnitt 10 ein — `publish()` steuert dann einen Browser statt einen
API-Endpunkt aufzurufen:

```
class PlaywrightMarketplaceAdapter implements MarketplaceAdapter {
  authorize(user)      → Login-Flow im Browser statt OAuth; Session/
                          Cookies verschlüsselt persistieren, NICHT bei
                          jedem Publish neu einloggen (wiederholte
                          Logins sind ein starkes Bot-Signal)
  mapListing(internal) → dieselbe interne Product/Listing-Struktur wie
                          bei den API-Adaptern, nur die "Ziel-Form" ist
                          ein Web-Formular statt ein API-Payload
  publish(payload)     → Formularseite öffnen → Felder befüllen, Bilder
                          per Datei-Input hochladen → menschentypische
                          Pausen zwischen Aktionen → absenden →
                          Bestätigungsseite auslesen (externalId/URL)
  fetchListingStatus()  → Anzeigenseite erneut aufrufen, Status aus dem
                          HTML lesen (kein Status-Webhook ohne API)
  delist()              → Löschen-Aktion im eigenen Konto automatisieren
}
```

Das zeigt: **technisch buildbar, ohne die Architektur zu verändern.**
Was Playwright dagegen NICHT löst — das eigentliche Abwägungsproblem
bleibt bestehen:

- **AGB-Verstoß bleibt bestehen**, auch bei Automatisierung des eigenen,
  legitimen Kontos — die meisten mir bekannten Plattformen dieser Art
  untersagen automatisierten Zugriff vertraglich unabhängig davon, wer
  das Konto besitzt.
- **Bot-Erkennung ist ein Wettrüsten, kein einmalig gelöstes Problem**:
  Stealth-Techniken gegen Cloudflare/hCaptcha/Verhaltens-Fingerprinting
  existieren, aber jede Gegenmaßnahme kann durch ein Plattform-Update
  wieder ausgehebelt werden — laufender Wartungsaufwand, keine
  einmalige Bauaufgabe.
- **CAPTCHA ist der schärfste Punkt**: Playwright kann kein CAPTCHA
  lösen. Der Einsatz eines CAPTCHA-Solving-Dienstes wäre der Moment, in
  dem "eigenes Formular automatisieren" zu "gezielt gegen eine
  technische Schutzmaßnahme arbeiten" kippt — ein deutlich schärferer
  Fall als reine Formularautomatisierung.
- **Ressourcenkosten**: eine Browser-Instanz pro Publish ist erheblich
  teurer (RAM/CPU) als ein API-Call — bei mehreren gleichzeitigen
  Nutzern braucht das einen Browser-Pool mit Warteschlange.
- **Wartungslast**: Selektoren brechen bei jedem UI-Redesign der
  Zielseite. Der aktuelle DOM-Aufbau der in 4b genannten Plattformen ist
  mir nicht zuverlässig genug bekannt, um hier echte Selektoren
  anzugeben, ohne sie zu erfinden — das müsste zur Implementierungszeit
  am jeweils aktuellen Formular ermittelt werden.

**Fazit:** Playwright entfernt die *technische* Hürde vollständig, nicht
die *rechtliche*. Die Empfehlung bleibt deshalb unverändert (Variante 1
für den MVP) — es sei denn, es wird bewusst entschieden, das
AGB-/Kontorisiko einzugehen, mit den oben genannten Sicherungen
(Session-Wiederverwendung, menschliche Taktung, Kill-Switch pro
Plattform bei erkannten Sperr-/Captcha-Signalen, klare Nutzer-
Aufklärung "experimentell, Kontorisiko" vor Aktivierung).

### 4e. Marktplatz-Priorisierung für den MVP (Entscheidung)

Festgelegt für die Zielrichtung **"Second-Hand/Vintage, breit
gemischt"** (Privatverkäufer entrümpeln Kleiderschrank/Haushalt, kein
enges Warensegment):

- **Priorität 1 — eBay (offizielle API, live Publishing im MVP).**
  Begründung: von den drei API-Plattformen aus 4a die einzige mit
  wirklich breiter Kategorieabdeckung (Mode bis Haushalt bis Technik)
  UND einer etablierten Second-Hand-Käuferschaft — passt strukturell am
  besten zu "breit gemischt", nicht nur zu einer Warengruppe.
  **Web-verifiziert**: Verkauf innerhalb Deutschlands ist für
  Privatverkäufer provisionsfrei (320 kostenlose Angebote/Monat) — das
  stützt die Priorisierung zusätzlich. **Offene Frage**: ob eine
  Privatperson ohne Gewerbe routinemäßig Production-API-Zugang erhält,
  ist nicht dokumentiert (siehe 4a) — sollte als erste konkrete Aktion
  in Phase 0 (Abschnitt 15) geklärt werden, bevor viel in den
  eBay-Adapter investiert wird.
- **Priorität 1 (gleichrangig) — Kleinanzeigen.de, aber NICHT über
  Live-API (siehe 4b: keine bekannt), sondern über die
  **Formatierungs-Hilfe** (Copy-Paste-Assistent). Begründung: für
  genau diese Zielrichtung — private, breit gemischte Second-Hand-
  Angebote im deutschsprachigen Raum — ist Kleinanzeigen.de nach
  meiner Einschätzung die reichweitenstärkste Plattform überhaupt,
  gerade wegen der lokalen Abholung, die bei Second-Hand-Haushalts-
  und größeren Artikeln eine große Rolle spielt. Sie deshalb erst in
  Phase 2 zu bedienen würde einen Großteil des eigentlichen
  Nutzwerts für diese Zielgruppe verschieben — **daher wird die
  Formatierungs-Hilfe für Kleinanzeigen.de vorgezogen und ist jetzt
  Teil des MVP (Phase 1)**, nicht erst Phase 2 (Anpassung gegenüber
  der ursprünglichen Phasenplanung, siehe aktualisierte Abschnitte 5
  und 15).
- **Zurückgestellt — Etsy.** Begründung: Etsy ist nach eigener
  Plattform-Definition auf **Handmade** und **Vintage** (Etsy
  definiert "Vintage" als Artikel, die mindestens 20 Jahre alt sind)
  sowie Bastelbedarf ausgerichtet — das deckt nur einen schmalen
  Ausschnitt von "breit gemischtem" Second-Hand ab (ein 3 Jahre alter
  Pullover oder ein gebrauchter Toaster sind auf Etsy kein guter Fit).
  Etsy lohnt sich für diese Zielrichtung erst, wenn sich im
  tatsächlichen Sortiment ein relevanter Anteil an echten
  Vintage-/Handmade-Stücken zeigt — dann als gezielte Ergänzung, nicht
  als pauschale zweite API-Plattform. **Web-verifizierte Ergänzung**:
  die Zurückstellung liegt am Kategorie-Fit, nicht an der Zugänglichkeit
  — Etsys Entwicklerzugang ist tatsächlich der mit Abstand einfachste
  der drei API-Plattformen (Seller-App-Freigabe "within minutes" ohne
  manuelle Prüfung, siehe 4a). Sollte sich der Vintage-/Handmade-Anteil
  im Sortiment zeigen, ist die technische Hürde für die Ergänzung also
  gering.
- **Nicht vorgesehen — Amazon SP-API.** Begründung, jetzt web-verifiziert
  und dadurch deutlich härter als ursprünglich angenommen: Amazon lässt
  **Individual-Accounts (die für Gelegenheits-Privatverkäufer gedachte,
  günstigere Kontoart) laut eigener Entwicklerdoku gar nicht erst zur
  SP-API zu** — Zitat: "Only Professional Selling Accounts can register
  to develop or integrate with Selling Partner API. Individual accounts
  are not eligible." Ein API-Zugang würde also erzwingen, dass jeder
  angebundene Nutzer auf den kostenpflichtigen Professional-Plan
  (39 €/Monat, unabhängig vom Umsatz) wechselt — und damit genau den
  Kostenvorteil aufgibt, den Amazon für Gelegenheitsverkäufer sonst
  bietet (0,99 €/Artikel, kein Fixbetrag). Das ist kein bloßes
  "strenger als die anderen zwei", sondern ein struktureller
  Widerspruch zum Zielprofil aus diesem Abschnitt. Details und Quelle
  in Abschnitt 4a. Nicht ausgeschlossen für eine spätere, andere
  Zielrichtung (z. B. falls die App später auch neuwertige
  Händlerware für Profi-Verkäufer unterstützen soll), aber für den
  jetzigen MVP-Fokus keine Priorität.

**Damit ergibt sich für den MVP:** eBay (Live-API) + Kleinanzeigen.de
(Formatierungs-Hilfe) als die zwei tatsächlich für Phase 1 relevanten
Kanäle — nicht "eBay + Etsy" wie in der ursprünglichen, noch
zielgruppen-unabhängigen Fassung von Abschnitt 5 formuliert.

---

## 5. Funktionsübersicht

### MVP (Phase 1)

Konkretisiert nach der Marktplatz-Priorisierung in Abschnitt 4e (Zielrichtung
"Second-Hand/Vintage, breit gemischt"):

- Foto-Upload (Mehrfachbilder pro Produkt)
- KI-Bildanalyse: Kategorie-Vorschlag, Basis-Attribute
- KI-Text-Generierung: Titel + Beschreibung (editierbar)
- Bildaufbereitung: automatischer Zuschnitt/Format je Zielplattform
- **eBay als einzige Live-API-Anbindung** (Publish direkt aus der App)
- **Kleinanzeigen.de als Formatierungs-Hilfe** (fertiger Text + passend
  zugeschnittene Bilder zum Copy-Paste — vorgezogen aus der
  ursprünglichen Phase 2, siehe 4e-Begründung)
- Manuelles Review vor Veröffentlichung (Pflichtschritt)
- Zentrales Dashboard: Status pro Listing pro Plattform (inkl. der
  Kleinanzeigen-Einträge, deren Status der Nutzer manuell pflegt, da
  keine API-Rückmeldung existiert)
- Manuelles "als verkauft markieren" → deaktiviert/delistet die
  eBay-Anzeige automatisch, erinnert an manuelles Löschen bei
  Kleinanzeigen.de

### Phase 2

- **Etsy-Anbindung**, sobald sich im tatsächlichen Sortiment ein
  relevanter Vintage-/Handmade-Anteil zeigt (siehe 4e) — kein
  automatischer Nächster-Schritt, sondern datengetriebene Entscheidung
- Formatierungs-Hilfe zusätzlich für Vinted, Facebook Marketplace sowie
  markt.de, Quoka.de und Hood.de (siehe 4b) — **meinestadt.de nicht mehr
  in der Liste**, da die Recherche nahelegt, dass der eigenständige
  Marktplatz-Bereich faktisch eingestellt ist (vor Nutzung direkt
  verifizieren); **nebenan.de nur mit eigener Adresslogik**, da
  strukturell hyperlokal, nicht einfach wie die übrigen Portale
  "blind" mit anbieten; **Hood.de neu aufgenommen**, da hier — anders
  als ursprünglich angenommen — tatsächlich eine offizielle API
  existiert (siehe 4b) und damit ggf. sogar als Live-API-Kandidat statt
  nur Formatierungs-Hilfe geprüft werden sollte
- Preisvorschlag auf Basis von Vergleichsangeboten (Abschnitt 9d)
- OCR für Etiketten (Größe, Pflegehinweise, Materialangabe)
- Lagerbestands-/Mengenverwaltung bei Mehrfachartikeln
- Amazon SP-API nur bei nachträglicher Erweiterung auf
  neuwertige Händlerware relevant (siehe 4e) — kein Standardschritt
  für die aktuelle Zielrichtung

### Phase 3 (Ausbaustufen)

- Automatische Neu-Bepreisung / Angebots-Auffrischung
- Mehrsprachige Anzeigen (Übersetzung) für internationale Plattformen
- Analytics (welche Plattform verkauft welche Kategorie am besten)
- Team-/Mehrbenutzer-Funktion für kleine Händlerteams
- Automatisierte Rücknahme/Reaktivierung von Angeboten bei Nichtverkauf

---

## 6. Architekturübersicht

```
                         ┌─────────────────────────┐
                         │      Mobile/Web-App       │
                         │  (Foto-Aufnahme, Review,  │
                         │   Dashboard, Freigabe)     │
                         └────────────┬──────────────┘
                                      │ REST/GraphQL (HTTPS)
                         ┌────────────▼──────────────┐
                         │        API-Gateway /       │
                         │        Backend-Service      │
                         └───┬───────────┬────────────┘
                             │           │
              ┌──────────────▼──┐   ┌────▼───────────────┐
              │  KI-Pipeline-    │   │  Marktplatz-        │
              │  Service         │   │  Publishing-Engine  │
              │  - Bildanalyse   │   │  - Adapter pro       │
              │  - Textgenerierg.│   │    Plattform         │
              │  - Bildaufbereit.│   │  - Format-Mapping    │
              │  - Preisvorschlag│   │  - Status-Sync       │
              └───┬──────────────┘   │  - Retry/Queue       │
                  │                  └───┬──────────────────┘
       ┌──────────▼─────────┐            │
       │ Externe KI-Dienste  │   ┌────────▼────────────────┐
       │ (Bildmodell,        │   │  Marktplatz-APIs         │
       │  Sprachmodell,      │   │  (eBay, Etsy, Amazon,     │
       │  OCR)               │   │   Shopify, …)             │
       └─────────────────────┘   └───────────────────────────┘
                             │
                  ┌──────────▼───────────┐
                  │  Datenbank            │
                  │  - Produkte           │
                  │  - Listings           │
                  │  - Marktplatz-Konten  │
                  │  - Medien             │
                  └───────────────────────┘
```

### Komponenten im Detail

- **Mobile/Web-App**: Foto-Aufnahme (native Kamera-Integration auf
  Mobile), Review-UI mit Diff/Editier-Möglichkeit für KI-Vorschläge,
  Plattform-Auswahl, Dashboard.
- **Backend-Service**: Orchestriert den gesamten Ablauf als konkreter
  Abhängigkeitsgraph (siehe Abschnitt 3a — Sofort-Analyse → Interview →
  parallele Preisrecherche/Bildaufbereitung/Eignungsfilter → ENV-Tier-
  Zuteilung → Text-Generierung, technisch als BullMQ Flow), zusätzlich
  Auth, Nutzer- und Kontenverwaltung, Business-Logik (z. B. welche
  Kategorie passt zu welchen Plattformen).
- **KI-Pipeline-Service**: gekapselt als eigener Service, damit
  Modell-/Anbieterwechsel isoliert bleiben (siehe Abschnitt 9).
- **Marktplatz-Publishing-Engine**: Adapter-Pattern — pro Plattform ein
  Adapter-Modul, das eine gemeinsame interne Listing-Repräsentation in
  das plattformspezifische API-Format übersetzt (siehe Abschnitt 10).
- **Datenbank**: persistiert Produkte, generierte/editierte Listing-
  Inhalte, Plattform-Verknüpfungen und Status-Historie.

---

## 7. Tech-Stack-Entscheidung

Konkrete Empfehlung statt offener Optionsliste — das ist meine
begründete Wahl für den MVP, kein unumstößlicher Standard. Wenn im Team
bereits belastbare Erfahrung mit einer der Alternativen besteht, wiegt
das schwerer als diese Empfehlung; dann bitte bewusst abweichen, nicht
diese Wahl "blind" übernehmen.

- **Backend: Node.js + TypeScript, mit NestJS.** Begründung: Die
  Kernarchitektur dieser App ist adapter-/plugin-lastig (ein Modul pro
  Marktplatz, siehe Abschnitt 10) — NestJS' Modul- und
  Dependency-Injection-System bildet genau dieses Muster sauber ab,
  ohne dass man es sich selbst zusammenbauen muss. TypeScript durchgängig
  von Frontend bis Backend spart eine Kontext-Wechsel-Kosten (ein
  gemeinsames Typsystem für z. B. die `Listing`/`Product`-Strukturen aus
  Abschnitt 8). Alternative, falls das Team NestJS' Boilerplate als
  Overhead empfindet: schlankes Express mit derselben
  Adapter-Modulstruktur von Hand — funktional gleichwertig, nur weniger
  Konventionen "geschenkt".
- **Frontend (MVP): React/TypeScript als Web-App mit PWA-Kamera-Zugriff
  (`getUserMedia`/Datei-Upload), NICHT React Native.** Begründung: Für
  den MVP zählt schnelle Validierung des Kernablaufs (Foto → Entwurf →
  Review → Publish), nicht native App-Store-Präsenz. Eine Web-PWA
  spart die doppelte Build-/Release-Pipeline (iOS + Android) und
  Store-Freigabeprozesse, die für die Validierungsphase noch keinen
  Mehrwert bringen. React Native wird zum sinnvollen Umstieg, **sobald**
  Nutzungszahlen eine native Distribution rechtfertigen (Push-
  Notifications, Offline-Fotoaufnahme, Store-Sichtbarkeit) — bewusst als
  spätere Migration eingeplant, nicht vorab gebaut.
- **Datenbank: PostgreSQL** (Produkte/Listings/Konten/Preisrecherche-
  Daten aus Abschnitt 8) **+ S3-kompatibler Objektspeicher** für Bilder.
  Unverändert zum ursprünglichen Vorschlag — hierzu gibt es keinen
  triftigen Grund, von der Standardwahl für dieses Datenprofil
  abzuweichen.
- **Job-Queue: Redis + BullMQ** (Node-natives Queue-System). Begründung:
  passt zur Backend-Wahl (kein zusätzliches Laufzeit-Ökosystem),
  ist gut dokumentiert für genau das hier gebrauchte Muster
  (Retry mit Backoff, Idempotenz-Keys — siehe Abschnitt 10).
- **KI-Anbindung: multimodale Sprachmodell-API statt getrennter
  Bild- und Text-Modelle, wo immer möglich.** Begründung: ein Modell,
  das sowohl Bilder versteht als auch Text generiert, vereinfacht die
  Pipeline aus Abschnitt 9 architektonisch (ein Anbieter/eine
  Authentifizierung für Bildanalyse UND Titel-/Beschreibungstext statt
  zwei getrennter Integrationen). Für die deutschsprachige Text-
  qualität und die in Abschnitt 9a beschriebene vorsichtige,
  unsicherheits-markierte Zustands-/Attributerkennung eignen sich
  aktuelle Anthropic-Claude-Modelle (multimodal, nehmen Bilder als
  Eingabe) als ein zu evaluierender Kandidat — das ist eine
  Empfehlung zur Evaluierung, keine abschließende Anbieterfestlegung;
  Kosten pro Anfrage, Datenschutz-/AVV-Fähigkeit und tatsächliche
  Ergebnisqualität am eigenen Produktkorpus sollten das in Phase 0/1
  entscheiden (siehe Abschnitt 15). Für die OCR-Etikettenerkennung
  (Abschnitt 9a) ggf. ergänzend eine spezialisierte OCR-Komponente
  einplanen, falls die Texterkennung des multimodalen Modells bei
  kleinem Etikettentext nicht präzise genug ist — das lässt sich erst
  am echten Foto-Material beurteilen, nicht vorab theoretisch.
- **OAuth-Token-Verwaltung**: verschlüsselte Speicherung
  (KMS/Secrets-Manager je Cloud-Anbieter), kein Klartext in der DB.
  Unverändert zum ursprünglichen Vorschlag.
- **Hosting (MVP): Render** (PaaS, einfacher Deploy-Workflow, keine
  Infrastruktur-Eigenverwaltung nötig). Begründung: für die
  Validierungsphase zählt Time-to-Deploy, nicht maximale Kontrolle —
  ein Wechsel zu AWS/GCP/Azure bleibt möglich, sobald Skalierungs-
  oder Compliance-Anforderungen (z. B. spezifische
  Datenresidenz-Vorgaben) das erfordern. Das ist eine Empfehlung aus
  Einfachheitsgründen, keine Aussage über langfristige Eignung.

---

## 8. Datenmodell (vereinfacht)

```
User
 ├─ id, email, name, subscriptionTier

MarketplaceAccount
 ├─ id, userId, marketplace (enum: ebay, etsy, amazon, …)
 ├─ oauthTokenEncrypted, tokenExpiresAt, status (connected/expired/revoked)

Product
 ├─ id, userId, createdAt
 ├─ category (intern-kanonisch, NICHT plattformspezifisch)
 ├─ attributes (Marke, Farbe, Material, Maße, …)
 ├─ conditionSuggested (KI-Vorschlag: neuwertig/gebraucht/Mängel, unverbindlich)
 ├─ conditionConfirmed (vom Nutzer bestätigt: Neu/Wie neu/Gut/Gebraucht/Defekt
 │   — verbindliche Grundlage für Anzeigentext UND Preisrecherche)

PriceComparable
 ├─ id, productId
 ├─ source (marketplace-api:<name> / eigene-preishistorie)
 ├─ condition (muss zu conditionConfirmed passen — kein Mischen)
 ├─ observedPrice, observedAt, externalRef (Link/ID zum Vergleichsangebot)

PriceSuggestion
 ├─ productId, condition
 ├─ median, rangeLow, rangeHigh, sampleSize, sources[]
 ├─ generatedAt
 ├─ (kein Suggestion-Eintrag, wenn sampleSize < Mindestschwelle —
 │   siehe Abschnitt 9d)

Media
 ├─ id, productId, originalUrl, processedVariants[] (je Plattform-Format)
 ├─ ocrText (falls Etikett erkannt)

Listing
 ├─ id, productId, marketplaceAccountId
 ├─ title, description, priceFinal, categoryMappedId (plattformspezifisch)
 ├─ priceSuggestionId (Referenz auf die Preisrecherche, aus der priceFinal
 │   ggf. übernommen/angepasst wurde — Nachvollziehbarkeit)
 ├─ status (draft/pending_review/published/error/sold/delisted)
 ├─ tier (0/1/2 — Staffelungsstufe aus Abschnitt 10a, wann aktiviert)
 ├─ externalListingId (ID beim Marktplatz nach Veröffentlichung)
 ├─ lastSyncedAt, lastError
 ├─ outcome (nur bei Abschluss befüllt: soldOnMarketplace, daysToSale,
 │   finalNetPrice — Trainingsdaten für die Lernschleife in Abschnitt 10a)

AuditLog
 ├─ listingId, action, actor (user/system), timestamp
```

**Wichtiges Designprinzip:** Es gibt **eine kanonische, plattform-
neutrale Produktbeschreibung** (`Product`) und **je Zielplattform ein
eigenes `Listing`**, das aus dem kanonischen Produkt abgeleitet und
plattformspezifisch angepasst wird (eigene Kategorie-ID, eigener Titel-
Zuschnitt, eigenes Bildformat). So bleibt die Quelle der Wahrheit sauber
getrennt von der plattformspezifischen Übersetzung.

---

## 9. KI-Pipeline im Detail

### 9a. Bildanalyse

- **Objekt-/Kategorieerkennung**: Multimodales Bildverständnis-Modell
  ordnet das Hauptmotiv einer internen Kategorie-Taxonomie zu (z. B.
  "Bekleidung > Damen > Jacken"). Die interne Taxonomie muss so gebaut
  sein, dass sie sich auf die Kategoriebäume aller Zielplattformen
  mappen lässt (siehe 9c) — pragmatisch: eigene, mittelgranulare
  Taxonomie als "Zwischenschicht", plus Mapping-Tabelle pro Plattform.
- **Attribut-Extraktion**: Farbe, erkennbares Material, ggf. Marke
  (falls Logo/Schriftzug klar erkennbar — mit Unsicherheits-Kennzeichnung,
  da Markenerkennung fehleranfällig ist und rechtlich heikel, wenn falsch
  zugeschrieben).
- **Zustandserkennung**: Modell gibt einen **Vorschlag** ab (z. B.
  "wirkt neuwertig" / "sichtbare Gebrauchsspuren"), der **immer als
  unverbindlicher Vorschlag** markiert und vom Verkäufer bestätigt werden
  muss — siehe rechtliche Hinweise in Abschnitt 13. Die App darf den
  Zustand niemals eigenständig final in eine veröffentlichte Anzeige
  schreiben, ohne dass der Mensch es bestätigt hat.
- **OCR für Etiketten**: separates Foto vom Größen-/Pflegeetikett wird
  per Texterkennung ausgelesen (Größe, Materialzusammensetzung,
  Pflegehinweise) — reduziert Tippaufwand und erhöht Datenqualität für
  Modeartikel.
- **Bildaufbereitung**: automatischer Zuschnitt auf plattformspezifische
  Seitenverhältnisse/Mindestauflösungen, Helligkeits-/Kontrastkorrektur,
  optional Hintergrund-Freistellung für Produktfotos (nicht immer
  gewünscht bei Second-Hand-Plattformen, wo "echte" Kontextfotos oft
  vertrauenswürdiger wirken — als Nutzeroption, nicht erzwungen).

### 9a-1. Produktidentifikations-Mechanik (konkret, web-verifiziert)

Die reine Bildbeschreibung durch das multimodale Modell (siehe oben)
reicht für die **Kategorie** meist aus, ist aber bei **exakter Marke/
Modell** unsicher — deshalb zwei zusätzliche, konkrete Bausteine, je
nachdem was auf dem Foto erkennbar ist:

1. **Ohne Barcode (Regelfall bei Kleidung, Möbeln, generischer Ware):**
   Das Hauptfoto wird zusätzlich an **Google Cloud Vision — Web
   Detection** geschickt. Dieser Dienst liefert (anders als reine
   Label-Erkennung) `pagesWithMatchingImages` — echte Web-Fundstellen
   mit Seitentitel, aus denen sich Marke/Modell ableiten lassen, wenn
   das fotografierte Produkt im Web bereits abgebildet ist (z. B. ein
   noch verkauftes Möbelstück, ein bekanntes Kleidungsstück). Kosten:
   erste 1.000 Anfragen/Monat kostenlos, danach 3,50 $/1.000 — spürbar
   teurer als reine Label-Erkennung, aber der einzige Baustein, der
   tatsächliche Web-Fundstellen statt nur ein Label liefert. **Wichtiger
   Hinweis:** Bing Visual Search (die naheliegende Alternative) wurde
   am 11.08.2025 vollständig eingestellt, ohne direkten Ersatz bei
   Microsoft — Google Cloud Vision Web Detection ist damit aktuell die
   einzige offiziell dokumentierte Option dieser Art. Ein günstigerer,
   aber inoffizieller Weg ist ein Drittanbieter-Wrapper um die echte
   Google-Lens-Oberfläche (z. B. SerpApi, ca. 5–25 $/1.000 Anfragen) —
   das ist kein offizielles Google-Produkt, sondern ein technisch
   funktionierender, aber ToS-technisch ungeklärter Scraping-Dienst;
   für den MVP empfehle ich die offizielle Vision-API, nicht den
   Wrapper.
2. **Mit sichtbarem Barcode/EAN** (Elektronik, Bücher, Medien,
   Konsumgüter): Ein zusätzliches Foto des Barcodes wird per
   **ML Kit Barcode Scanning** (Google, 2026 aktiv gepflegt und der
   robustere Standard gegenüber dem nur noch im Wartungsmodus
   befindlichen ZXing) decodiert. Die extrahierte EAN/UPC wird dann
   gegen eine Barcode-Lookup-API abgefragt (z. B. UPCitemdb — 100
   kostenlose Abfragen/Tag, danach ab 99 $/Monat; Alternativen
   Barcode Lookup, EAN-Search.org) und liefert offizielle Produktdaten
   (Titel, Kategorie, Hersteller) — **deutlich präziser** als jede
   bildbasierte Schätzung, weil es eine exakte Datenbank-Zuordnung
   statt einer Wahrscheinlichkeitsaussage ist. Für Lebensmittel/
   Konsumgüter existiert zusätzlich die kostenlose Open-Food-Facts-
   Datenbank — für den hier relevanten Second-Hand-Warenkorb (Kleidung,
   Elektronik, Möbel) aber nicht einschlägig.
3. **Ergebnis-Zusammenführung**: Kategorie-Vorschlag (multimodales
   Modell) + ggf. Marken-/Modell-Treffer (Web Detection) + ggf.
   Barcode-Match werden zu **einem** Vorschlag mit Konfidenzangabe pro
   Feld zusammengeführt und dem Nutzer im Review-Schritt gezeigt —
   widersprechen sich die Quellen (z. B. Barcode sagt "Modell X 2019",
   Bildmodell schätzt "wirkt neuer"), wird das sichtbar gemacht statt
   automatisch aufgelöst.

**Bildersuche — wichtige Abgrenzung, was sie NICHT ersetzen darf:** Die
oben beschriebene Web-/Reverse-Image-Search dient ausschließlich der
**Identifikation** (Marke/Modell/Produktdaten). Sie darf **nicht** dazu
verwendet werden, gefundene Hersteller-/Stock-Fotos anstelle der eigenen
Fotos des Verkäufers in die Anzeige einzubauen — bei Second-Hand-Ware
erwarten Käufer (und teils verlangen Plattform-Richtlinien) Fotos des
**tatsächlichen** Artikels in seinem realen Zustand; Stock-Fotos würden
den realen Zustand verschleiern und das Käufervertrauen sowie ggf. die
Plattform-Richtlinien verletzen. Web-Suchtreffer bleiben also reine
Hintergrund-Datenquelle für die KI-Pipeline, nie Bildmaterial für die
veröffentlichte Anzeige selbst.

### 9b. Text-Generierung

- **Titel**: je Plattform-Zeichenlimit und -Konvention (z. B.
  Schlagwort-lastig bei eBay/Etsy-SEO vs. kurz-persönlich bei
  Kleinanzeigen-Formaten).
- **Beschreibung**: Tonalität konfigurierbar je Plattform-Profil
  (sachlich/attributgetrieben vs. persönlich/erzählend), generiert aus
  den extrahierten Attributen + optionalen Freitext-Stichpunkten des
  Nutzers.
- **Pflichtangaben-Erinnerung**: die App muss aktiv prüfen/erinnern, ob
  rechtlich vorgeschriebene Angaben fehlen (z. B. Grundpreis bei
  bestimmten Warengruppen, Textilkennzeichnung, Herstellerangaben) —
  siehe Abschnitt 13. Das ist **keine reine Kür**, sondern reduziert
  Abmahnrisiko für den Nutzer.

### 9c. Kategorie-Mapping-Engine

- Interne Zwischenkategorie ↔ Mapping-Tabelle pro Marktplatz-Taxonomie.
- Mapping-Tabellen müssen gepflegt werden, da sich Marktplatz-
  Kategoriebäume ändern können — als eigene, versionierte
  Konfigurationsdaten behandeln (nicht hart im Code verdrahten).
- Fallback-Strategie, wenn kein eindeutiges Mapping existiert: Nutzer
  wählt manuell aus einer vorgefilterten Liste plausibler Zielkategorien.

**Illustratives Beispiel** (die Kategorie-Bezeichnungen/IDs sind
**Platzhalter zur Veranschaulichung des Prinzips**, keine verifizierten
aktuellen Werte der jeweiligen Plattform — echte IDs müssen aus der
jeweils aktuellen Kategorie-Taxonomie-API zur Build-/Laufzeit bezogen
werden, siehe 4c):

```
Interne Zwischenkategorie:
  "bekleidung.damen.jacken.winterjacke"

Mapping-Tabelle (Auszug):

  Plattform   │ categoryId │ Pflichtattribute (Beispiel)
  ────────────┼────────────┼──────────────────────────────────────
  eBay        │ 63862      │ Marke, Größe, Farbe, Material,
              │ (Platzh.)  │ Erscheinungsjahr (falls bekannt)
  ────────────┼────────────┼──────────────────────────────────────
  Etsy        │ 1234       │ Materialangabe, Herstellungsart
              │ (Platzh.)  │ (nur relevant, falls als Vintage/
              │            │  Handmade eingestellt — sonst evtl.
              │            │  kein Etsy-Fit für Massenware)
  ────────────┼────────────┼──────────────────────────────────────
  Amazon      │ WINTER_    │ Amazon-Produkttyp-Schema mit eigenem,
              │ COAT (Pl.) │ oft striktem Pflichtfeld-Katalog
              │            │ (siehe 4c — Product-Type-Abhängigkeit)
```

**Was die Mapping-Tabelle konkret leisten muss:**

1. **1:n-Auflösung**: eine interne Kategorie kann auf mehrere plausible
   Ziel-Kategorien derselben Plattform treffen (z. B. "Winterjacke"
   könnte bei eBay sowohl unter "Damenjacken" als auch unter
   "Outdoor-Bekleidung" liegen) → dann keine automatische Blindwahl,
   sondern Vorauswahl + Nutzerbestätigung im Review-Schritt.
2. **Pflichtattribut-Weitergabe**: pro Ziel-Kategorie unterscheiden sich
   die Pflichtfelder (siehe Beispiel oben) — die Mapping-Tabelle liefert
   nicht nur die Kategorie-ID, sondern auch, welche der in Abschnitt 8
   erfassten `attributes` für genau diese Ziel-Kategorie Pflicht sind,
   damit die App **vor** dem Publish-Versuch erkennt, ob etwas fehlt,
   statt erst durch einen API-Fehler davon zu erfahren.
3. **Versionierung**: jede Mapping-Tabelle trägt ein Stand-Datum: wenn
   eine Plattform ihre Taxonomie ändert (kommt regelmäßig vor), muss
   erkennbar sein, welche internen Kategorien seit wann mit welcher
   Tabellenversion gemappt wurden — sonst lassen sich fehlgeschlagene
   Altlistings nicht mehr nachvollziehen.

### 9d. Preisrecherche & Marktvergleich

Ziel: aus der bestätigten Zustandsangabe (siehe User-Journey, Schritt 3)
und den erkannten Produktattributen automatisch einen begründeten
Preisvorschlag ableiten — als Spanne mit Median, nicht als einzelne
Scheinzahl, und mit sichtbarer Quellenangabe statt Blackbox.

**Wichtige Korrektur nach Web-Recherche (Stand September 2026) — das
verändert die Machbarkeit spürbar gegenüber der ursprünglichen Annahme:**
Es gibt **keinen frei zugänglichen offiziellen API-Zugang zu
tatsächlichen Verkaufspreisen**, weder bei eBay noch Etsy noch Amazon:

- **eBay Browse API** liefert **nur aktive Angebotspreise** (Asking-
  Preise), keine verkauften/abgeschlossenen. Die passende API dafür,
  die **Marketplace Insights API** (Nachfolger der alten
  `findCompletedItems`, liefert `lastSoldPrice`/`lastSoldDate`), ist
  offiziell als **"Limited Release" eingestuft und aktuell für neue/
  kleine Entwickler gesperrt** — Zugang praktisch nur über größere
  Partner-Programme. eBays eigenes "Produktrecherche"-Tool (ex-Terapeak,
  zeigt echte Verkaufspreise der letzten 3 Jahre) ist nur eine
  Weboberfläche im eigenen Seller Hub, **keine API für Drittanbieter**.
- **Etsy Open API v3** kennt nur Listing-Status wie `active`/`sold_out`
  — keinen abfragbaren "Verkaufspreis eines abgeschlossenen Listings".
  Nur aktive Angebotspreise sind zugänglich.
- **Amazon**: Die Product Pricing API ist nur für den eigenen
  Katalog eines zugelassenen Verkäuferkontos nutzbar, kein allgemeiner
  Marktvergleichszugang für fremde Artikel.
- Quelle: [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search),
  [eBay Marketplace Insights API / Limited Release](https://developer.ebay.com/api-docs/static/versioning.html),
  [Etsy API v3 Definitionen](https://developers.etsy.com/documentation/essentials/definitions/),
  [Amazon SP-API Product Pricing](https://developer-docs.amazon.com/sp-api/docs/product-pricing-api).

**Konsequenz für den Algorithmus — angepasster Ablauf:**

1. **Zustand als Pflicht-Filterkriterium** (unverändert): Vergleichs-
   angebote werden immer nach dem vom Nutzer bestätigten Zustand
   gruppiert. Neu-Preise und Gebraucht-Preise dürfen nie in einen
   gemeinsamen Topf fallen.
2. **Zwei Datenquellen, mit klar unterschiedlichem Aussagewert:**
   - **eBay Browse API — aktive Angebotspreise** (methodisch
     **schwächer**, da Asking-Preis ≠ tatsächliche Zahlungsbereitschaft;
     Privatverkäufer/Händler setzen Angebotspreise oft höher an als den
     realistischen Verkaufspreis). Nutzbar sofort, ohne Zugangs-
     beschränkung, über die reguläre Buy-API.
   - **Eigene Preishistorie — TATSÄCHLICHE Verkaufspreise** aus über
     die App abgeschlossenen Listings (`outcome.finalNetPrice` aus
     Abschnitt 8/10a). Das ist die methodisch **stärkere** Quelle
     (echte Zahlungsbereitschaft), aber sie existiert erst, sobald die
     App selbst genug Verkäufe pro Kategorie/Zustand angesammelt hat —
     dasselbe Kaltstart-Problem wie bei der Lernschleife in Abschnitt
     10a, hier auf die Preisschätzung übertragen.
   - **Explizit NICHT vorgesehen**: Web-Scraping von Vergleichsseiten
     ohne offizielle API — dieselben ToS-/Rechtsrisiken wie die
     Browser-Automatisierung in Abschnitt 4d, nicht "durch die
     Hintertür" über die Preisrecherche eingeführt.
3. **Quellen-Kennzeichnung im Preisvorschlag ist Pflicht, nicht Kür**:
   ein Vorschlag muss immer sagen, ob er auf Angebotspreisen (schwächer)
   oder eigenen Verkaufsdaten (stärker) beruht — z. B. "12 aktive
   eBay-Angebote, Median 34 €, Spanne 28–41 € (Angebotspreise, keine
   Verkaufsgarantie)" vs. "8 eigene Verkäufe dieser Kategorie/Zustand,
   Median 29 € (tatsächliche Verkaufspreise)". Ein Vermischen beider
   Quellen ohne Kennzeichnung wäre irreführend.
4. **Mindest-Stichprobengröße** (unverändert): erst ab einer
   konfigurierbaren Mindestanzahl (z. B. 5) wird ein Preisvorschlag
   angezeigt; sonst transparent "keine ausreichende Datenbasis".
5. **Berechnung**: Median + Preisspanne (z. B. 25.–75. Perzentil),
   getrennt je Quelle — bei Vorliegen beider Quellen wird die eigene
   Verkaufshistorie bevorzugt angezeigt (stärkerer Beleg), die
   Angebotspreis-Spanne als Zusatzinfo.
6. **Darstellung im Review-Schritt und keine Automatik ohne Bestätigung**
   (unverändert): der Vorschlag ist frei editierbar, die
   Endpreisentscheidung bleibt beim Verkäufer.

**Praktische Konsequenz für den Phasenplan (Abschnitt 15):** Die
Preisrecherche liefert im MVP zunächst **nur** die methodisch schwächere
Angebotspreis-Spanne aus der eBay Browse API — eine ehrliche, aber
begrenzt aussagekräftige Starthilfe. Die eigentlich verlässlichere
eigene Preishistorie kann erst greifen, sobald genug abgeschlossene
Listings vorliegen. Ein möglicher zusätzlicher Schritt für spätere
Phasen: erneut Zugang zur eBay Marketplace Insights API beantragen,
sobald die App über eine gewisse Nutzerbasis/Transaktionsvolumen verfügt
(Limited-Release-APIs werden laut Recherche u. a. über einen
"Application Growth Check" freigegeben) — das aber erst nachträglich
prüfen, nicht als MVP-Voraussetzung einplanen.

---

### 9e. Erweiterte Preis-Triangulation & Nachfrage-Signale (Ergänzung, September 2026)

Dieser Abschnitt konsolidiert zwei Dinge, die nachträglich aufgefallen
sind: einen **Widerspruch zwischen bestehenden Doc-Entwürfen**, der beim
ersten Einlesen nicht auffiel, und **drei neue Signal-Ideen** aus einer
Folgediskussion (Ankaufportale, Suchinteresse, Angebot/Nachfrage). Im
Gegensatz zur eBay/Etsy/Amazon-Recherche in §9d ist hier **nichts der
neuen Punkte web-verifiziert** — das ist bewusst so gekennzeichnet und
vor jeder Implementierung nachzuholen, nicht anzunehmen.

**Aufgelöster Doc-Widerspruch — Gemini Web-Grounding:**
`zusammenfassung_resale_agent_architektur.md` und die Pseudocode-Datei
`backend_lifecycle_controller_nestjs_xstate.js` (`MarketAnalysisService`)
benennen "Gemini + Google Search Grounding" als Weg zur Live-
Preisrecherche — ohne die Risiken zu erwähnen, die weiter oben in §9d
ausführlich hergeleitet wurden. Der wahrscheinlich eigentliche
Vertragsstand, `personal_resale_assistant_v2_2_freeze_candidate.md`,
committed sich bewusst **nicht** darauf und hält KI-Anbieter nur
allgemein austauschbar. Auflösung: Grounding wird als **eine zusätzliche
Quelle unter mehreren** behandelt, nicht als Ersatz der API-Quellen aus
§9d — mit denselben Pflichten (Quellen-Kennzeichnung, Mindeststichprobe,
nie automatische Preisübernahme). Es bleiben zwei ungelöste Probleme:
Grounding liefert weiterhin nur Angebots-, keine Verkaufspreise (das
Sold-Price-Problem wird verschoben, nicht gelöst), und ein LLM, das
Suchtreffer zu einer Preisspanne verdichtet, ist strukturell anfällig
für Scheingenauigkeit — genau das, was §9d ausschließen will. Zusätzlich
ungeklärt: Kosten pro Grounding-Anfrage (kein kostenloses Kontingent wie
bei den übrigen MVP-Quellen) und ob ein von Google zusammengefasster
Lesezugriff auf ToS-restriktive Seiten (v. a. Kleinanzeigen) wirklich
unkritisch ist — beides vor Produktivnahme zu prüfen.

**Neue Quellen:**

- **Ankaufportale** (z. B. momox, reBuy, Zoxs, Trade-In-Programme):
  Ankaufspreise werden von diesen Plattformen aktiv veröffentlicht, um
  Verkäufer zu gewinnen — eine Preisabfrage über das eigene Formular ist
  bestimmungsgemäße Nutzung, kein Scraping fremder Angebote, und damit
  rechtlich unkritischer als die in §9d ausgeschlossenen
  Vergleichsportale. Liefert eine kaltstart-freie Preis-Untergrenze
  (Ankaufspreis liegt typischerweise deutlich unter dem Privatverkaufs-
  preis). Braucht einen kategoriespezifischen Umrechnungsfaktor
  (Ankaufspreis → erwarteter Privatverkaufspreis), der zunächst nur grob
  geschätzt und über die Lernschleife aus §10a nachjustiert wird, sobald
  eigene Verkäufe vorliegen. Ob ein Portal eine echte API oder nur ein
  Web-Formular hat, ist **pro Portal einzeln zu prüfen**, nicht
  pauschal anzunehmen.
- **Google Trends** (Suchinteresse über Zeit für Marke/Modell): kein
  Preissignal, sondern ein Nachfrage-Modulator — beeinflusst die
  Konfidenz der Preisspanne und ggf. den Zeitpunkt der Tier-Staffelung
  aus §10a (bei hoher Nachfrage früher breiter ausrollen).
- **Angebot (Supply)**: braucht keine neue Integration — die Anzahl
  aktiver Vergleichsangebote fällt bereits als Nebenprodukt der
  ohnehin in §9d vorgesehenen eBay-Browse-API-Abfrage an und sollte
  als eigenes, kostenloses Signal mitgespeichert werden.

**Bildauswahl & Beschreibungs-Performance — lösbar ohne fremde Inhalte
zu scrapen:** Beide Fragen waren ursprünglich offen, weil ein
naheliegender Ansatz (fremde Angebote/Fotos analysieren) am selben
ToS-Verbot scheitert wie die Preisvergleichsportale. Stattdessen aus der
**eigenen** Historie lernen, im selben Bandit-Modell aus §10a:
- Bildqualität (Schärfe, Belichtung, Freistellung) ist bereits über die
  in §9a-1 integrierte Vision API objektiv bewertbar — korreliert mit
  Time-to-Sale ergibt das eine datenbasierte Titelbild-Empfehlung.
- Beschreibungsmerkmale (Länge, Stichwortdichte, Vollständigkeit der
  Angaben) aus den **eigenen** abgeschlossenen Listings, ebenfalls
  gegen Time-to-Sale/erzielten Preis gelernt — keine Analyse fremder
  Anzeigentexte nötig.

**Disposition Engine — drei gleichzeitige Preisvorschläge
(UX-Erweiterung, noch nicht spezifiziert):** `disposition_engine_decision_matrix.md`
nimmt `userGoal` aktuell als **Eingabe** entgegen (Nutzer legt vorher
fest, was er will) und berechnet dafür eine einzelne Empfehlung. Eine
sinnvolle Erweiterung, sobald die Preisspanne aus obiger Triangulation
mit Perzentilen vorliegt: alle drei Szenarien gleichzeitig berechnen und
anzeigen, Auswahl danach statt davor —
`⚡ Schnell (unteres Quartil)` / `⚖️ Ausgewogen (Median)` /
`💎 Maximaler Erlös (oberes Quartil)`. Das ist eine Erweiterung des
bestehenden Interface, kein Ersatz — `userGoal` als Vorab-Filter bleibt
für Nutzer sinnvoll, die keine drei Optionen abwägen wollen.

**Aktueller Bau-Status:** Nichts aus diesem Abschnitt ist implementiert.
`DispositionEngineService` verarbeitet weiterhin ausschließlich einen
manuell eingetippten `marketMedianPrice`.

---

## 10. Marktplatz-Adapter-Architektur

Jede Plattform bekommt ein eigenes **Adapter-Modul** mit einheitlichem
internem Interface, z. B.:

```
interface MarketplaceAdapter {
  authorize(user): OAuthFlow
  mapCategory(internalCategory): PlatformCategoryId
  mapListing(internalListing): PlatformPayload
  publish(payload): { externalId } | Error
  updateStatus(externalId, status): void
  fetchListingStatus(externalId): Status
  delist(externalId): void
}
```

Vorteile dieses Musters:

- Neue Plattform hinzufügen = neuer Adapter, ohne Kernlogik anzufassen.
- Unterschiedliche Auth-Verfahren (OAuth 2.0 einzelner Plattformen
  unterscheiden sich in Scopes/Refresh-Verhalten) bleiben pro Adapter
  gekapselt.
- Rate-Limit-Handling und Retry-Strategie pro Plattform individuell
  konfigurierbar (manche APIs sind strenger limitiert als andere).

**Publishing-Queue statt Direktaufruf:** Da Marktplatz-APIs
Ratenlimits, Wartezeiten und mögliche Ausfälle haben, sollte Publishing
grundsätzlich **asynchron über eine Job-Queue** laufen, mit:

- Retry mit exponentiellem Backoff bei transienten Fehlern
- klarer Fehlerklassifikation (temporär vs. dauerhaft, z. B.
  "Kategorie ungültig" ist kein Retry-Fall, sondern erfordert
  Nutzer-Korrektur)
- Idempotenz (kein doppeltes Listing bei wiederholtem Retry)

### 10a. Auswahl- und Priorisierungsalgorithmus (Erlösmaximierung)

**Zielsetzung, wie vom Nutzer formuliert:** nicht "eine gute Plattform
finden", sondern über die Wahl UND Staffelung der Plattformen das
**maximal erwartbare Verkaufsergebnis** erzielen — als Kombination aus
Reichweite (wie viele potenzielle Käufer werden erreicht) und
Verkaufsergebnis (ob und zu welchem Preis tatsächlich verkauft wird).
Das ist bewusst **eine** Zielgröße, nicht zwei getrennte, weil reine
Reichweite ohne Kaufabschluss wertlos ist und ein hoher Preis ohne
Käufer ebenso.

**Zielgröße (Formel):**

```
ENV(m, p) = conv(m, p) × netPrice(m, p) − listingCost(m) − frictionCost(p, m)

  ENV          = Erwarteter Netto-Verkaufserlös ("Expected Net Value")
                 für Produkt p auf Marktplatz m
  conv(m, p)   = geschätzte Verkaufswahrscheinlichkeit auf m innerhalb
                 eines Zeitfensters T (z. B. 30 Tage)
  netPrice(m, p) = erwarteter Verkaufspreis NACH Plattformgebühren und
                 nach dem für die Plattform typischen Verhandlungs-
                 abschlag (siehe unten, "Netto-Preis-Anpassung")
  listingCost(m) = direkte Kosten fürs Einstellen (nach Abschnitt 4b
                 bei den meisten hier betrachteten Plattformen ≈ 0)
  frictionCost(p, m) = Aufwand für den Verkäufer: manuelles Einstellen
                 bei Formatierungs-Hilfe-Plattformen (Zeitkosten),
                 Versandaufwand vs. lokale Abholung, Anwesenheits-
                 pflicht bei Übergabe
```

Ein Produkt kommt auf einen Marktplatz nur, wenn zuvor ein **Eignungs-
Filter** (nicht Teil der ENV-Formel, ein harter Ausschluss) erfüllt ist.

**Konkreter Mechanismus — bewusst eine deterministische Regel-Engine,
kein ML-Modell:** Die Marktplatz-Evaluation ist eine Kette von
Ja/Nein-Prüfungen gegen versionierte Konfigurationsdaten (dieselbe
Mapping-Tabelle wie in Abschnitt 9c), **nicht** eine gelernte/
wahrscheinlichkeitsbasierte Entscheidung — das ist bewusst so gewählt,
damit für den Nutzer jederzeit nachvollziehbar bleibt, WARUM eine
Plattform vorgeschlagen oder ausgeschlossen wurde (Transparenz-
Anforderung, im Gegensatz zur bewusst lernenden Preis-/Erlösschätzung
aus Punkt 4 unten):

```
function eignungsFilter(product, marketplace):
  # 1. Kategorie-Fit — Nachschlagen in der Mapping-Tabelle (9c)
  if marketplace not in categoryMapping[product.internalCategory]:
    return AUSGESCHLOSSEN("Kategorie nicht auf Plattform abbildbar")

  # 2. Zustands-Fit — plattformspezifische Zustandsregeln
  if marketplace == "etsy" and product.category == "vintage":
    if product.ageYears < 20:
      return AUSGESCHLOSSEN("Etsy-Vintage-Kriterium: mind. 20 Jahre (4a)")

  # 3. Logistik-Fit — Versand vs. lokale Abholung
  if product.shipping == "nicht versandfähig" (z.B. Sofa, sperrig):
    if marketplace.requiresShipping == true:
      return AUSGESCHLOSSEN("Nur Versand-Plattform, Produkt ist Abholung-only")

  # 4. Adress-/Radius-Fit — Sonderfall hyperlokale Plattformen (4b)
  if marketplace == "nebenan.de":
    if not product.seller.hasVerifiedAddress:
      return AUSGESCHLOSSEN("nebenan.de erfordert adressverifizierten Nutzer")
    # Reichweite ist hier ohnehin auf den Nachbarschaftsradius begrenzt —
    # kein bundesweites "einmal veröffentlichen, überall sichtbar"

  # 5. Formatierungs-Hilfe vs. Live-API — beeinflusst frictionCost, nicht Eignung
  # (wird in der ENV-Formel über frictionCost(p,m) abgebildet, siehe oben)

  return ZULÄSSIG
```

Diese Prüfungen laufen **vor** der ENV-Berechnung und sind rein
regelbasiert — die Konfigurationsdaten (Kategorie-Mapping-Tabellen,
Etsy-Altersgrenze, Logistik-Klassifikation je Produktkategorie) werden
wie in Abschnitt 9c als versionierte Daten gepflegt, nicht hart
codiert, weil sich Plattform-Regeln ändern können.

**Kernentscheidung des Algorithmus — warum "maximale Reichweite" hier
NICHT bedeutet "die eine beste Plattform auswählen":**

Da `listingCost(m) ≈ 0` für praktisch alle in Abschnitt 4b/4e
betrachteten Plattformen gilt (siehe Fee-Recherche) UND ein Produkt nur
einmal verkauft werden kann (die erste erfolgreiche Plattform "gewinnt",
die anderen werden per Cross-Sync deaktiviert, Abschnitt 11), ist die
**erlösmaximierende Strategie unter dieser Kostenstruktur, auf ALLE
eignungsgefilterten Plattformen gleichzeitig zu listen** — nicht auf
die eine mit dem höchsten Einzel-ENV-Wert. Jede zusätzliche geeignete
Plattform kann den Gesamterlös nur erhöhen oder gleich lassen, nie
verringern, solange ihre Grenzkosten bei ~0 liegen. Reichweite wird
damit nicht durch Ranking erzeugt, sondern durch **Maximierung der
eignungsgefilterten Menge**.

**Die eigentliche Optimierungsarbeit liegt deshalb nicht im "welche
eine Plattform", sondern in drei anderen Stellschrauben:**

1. **Eignungsfilter korrekt kalibrieren** (siehe oben) — hier entscheidet
   sich, was überhaupt "kostenlos" mit ins Rennen darf.
2. **Netto-Preis-Anpassung pro Plattform statt ein einheitlicher Preis
   überall.** Dieselbe Formel zeigt: `netPrice(m, p)` unterscheidet sich
   strukturell je Plattform, auch beim selben Zielerlös:
   - **Vinted**: Käufer zahlt die Schutzgebühr zusätzlich zum Listenpreis
     → der Verkäufer kann näher am "wahren Wert" listen, ohne eine
     eigene Provision einzupreisen.
   - **eBay**: Verkäufer trägt die Verkaufsprovision (Endpreisgebühr)
     → der Listenpreis muss etwas höher liegen, um denselben Netto-
     erlös zu erzielen wie auf einer provisionsfreien Plattform.
   - **Kleinanzeigen.de/markt.de/Quoka & Co.**: keine Plattformgebühr,
     aber ein für diese Plattformen **typischer Verhandlungsabschlag**
     (Käufer erwarten dort erfahrungsgemäß Preisverhandlung) — das
     ist eine Erwartungshaltung des Käuferpublikums, keine Plattform-
     gebühr, wirkt aber genauso auf `netPrice`.
   Die App sollte also **nicht denselben Anzeigepreis auf alle
   Plattformen kopieren**, sondern pro Plattform einen Preis
   vorschlagen, der auf denselben Ziel-Nettoerlös zurückrechnet.
3. **Zeitliche Staffelung (Tiering) statt reiner Kosten-Notwendigkeit** —
   hier greift der vom Nutzer vorgeschlagene Gedanke "von lokal zu
   breiter skalieren", allerdings **nicht** weil breitere Plattformen
   etwas kosten würden, sondern aus zwei anderen, echten Gründen:
   - **Aufwandsverteilung beim Nutzer**: bei Formatierungs-Hilfe-
     Plattformen ist `frictionCost` (manuelles Einstellen) real >0 —
     es ist nicht sinnvoll, dem Nutzer sofort den vollen manuellen
     Aufwand aller zehn Plattformen aufzubürden, wenn ein Teil davon
     den Verkauf ggf. gar nicht braucht.
   - **Käuferverwirrung/Preiskannibalisierung vermeiden**: dieselbe
     Ware zeitgleich überall mit ggf. sichtbar unterschiedlichen
     Preisen zu sehen, kann die Verhandlungsposition schwächen — ein
     zeitversetztes Ausrollen mindert dieses Risiko, ohne auf
     Reichweite zu verzichten (sie kommt nur leicht zeitversetzt).

   Konkrete Tier-Logik für die MVP-Zielrichtung aus Abschnitt 4e:

   ```
   Tier 0 (sofort):      eBay (Live-API) + Kleinanzeigen.de
                          (Formatierungs-Hilfe) — deckt lokale UND
                          bundesweite Reichweite bereits in einem
                          Schritt ab, geringster Aufwand (eine API +
                          eine der meistgenutzten Formatierungs-Hilfen)
   Tier 1 (nach T1 Tagen ohne Verkauf):
                          + markt.de, Quoka.de, nebenan.de
                          (+ Vinted, falls Kategorie-Fit Mode)
   Tier 2 (nach T2 Tagen weiterhin ohne Verkauf):
                          + Etsy (falls Vintage-/Handmade-Fit, Abschnitt 4e)
                          UND: Preisrecherche (Abschnitt 9d) erneut
                          anstoßen — ein zu hoher Preis ist oft die
                          eigentliche Ursache für ausbleibenden
                          Verkauf, nicht fehlende Reichweite
   ```

   `T1`/`T2` sind konfigurierbare Schwellen, keine von mir festgelegten
   "richtigen" Werte — sinnvoll wäre, sie ebenfalls aus der
   Lernschleife (Punkt 4) abzuleiten, sobald genug Daten vorliegen,
   statt sie dauerhaft zu raten.

4. **Lernschleife statt statischer Schätzwerte** — **das ist der Kern
   der Antwort auf "welchen Algorithmus hast du gewählt, um nach dem
   maximalen Outcome zu suchen":** `conv(m, p)` und `netPrice(m, p)`
   kann ich jetzt nur als grobe Kategorie-Heuristik angeben (z. B.
   "eBay hat für breite Kategorien erfahrungsgemäß hohe Reichweite"),
   **nicht mit echten Zahlen**, da mir keine Live-Marktdaten vorliegen —
   das wäre erfundene Präzision. Die App soll diese Werte deshalb nicht
   einmalig festlegen, sondern über die Zeit **selbst lernen**, nach
   dem Muster eines **Multi-Armed-Bandit-Problems**:
   - jede Plattform ist ein "Arm";
   - jedes abgeschlossene Listing (verkauft/nicht verkauft, auf welcher
     Plattform, nach wie vielen Tagen, zu welchem Preis) ist ein
     Versuchsergebnis;
   - `Listing` (Abschnitt 8) bekommt ein zusätzliches Feld
     `outcome: { soldOnMarketplace, daysToSale, finalNetPrice }`;
   - die Schätzwerte für `conv(m, p)` und `netPrice(m, p)` werden **pro
     interner Kategorie + Zustand** (nicht global) aus der wachsenden
     Historie aktualisiert — dieselbe Kategorie-/Zustands-Granularität,
     die schon in Abschnitt 9d für die Preisrecherche verwendet wird;
   - mit wachsender Stichprobe verschieben sich die Tier-Zuordnungen
     aus Punkt 3 automatisch weg von der anfänglichen Heuristik hin zu
     tatsächlich beobachtetem Verkaufsverhalten für genau diese Art
     Produkt.
   - **Kaltstart-Problem, ehrlich benannt**: für die ersten Listings
     (bevor genug eigene Historie existiert) bleibt nur die grobe
     Anfangsheuristik — das ist ein Klassiker bei Bandit-Systemen
     ("explore vs. exploit") und kein Sonderfall dieser App. Die Tier-
     0-Kombination (eBay + Kleinanzeigen.de) ist bewusst so gewählt,
     dass sie auch im Kaltstart, ohne jede Lernhistorie, für die
     Zielrichtung aus 4e vernünftig ist.

**Zusammengefasst, was der Algorithmus konkret tut:** (1) Eignungsfilter
anwenden → zulässige Plattform-Menge bestimmen, (2) pro zulässiger
Plattform einen netto-erlös-angepassten Preis vorschlagen (nicht einen
einheitlichen Preis kopieren), (3) alle zulässigen Plattformen zeitlich
gestaffelt statt gleichzeitig aktivieren (Tier 0/1/2, um Aufwand und
Käuferverwirrung zu begrenzen — nicht wegen Kosten, die sind ~0), (4) bei
jedem abgeschlossenen Listing das Ergebnis speichern und die
Schätzwerte für dieselbe Kategorie/Zustands-Kombination fortlaufend
nachjustieren. Das ist kein Optimierungsalgorithmus mit einer einzigen
geschlossenen Lösung, sondern ein **sich selbst kalibrierendes,
lernendes Priorisierungssystem** — bewusst so gebaut, weil mir die für
eine exakte Berechnung nötigen Reichweiten-/Konversionszahlen der
einzelnen Plattformen aktuell schlicht nicht vorliegen und ich sie nicht
erfinden will.

**Ergänzung (siehe §9e):** das Google-Trends-Nachfragesignal kann, sobald
integriert, die Tier-Zeitpunkte `T1`/`T2` zusätzlich zur Lernschleife
modulieren — bei hohem Suchinteresse früher breiter ausrollen, bei
niedrigem länger auf Tier 0 warten. Das ersetzt die Lernschleife nicht,
sondern gibt ihr im Kaltstart einen zweiten, sofort verfügbaren
Anhaltspunkt neben der groben Kategorie-Heuristik.

---

## 11. Synchronisation & Cross-Posting-Logik

- **Verkaufsstatus-Sync**: wo die API es unterstützt (Webhooks/Polling
  auf Verkaufsstatus), automatische Benachrichtigung im Backend →
  automatisches Delisting/Deaktivieren der übrigen Listings.
- **Wo keine automatische Statusrückmeldung möglich ist** (z. B. bei
  reinen Formatierungs-Hilfe-Plattformen ohne API): der Nutzer markiert
  manuell "verkauft" im Dashboard → App löst daraufhin Delisting bei den
  API-Plattformen aus und zeigt einen Hinweis/Erinnerung, die
  Anzeige bei den Nicht-API-Plattformen selbst zu löschen.
- **Mengenführung** bei mehreren identischen Artikeln: einfache
  Bestandslogik, die bei Verkauf die verbleibende Menge auf den anderen
  Plattformen aktualisiert statt komplett zu delisten.

---

## 12. Nutzerverwaltung, Auth & Sicherheit

- **OAuth 2.0** pro Marktplatz-Konto, Tokens verschlüsselt gespeichert
  (nie im Klartext, nie im Client), Refresh-Handling pro Adapter.
- **Rollen/Multi-Tenant**: von Anfang an so bauen, dass ein Nutzerkonto
  mehrere Marktplatz-Konten verknüpfen kann; spätere Team-Funktion
  (mehrere Nutzer pro Organisation) als Erweiterung, nicht Nachrüstung
  im Datenmodell nötig, wenn `userId`/`organizationId` von Beginn an
  sauber getrennt modelliert wird.
- **Datenschutz (DSGVO, da deutscher/europäischer Zielmarkt)**:
  - Verarbeitung von Produktfotos ggf. mit externen KI-Diensten →
    Auftragsverarbeitungsvertrag (AVV) mit dem KI-Anbieter prüfen,
    Datenverarbeitung transparent in der Datenschutzerklärung nennen.
  - Keine unnötige Speicherung sensibler Daten (Adress-/Zahlungsdaten
    verbleiben möglichst beim Marktplatz selbst, nicht redundant in der
    eigenen App-DB, wenn nicht zwingend nötig).
  - Löschkonzept für Produktfotos/-daten auf Nutzerwunsch.
- **API-Zugangsdaten der App selbst** (Client-ID/Secret je
  Marktplatz-Entwicklerkonto) sicher in Secrets-Management, nicht im
  Repository.

---

## 13. Rechtliche & Compliance-Aspekte (Deutschland/EU-Fokus)

Dieser Abschnitt beschreibt **worauf zu achten ist**, ersetzt aber keine
Rechtsberatung — vor Launch sollte eine anwaltliche Prüfung erfolgen,
insbesondere weil Verkäufer-Abmahnrisiken im deutschen Online-Handel real
und häufig sind.

- **Keine Blindveröffentlichung von KI-generierten Zustands-/
  Mängelangaben.** Der Verkäufer muss jede automatisch erkannte
  Zustandsaussage aktiv bestätigen, bevor sie live geht — sonst haftet
  im Zweifel der Verkäufer für fehlerhafte KI-Einschätzungen
  gegenüber dem Käufer.
- **Pflichtangaben je Warengruppe** (nicht abschließend, jeweils prüfen):
  - Grundpreisangabe bei bestimmten Warenkategorien
  - Textilkennzeichnung (Faserzusammensetzung) bei Bekleidung
  - Herstelleridentifikation/Sicherheitsangaben bei bestimmten
    Produktkategorien (z. B. Elektro, Spielzeug)
  - Widerrufsbelehrung bei gewerblichem Verkauf (nicht bei
    Privatverkäufen zwischen Privatpersonen, aber relevant, sobald die
    App auch gewerbliche Nutzer anspricht)
- **Marktplatz-eigene AGB/API-Nutzungsbedingungen**: jede Automatisierung
  muss mit den ToS der jeweiligen Plattform vereinbar sein — insbesondere
  bei Plattformen ohne offizielle API (siehe Abschnitt 4b) ist
  Automatisierung typischerweise **nicht** von den Nutzungsbedingungen
  gedeckt.
- **Markenrechte**: automatische Markenerkennung in Bildern darf nicht zu
  falschen/ungeprüften Markenzuschreibungen in der veröffentlichten
  Anzeige führen (Gefahr von Abmahnungen wegen irreführender
  Markennennung oder Markenrechtsverletzung).
- **Verantwortlichkeit für Inhalte**: die App ist technischer
  Dienstleister, der Verkäufer bleibt rechtlich verantwortlich für den
  Anzeigeninhalt — das sollte in den Nutzungsbedingungen der App klar
  geregelt sein, und die Review-Pflicht (Abschnitt 3, Schritt 4) ist
  dafür auch die praktische Absicherung.

---

## 14. Monetarisierung (Vorschlag)

- **Free-Tier**: begrenzte Anzahl Listings/Monat, 1–2 Plattformen.
- **Abo-Modell** (monatlich): unbegrenzte/höhere Listing-Anzahl, alle
  angebundenen Plattformen, Preisvorschlags-Feature.
- **Pro-Listing-Gebühr** als Alternative/Ergänzung für Gelegenheitsnutzer
  ohne Abo.
- **Team-/Business-Tarif** für Händler mit mehreren Nutzern und höherem
  Volumen (Phase 3).

Konkrete Preispunkte hängen von tatsächlichen KI- und API-Kosten pro
Listing ab — sollte erst nach einer Kosten-pro-Listing-Kalkulation im MVP
festgelegt werden, nicht vorab spekulativ.

---

## 15. Technischer Umsetzungsplan (Phasen & grobe Meilensteine)

**Phase 0 — Validierung (vor jeglicher Entwicklung)**

- Für jede geplante Zielplattform: Entwicklerzugang beantragen/prüfen,
  aktuelle API-Doku und Nutzungsbedingungen sichten, Freigabeprozess und
  -dauer klären (manche Marktplatz-APIs haben Wochen bis Monate
  Vorlaufzeit für die Produktivfreigabe).
- **Konkret zuerst klären (aus der Web-Recherche in 4a/4e als offene
  Frage identifiziert)**: ob eBay einer Privatperson ohne Gewerbe
  Production-API-Zugang gewährt — das entscheidet, ob Abschnitt 4e's
  Tier-0-Plan (eBay Live-API) für Privatverkäufer wie geplant umsetzbar
  ist, oder ob dafür ein Gewerbe angemeldet werden müsste.
- Rechtliche Ersteinschätzung zu Pflichtangaben und AGB-Konformität.

**Phase 1 — MVP (eBay-Adapter + Kleinanzeigen-Formatierungs-Hilfe, siehe 4e)**

- Foto-Upload + einfache KI-Kategorisierung/Textgenerierung
- eBay-Adapter komplett (Auth, Publish, Status)
- Kleinanzeigen.de-Formatierungs-Hilfe (Text/Bilder zum Copy-Paste)
- Review-UI, Basis-Dashboard
- Ziel: ein Produkt lässt sich vollständig fotografieren, KI-unterstützt
  beschreiben, auf eBay live veröffentlichen und für Kleinanzeigen.de
  fertig aufbereitet zum manuellen Einstellen exportieren.

**Phase 2 — Etsy (bei Bedarf) + weitere Formatierungs-Hilfen**

- Etsy-Adapter, sobald der Vintage-/Handmade-Anteil im Sortiment das
  rechtfertigt (siehe 4e) — kein automatischer Schritt
- Formatierungs-Hilfe zusätzlich für Vinted, Facebook Marketplace sowie
  markt.de, Quoka.de und Hood.de (siehe 4b) — **meinestadt.de nicht mehr
  in der Liste**, da die Recherche nahelegt, dass der eigenständige
  Marktplatz-Bereich faktisch eingestellt ist (vor Nutzung direkt
  verifizieren); **nebenan.de nur mit eigener Adresslogik**, da
  strukturell hyperlokal, nicht einfach wie die übrigen Portale
  "blind" mit anbieten; **Hood.de neu aufgenommen**, da hier — anders
  als ursprünglich angenommen — tatsächlich eine offizielle API
  existiert (siehe 4b) und damit ggf. sogar als Live-API-Kandidat statt
  nur Formatierungs-Hilfe geprüft werden sollte
- Cross-Sync bei Verkauf (manuell getriggert)

**Phase 3 — Skalierung & Komfort**

- Preisvorschlag, OCR, Mengenverwaltung
- Automatisierte Statussynchronisation wo API-seitig möglich
- Team-Funktionen, Analytics

Konkrete Zeit-/Personenaufwände lassen sich seriös erst nach Festlegung
von Team-Größe, gewählter KI-Anbieterlösung und den tatsächlichen
Freigabezeiten der Marktplatz-APIs schätzen — pauschale Wochen-/
Monatsangaben an dieser Stelle wären eine unbegründete Zahl und werden
deshalb bewusst nicht angegeben.

---

## 16. Risiken & offene Fragen

- **API-Zugangsrisiko**: einige Marktplätze könnten Neuanträge für
  Entwicklerzugänge ablehnen/verzögern, insbesondere wenn die App als
  "Cross-Listing-Tool" für Privatverkäufer positioniert ist (manche
  Plattformen sehen Multi-Homing-Tools kritisch, da sie Nutzer von der
  eigenen Plattform weglenken können).
- **KI-Fehleinschätzungen**: falsche Zustands-/Attributangaben können zu
  Käuferreklamationen und Verkäuferhaftung führen — Review-Pflicht ist
  Pflichtbestandteil, kein optionales Feature.
- **Kategorie-Mapping-Pflege**: Marktplatz-Taxonomien ändern sich, ohne
  laufende Pflege drohen fehlerhafte/abgelehnte Listings.
- **Abhängigkeit von Drittanbieter-KI-Diensten**: Preis-, Verfügbarkeits-
  und Qualitätsänderungen externer Modelle wirken sich direkt auf die
  App aus.
- **Rechtliches Restrisiko bei API-losen Plattformen**: selbst der
  "reine Formatierungs-Hilfe"-Ansatz ohne Auto-Publishing ist rechtlich
  unkritischer, aber jede spätere Automatisierung dort sollte erneut
  einzeln geprüft werden.
- **Offene Frage, die ich nicht beantworten kann**: der aktuelle exakte
  Stand der API-Verfügbarkeit, Gebühren und Freigabekriterien für jede
  einzelne genannte Plattform zum heutigen Zeitpunkt — das muss vor
  Projektstart direkt bei den Plattformen recherchiert werden, da sich
  das schnell ändert und ich dazu keine verlässliche aktuelle Quelle
  heranziehen kann.

---

## 17. Nächste Schritte

1. ~~Zielmarktplätze priorisieren~~ — **erledigt, siehe Abschnitt 4e**:
   eBay (Live-API) + Kleinanzeigen.de (Formatierungs-Hilfe) für den MVP,
   Etsy zurückgestellt bis relevanter Vintage-/Handmade-Anteil sichtbar
   wird, Amazon SP-API für die aktuelle Zielrichtung nicht vorgesehen.
2. Entwicklerzugang bei eBay beantragen (kann der zeitkritische Pfad
   sein — parallel zur technischen Konzeption starten).
3. Rechtliche Ersteinschätzung einholen (Pflichtangaben, AGB-Konformität,
   Verantwortlichkeitsregelung in den eigenen Nutzungsbedingungen).
4. KI-Anbieter für Bildanalyse/Textgenerierung evaluieren (Kosten pro
   Anfrage, Sprachqualität Deutsch, Datenschutz-/AVV-Fähigkeit).
5. Klickbaren Prototyp des Kernablaufs (Foto → Entwurf → Review →
   Publish auf einer Plattform) bauen, um die UX früh zu validieren,
   bevor in die volle Adapter-Architektur investiert wird.
