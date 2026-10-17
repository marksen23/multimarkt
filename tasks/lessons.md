# Lessons

## 2026-10-11 — „Typecheck sauber“ war falsch

**Was passiert ist:** `npx tsc --noEmit` im Frontend meldete keine Fehler. Die Root-`tsconfig.json` hat aber `"files": []` mit Projekt-Referenzen, d. h. dieser Aufruf prüft **nichts**. Zusätzlich war `frontend/node_modules` gar nicht installiert. Der Branch baute in Wahrheit nicht (typografische Anführungszeichen in JSX, veraltete Typen) — ein Render-Deploy wäre gescheitert.

**Regeln:**
- Verifikation im Frontend nur mit `npm run build` (= `tsc -b && vite build`), nie mit `tsc --noEmit` im Root.
- Vor jeder Verifikation prüfen, dass `node_modules` existiert (`npm ci --include=dev`).
- Bei Deploy-Anleitungen den exakten Build-Befehl aus `render.yaml` lokal ausführen, bevor „deploybar“ behauptet wird.

## 2026-10-11 — Doppeltes PWA-Manifest

**Was passiert ist:** Ein handgeschriebenes `public/manifest.json` wurde angelegt, obwohl `vite-plugin-pwa` bereits Manifest + Service Worker erzeugt.

**Regel:** Vor dem Hinzufügen von Infrastruktur (Manifest, SW, Config) `vite.config.ts` und `package.json` auf vorhandene Plugins prüfen.
