# Corporate Design & Workflow — Plan

Status: **Entwurf, wartet auf Freigabe** (Branch `claude/admiring-ride-3je6me`)

## Ausgangslage (gemessen, nicht geschätzt)

- Token-System in `frontend/src/index.css` vorhanden (bg/surface/line/ink/accent/danger/warning), Akzent Grün `#059669`, Logo = 2×2-Raster.
- **Inkonsistenz:** 119 rohe Tailwind-Farbklassen (zinc/sky/amber/violet/indigo/orange/red …) in 13 Dateien umgehen die Tokens — v. a. `StatusBadge`, `DashboardPage`, `AccountPage`, `ItemDetailPage`.
- **Typo-Wildwuchs:** 69× `text-[11px]`, 28× `text-[10px]`, je 1× `[9px]`/`[13px]` — keine Typo-Skala.
- **Icons gemischt:** Emojis (📷 🖼 ✨ 📦 ⚠) neben SVG-Icons im selben Screen.
- **Bug:** `:root[data-theme="dark"]` definiert `--color-warning`/`--color-warning-soft` nicht → bei erzwungenem Dunkel-Modus hell-gelbe Warnflächen.
- **Workflow-Brüche:** `ItemDetailPage` (READY) zeigt drei konkurrierende Wege (DispositionPanel, „Angebotspaket erstellen“, „manuell“-Formular). Status-Farben folgen keiner Logik (READY und SOLD gleich grün, LISTED indigo, BUNDLED violett).
- Demo-Routen `/demo/*` sind produktiv erreichbar.
- PWA-Icon nur als SVG; für iOS-Homescreen und manche Android-Launcher fehlen 192×192/512×512-PNGs (Hinweis steht bereits in `vite.config.ts`).
- ~~Frontend-Build war rot~~ (8 Typfehler + typografische Anführungszeichen in `ItemDetailPage`) — **behoben** vor Planbeginn.

## Leitprinzip

**„Ein Artikel — ein nächster Schritt.“** Jeder Screen hat genau eine primäre Aktion (unten, daumenerreichbar). Alles andere ist sekundär (Ghost-Button oder „⋯“-Menü).

## 1. Marke

- Name bleibt **Personal Resale OS**, Kurzform **Resale OS** (wie im PWA-Manifest).
- Logo: bestehendes 2×2-Raster bleibt; Regeln: Mindestgröße 16 px, Schutzzone = ¼ Kantenlänge, nur Akzentfarbe oder Weiß auf Akzent.
- Tonalität der Texte: Du-Form, Verben statt Substantive („Prüfen“, nicht „Prüfung nötig“), keine Fachbegriffe wie „Canonical Listing“ in der UI.

## 2. Farbsystem (Tokens)

Neutrals + Akzent bleiben. Neu: **Phasen-Farben**, die genau den Workflow abbilden — Farbe = Phase, nicht Zufall:

| Phase (UI-Name) | Backend-Status | Token | Bedeutung |
|---|---|---|---|
| Erfassen | NEW, ANALYZING | `--color-phase-capture` (Blau) | System arbeitet |
| Prüfen | REVIEW_REQUIRED | `--color-phase-review` (Amber) | Du bist dran |
| Inserieren | READY | `--color-phase-ready` (Akzent-Grün) | Bereit zum Verkauf |
| Online | LISTED, BUNDLED | `--color-phase-live` (Indigo) | Wartet auf Käufer |
| Verkauft | SOLD | `--color-phase-done` (Grün, kräftig) | Geld verdient |
| Konflikt | SALE_CONFLICT | `--color-danger` | Sofort handeln |
| Archiv | CANCELLED, ARCHIVED | `--color-ink-faint` | Erledigt |

Je Phase `-fg` und `-soft`, Light + Dark. Kontrast ≥ 4.5:1 für Text prüfen. Dark-Mode-Warning-Bug wird dabei behoben.

## 3. Typografie (Inter bleibt)

Fünf Stufen als `@theme`-Tokens, ersetzen alle `text-[Npx]`:

| Token | Größe/Gewicht | Einsatz |
|---|---|---|
| `text-display` | 24/800, tight | Seitentitel |
| `text-title` | 17/700 | Karten-/Abschnittstitel |
| `text-body` | 14/400–500 | Fließtext, Inputs |
| `text-label` | 12/600 | Feldlabels, Meta |
| `text-micro` | 11/700 uppercase, +0.06em | Badges, Abschnitts-Kicker |

Preise immer `tabular-nums`, 800.

## 4. Form, Raum, Tiefe

- Radius: 10 px Controls · 16 px Karten · voll für Pills/FAB.
- Abstände: 4er-Raster; Seitenrand mobil 16 px; Karten-Innenabstand 16 px.
- Tiefe: nur 2 Stufen — `shadow-card` (ruhend) und `shadow-float` (Sticky-Bar, Sheet, FAB).
- Bewegung: 150 ms ease-out für Zustände, 250 ms für Sheets; `prefers-reduced-motion` respektieren.
- Touch-Ziele ≥ 44 px.

## 5. Ikonografie

Ein `Icon`-Komponentensatz (24er-Raster, 1.8 Stroke, aktiv 2.2) — ersetzt alle Emojis. Benötigt: camera, image, sparkle, package, alert, check, refresh, copy, external, more, plus, home, inbox, search, user, trash, tag.

## 6. Komponenten-Bibliothek (`frontend/src/ui/`)

- `Button` — primary / secondary / ghost / danger · sm / md / lg · loading-State
- `Card` — Standardfläche mit optionalem Phasen-Rand
- `PhaseBadge` — ersetzt `StatusBadge`, nutzt Phasen-Tokens
- `PhaseStepper` — 5 Phasen (Erfassen → Prüfen → Inserieren → Online → Verkauft)
- `ActionBar` — sticky unten, genau eine Primäraktion (+ optional eine sekundäre)
- `Sheet` — Bottom-Sheet für Bestätigungen (ersetzt z. B. das neue Listing-Panel, Verwerfen, Als-verkauft)
- `Field` — Label + Input + Hilfe/Fehler + Zeichenzähler
- `EmptyState`, `Skeleton` (vereinheitlicht)
- `Icon`

## 7. Workflow & Informationsarchitektur

### Navigation (mobil, 5 Slots)

| Heute | Bestand | **＋ Erfassen** | Ankauf | Mehr |
|---|---|---|---|---|
| Aufgaben-Inbox: nur Artikel mit nächstem Schritt, sortiert nach Dringlichkeit (Konflikt › Prüfen › Inserieren › Online > 14 Tage) | Alle Artikel, gefiltert nach Phase (Chips), Suche, Kennzahlen | öffnet direkt Kamera | unverändert | Bundles, Konto, Darstellung, Abmelden |

Desktop: gleiche Struktur in der Sidebar. Badge-Zahl hängt an „Heute“.

### Artikel-Lebenslauf (ein Screen, phasengesteuert)

```
Erfassen ──► Prüfen ──► Inserieren ──► Online ──► Verkauft
 Foto          KI-Vorschläge  Preis + Texte   „Verkauft?“   Erlös
 (auto-        bestätigen     je Portal        bestätigen
  Analyse)                    kopieren
```

- **Erfassen:** FAB → Kamera → Foto(s) → Analyse startet automatisch; Fortschritt im Artikel.
- **Prüfen:** nur unsichere Felder zeigen, jedes mit „Passt“ / Bearbeiten; ActionBar: „Alles bestätigen“.
- **Inserieren:** Angebotspaket wird **Teil der Artikelseite** (kein separater Konzeptbruch); oben Preis, darunter Portal-Karten mit „Alles kopieren“ + „Portal öffnen“; ActionBar: „Inseriert ✓“ → Sheet mit Preis. Das alte „manuell“-Formular wandert in „⋯ › Manuell bearbeiten“.
- **Online:** Karte mit Portal-Status, „Text erneut kopieren“; ActionBar: „Verkauft“ → Sheet mit tatsächlichem Verkaufspreis.
- **Verkauft:** Erlös-Zusammenfassung; ActionBar: „Nächsten Artikel erfassen“ (schließt die Schleife).
- Sekundäraktionen (Verwerfen, Bündeln, Neu analysieren) immer im „⋯“-Menü oben rechts.

### Aufräumen

- `/demo/*`-Routen aus dem Produktiv-Build entfernen (nur bei `import.meta.env.DEV`).
- `DispositionPanel` nur noch als Hinweis in „Inserieren“, nicht als eigener Block.

## Umsetzungsphasen (je ein Commit, je `tsc` + `vite build` grün)

- [ ] **P1 Tokens:** Phasen-Farben, Typo-Skala, Radius/Schatten in `index.css`; Dark-Warning-Bug fixen; PNG-App-Icons 192/512 aus dem Logo erzeugen
- [ ] **P2 Primitives:** `ui/` mit Icon, Button, Card, PhaseBadge, PhaseStepper, ActionBar, Sheet, Field
- [ ] **P3 Migration:** 13 Dateien von Rohfarben/`text-[Npx]`/Emojis auf Tokens + Primitives (rein visuell, kein Verhaltenswechsel)
- [ ] **P4 Navigation:** Heute / Bestand / Erfassen / Ankauf / Mehr
- [ ] **P5 Artikel-Flow:** ItemDetail + Angebotspaket zu einem phasengesteuerten Screen; ActionBar + Sheets
- [ ] **P6 Verifikation:** Playwright-Screenshots 390 px + 1280 px, hell/dunkel, jede Phase; Kontrast-Check; Ergebnis unten dokumentieren

## Risiken

- P5 ist der größte Eingriff (ItemDetailPage ~1000 Zeilen, AngebotspaketPage ~670) — Regressionen im Statusfluss möglich; daher P3 strikt verhaltensneutral und P5 separat.
- Kein Test-Setup für das Frontend gefunden → Verifikation über Typecheck, Build und Screenshots, nicht über Unit-Tests.

## Review

_(wird nach Umsetzung ausgefüllt)_
