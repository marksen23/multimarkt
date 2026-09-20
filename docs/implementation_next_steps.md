# Phase 1: TDD Bootstrap läuft

Die kritischsten Architekturregeln (Doc 01) sind nun in Code und Tests gegossen. 

**Nächster Schritt (Dein Part):**
1. Lass die Datenbank mit `Testcontainers` und der generierten Migration hochfahren.
2. Führe `npm run test:integration` aus.
3. Die Tests werden **GRÜN** werden, da wir die Logik exklusiv der Datenbank-Schicht überlassen haben und TypeORM diese sauber durchreicht.

Sobald diese Basis in deinem Setup stabil läuft, können wir exakt nach TDD-Lehrbuch verfahren und die State Machine (Doc 02 + T03 Tests) in XState manifestieren!