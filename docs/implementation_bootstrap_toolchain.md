# Implementation Bootstrap

Der Architekturvertrag (Docs 01-05) ist eingefroren. Dieses Dokument definiert das physische Projekt-Setup und die Ausführungsreihenfolge (TDD).

## 1. Toolchain-Entscheidungen
*   **Plattform:** Node.js (v20 LTS) + TypeScript (Strikt-Modus).
*   **Backend-Framework:** NestJS. Ideal für das Adapter-Pattern (Plattform-Module) und Dependency Injection für externe Services.
*   **Datenbank:** PostgreSQL (v15+) + TypeORM (oder Prisma). TypeORM wird bevorzugt, da es sich nativ in NestJS einklinkt und explizite, versionierte SQL-Migrationen (anstelle von Auto-Sync) unterstützt.
*   **State Machine:** XState (v5) gekapselt in einen `StateGuardService`, um den Lifecycle zu erzwingen.
*   **Background Jobs:** BullMQ + Redis für asynchrone Webhook-Verarbeitung, Delisting-Retries und S3-Garbage-Collection.
*   **Test-Infrastruktur:** Jest + Supertest (für API). **Wichtig:** Integrationstests gegen echte Datenbanken via *Testcontainers* (um SQL-Locks und Constraints real zu beweisen).

## 2. Ziel-Verzeichnisstruktur (Backend)
```text
src/
 ├── domain/                 # Entitäten, XState-Machine, Interface-Verträge
 ├── infrastructure/         # DB-Repositories, Redis-Config, S3-Adapter
 ├── application/            # StateGuardService, CapabilityCheckService
 ├── api/                    # REST-Controller (Command-orientiert, Human Gates)
 │    ├── auth/              # JWT, Actor Context Middleware
 │    ├── controllers/
 │    └── webhooks/          # Signatur-Prüfung, Event-Ingestion
 ├── workers/                # BullMQ Consumer (Publishing, Hard-Delete)
 └── marketplaces/           # Adapter-Implementierungen
      ├── ebay/
      └── kleinanzeigen/
test/
 ├── unit/
 ├── integration/            # Testcontainers DB Tests (T01, T05, T06)
 └── e2e/                    # End-to-End API Contracts (T02, T03, T04)
migrations/                  # Native SQL Migrationen
```

## 3. Ausführungsreihenfolge (Strict TDD)

Die Entwicklung folgt exakt der Schichten-Architektur:

1.  **Schritt 1: Datenbank (Doc 01)**
    *   Aufsetzen von TypeORM.
    *   Einspielen der initialen Migration `001_initial_schema.sql`.
    *   *Schreiben der T01-Tests* (schlagen fehl, bis Entitäten und Repositories gebunden sind).
2.  **Schritt 2: State Guard (Doc 02)**
    *   Implementierung der XState-Maschine.
    *   *Schreiben der T03-Tests* (beweisen, dass kein Controller den Status ohne XState ändern kann).
3.  **Schritt 3: Backend Invariants (Doc 03)**
    *   Implementierung der Rollen-Middleware (`ActorContext`).
    *   *Schreiben der T02, T05 und T06 Tests* (beweisen, dass AI keine User-Fakten erzeugt und Locks funktionieren).
4.  **Schritt 4: API Contracts (Doc 04)**
    *   Bau der NestJS Controller (POST Commands).
    *   *Schreiben der T04 Tests* (beweisen Webhook/System-Abweisung an Human-Gates).
5.  **Schritt 5: Asynchrone Jobs (Doc 03)**
    *   Implementierung von BullMQ für Webhook-Folge-Logik und S3-Löschung (T08).