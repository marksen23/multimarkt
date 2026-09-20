# Executive Summary: Der Multi-Marktplatz Resale-Agent

## 1. Die Vision: Vom Formular-Ausfüller zum Verkaufs-Assistenten
Die App löst nicht mehr nur das technische Problem des Cross-Listings, sondern übernimmt den **gesamten mentalen Aufwand** des Ausmistens und Verkaufens für Privatpersonen. 

Anstatt den Nutzer zu zwingen, für jeden Marktplatz Formulare auszufüllen, agiert die App als intelligenter Makler: Sie identifiziert den Gegenstand, bewertet den Aufwand, schlägt die beste Verkaufsstrategie vor, bündelt Artikel zu Paketen und hilft bei der Preisverhandlung.

---

## 2. Die Kern-Philosophie
Das System basiert auf zwei unverrückbaren Grundsätzen, die bis auf die Datenbank-Ebene (SQL-Constraints) festgeschrieben sind:

1. **Die `ProductTruth`-Architektur:** Es gibt nur *eine* zentrale, plattformneutrale Wahrheit für jedes Produkt. Erst ganz am Ende wird diese Wahrheit für eBay, Kleinanzeigen oder andere Plattformen spezifisch übersetzt (ListingProjections).
2. **"Never silently invent":** Die KI ist ein Assistent, kein autonomer Entscheider. Alles, was die KI erkennt (Farbe, Marke, Zustand), gilt als *Behauptung* (INFERRED). Nichts geht online, bevor der Mensch es nicht verifiziert hat (USER_CONFIRMED). 

---

## 3. Die 5 Säulen der Architektur (Entwickelte Module)

### I. Datenerfassung & Confidence Center (UI)
*   **Der "KI-Fotograf":** Der Nutzer macht Fotos (inkl. Etiketten). Die Gemini-Vision-KI und OCR-Pipelines extrahieren Marken, Größen, Materialien und schätzen den Zustand.
*   **Confidence Center:** Ein Ampel-System im UI. Es zeigt dem Nutzer, was die KI sicher weiß (Grün), was sie vermutet (Gelb - zur Bestätigung) und was rechtlich zwingend vom Menschen ausgefüllt werden muss, wie z.B. der finale Zustand (Rot).

### II. State-Machine & Lifecycle (Backend)
*   **XState-Controller:** Ein Artikel ist nicht nur "online" oder "offline". Er durchläuft einen echten E-Commerce-Lebenszyklus: `CAPTURED` → `REVIEW_REQUIRED` → `READY` → `PUBLISHED` → `NEGOTIATING` → `RESERVED` → `SOLD`.
*   **Harte Guards:** Das Backend blockiert jeden Versuch, einen Artikel zu veröffentlichen, wenn die Provenienz (Herkunft der Daten) nicht bestätigt, dass ein Mensch dem Zustand zugestimmt hat.

### III. Disposition Engine (Die Strategie)
*   **ENV-Berechnung (Expected Net Value):** Die App berechnet, ob sich ein Verkauf überhaupt lohnt. Sie wägt den erwarteten Marktpreis gegen den Aufwand (Versand, Kommunikation) ab.
*   **"Nicht verkaufen"-Feature:** Liegt der Wert unter einer Schwelle (z.B. < 10€), rät die App aktiv vom Einzelverkauf ab und schlägt Alternativen vor: ReBuy/momox (Ankauf), Spenden oder Wertstoffhof.

### IV. Bundle Engine (Der Haushalts-Modus)
*   **Konvolut-Bildung:** Für Power-User, die den Keller ausmisten. Die Engine analysiert das unverkaufte Inventar und sucht nach Synergien.
*   **Ergebnis:** "Du hast 5 Kinder-Pullover in Größe 98 hochgeladen. Einzeln bringen sie je 4€ (lohnt den Versand nicht). Wir haben daraus ein Kleidungspaket für 15€ geschnürt."

### V. Verhandlungs-Assistent (Chat-KI)
*   **Die KI in der Kommunikation:** Wenn Interessenten sich melden ("Was letzte Preis? 80€?"), gleicht die App das Gebot mit der `ProductTruth` (Schmerzgrenze: 95€) ab.
*   **One-Click-Taktik:** Die App schlägt dem Nutzer fertige Antworten vor (Gegenangebot 100€, Beharren auf 95€, höfliche Absage). Der Nutzer klickt, kopiert und behält die Kontrolle.

---

## 4. Technologie-Stack

*   **Datenbank:** PostgreSQL (Nutzung von JSONB für flexible Attribute und Provenance-Tracking).
*   **Backend:** Node.js mit NestJS (perfekt für modulare Marktplatz-Adapter) und XState (für die Status-Logik).
*   **Background-Jobs:** BullMQ & Redis (für asynchrones Publishing und Delisting auf APIs wie eBay).
*   **KI-Integration:** Gemini 3 Pro/Flash (Multimodale Bildanalyse & Google Search Grounding für Live-Preisrecherchen).
*   **Frontend (MVP):** React Web-App (PWA-ready) mit Tailwind CSS. Fokus auf mobile Nutzung (Kamera) und "Copy-Paste"-Assistent für API-lose Plattformen wie Kleinanzeigen.

## 5. Fazit
Das System ist nicht einfach eine Schnittstelle zu eBay oder Kleinanzeigen. Es ist ein intelligentes Inventar-System für den Privathaushalt. Durch die radikale Reduzierung des mentalen Aufwands (Preisfindung, Texten, Verhandeln, Disposition) senkt die App die Hürde für die Kreislaufwirtschaft massiv.