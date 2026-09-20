# Aktualisierter Fahrplan

Das gesamte Architektur-Fundament (V2.2) ist formell spezifiziert und eingefroren.

1.  **Erledigt:** Doc 01 - Datenbank Schema (SQL)
2.  **Erledigt:** Doc 02 - State Machine (Prozess)
3.  **Erledigt:** Doc 03 - Backend Invariants (Technische Durchsetzung)
4.  **Erledigt:** Doc 04 - API Contracts (Schnittstellen)
5.  **Erledigt:** Doc 05 - Test Specification (Adversarial Verification)

**Nächster Schritt (Implementierung):**
*   Aufsetzen der Code-Base (z.B. NestJS + TypeORM / Prisma + Jest).
*   Übernahme von `schema_v2.sql` in die erste Datenbank-Migration.
*   Implementierung der in Doc 05 geforderten Test-Suiten (Test-Driven Development).