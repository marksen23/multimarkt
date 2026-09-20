# Architekturvertrag Teil 5: Test Specification
> **Dokument:** 05_TEST_SPECIFICATION.md
> **Version:** V2.2 (Final Freeze)
> **Zweck:** Mechanische Übersetzung der Architektur-Verträge (Doc 01–04) in automatisierte Testfälle. Fungiert als "Adversarial Verification Contract".

---

## 1. Test-Philosophie (Adversarial Verification)
Jede in den Dokumenten 01 bis 04 definierte Invariante muss zwingend durch drei Testkategorien abgedeckt sein:
1.  **Happy Path:** Der vorgesehene, fehlerfreie Ablauf.
2.  **Negative / Bypass Attempt:** Der absichtliche Versuch, Architekturwächter zu umgehen.
3.  **Concurrency / Jitter:** Der Versuch, durch gleichzeitige Aufrufe Race-Conditions zu provozieren.

---

## 2. SQL & Data Integrity Tests (Doc 01)
*Ziel: Beweisen, dass die Datenbank selbst als unterste Verteidigungslinie funktioniert.*

*   **T01-1 (Bundle XOR Constraint):**
    *   *Test:* Versuch, in `canonical_listings` einen Datensatz mit `item_id = UUID` UND `bundle_id = UUID` einzufügen.
    *   *Assert:* DB wirft Constraint Violation (`check_item_or_bundle_listing`).
*   **T01-2 (Epistemischer DB-Schutz):**
    *   *Test:* Versuch, in `item_attributes` einen Datensatz mit `truth_state = 'UNKNOWN'` aber gefülltem `attribute_value = 'Nike'` zu schreiben.
    *   *Assert:* DB wirft Constraint Violation (`check_unknown_value`).

---

## 3. Epistemic & ProductTruth Tests (Doc 03 / Doc 04)
*Ziel: Beweisen, dass KI und externe Systeme niemals als "Mensch" agieren können.*

*   **T02-1 (AI Spoofing Attempt - Strict Rejection):**
    *   *Test:* Ein Aufruf mit einem Service-Token (Actor: `AI_SERVICE`) versucht, eine Payload an `POST /items/:id/analyze` oder `/confirm` zu senden, die implizit `"condition_status": "USER_CONFIRMED"` enthält.
    *   *Assert:* Das Backend weist den Request hart ab (HTTP 403 Forbidden oder 422 Unprocessable Entity). Das System autorisiert Provenienz *ausschließlich* basierend auf dem Actor-Kontext (Session des Nutzers), niemals durch Vertrauen auf die mitgelieferte JSON-Payload.
*   **T02-2 (Premature Publication):**
    *   *Test:* Aufruf von Publish für ein Item mit `condition = UNKNOWN`.
    *   *Assert:* HTTP 422. Transition verweigert.

---

## 4. State Machine Integrity Tests (Doc 02)
*Ziel: Beweisen, dass Zustände nur in der erlaubten Reihenfolge durchlaufen werden.*

*   **T03-1 (State Jumping Bypass):**
    *   *Test:* API-Call auf `POST /items/:id/bundle` bei Status `REVIEW_REQUIRED`.
    *   *Assert:* HTTP 409 Conflict.
*   **T03-2 (CANCEL_PENDING Strict Resolution):**
    *   *Test:* Ein Job oder Nutzer versucht, ein Listing in `CANCEL_PENDING` durch einen unspezifischen Update-Call heimlich auf `CANCELLED` zu setzen, ohne den dokumentierten Bestätigungspfad (API-Confirm oder Human-Assertion) zu durchlaufen.
    *   *Assert:* HTTP 409 Conflict. State Machine verweigert Übergang.

---

## 5. Human-Gate & Authority Tests (Doc 03 / Doc 04)
*Ziel: Beweisen, dass kritische Endpunkte durch das Role/Actor-Model abgeriegelt sind.*

*   **T04-1 (Webhook Human-Gate Bypass):**
    *   *Test:* Webhook-Actor ruft `POST /items/:id/resolve-conflict` auf.
    *   *Assert:* HTTP 403 Forbidden. Nur `USER` darf diesen Pfad betreten.

---

## 6. Concurrency, Race-Condition & SALE_CONFLICT Tests
*Ziel: Beweisen, dass nebenläufige Ereignisse das Aggregat nicht zerstören.*

*   **T05-1 (The Webhook Clash - Atomic Sale Conflict):**
    *   *Setup:* Item hat Listings auf eBay und Kleinanzeigen (Status `LISTED`).
    *   *Test:* Zwei Webhook-Events (`SALE_REPORTED`) für beide Plattformen schlagen auf die exakt selbe Millisekunde ein.
    *   *Assert:* 
        1. Row-Level-Locks erzwingen eine Sequenz. 
        2. Webhook-Ingestion antwortet asynchron mit HTTP 202/200.
        3. **Keines** der Events gewinnt das Race und setzt das Item vorschnell auf `SOLD`.
        4. Endzustand: Item ist `SALE_CONFLICT`.
*   **T05-2 (Idempotency / Replay Attack):**
    *   *Test:* Derselbe eBay-Webhook wird dreimal gesendet.
    *   *Assert:* Aufruf 1 triggert State-Machine. Aufrufe 2 und 3 werden durch DB-UNIQUE-Constraint der Event-ID abgefangen. Sie antworten mit HTTP 200 OK (Bedeutung: "Event akzeptiert/bereits verarbeitet"), lösen aber **keine** weitere Business-Logik oder Folge-Events aus.

---

## 7. Bundle & Locking Tests
*   **T06-1 (Bundle Lock Integrity):**
    *   *Setup:* Item A wird Bundle X zugewiesen (Status → `BUNDLED`).
    *   *Test:* Nutzer ruft `POST /items/A/prepare-listing` auf.
    *   *Assert:* HTTP 409 Conflict. Item ist durch Bundle gelockt.

---

## 8. Capability Check Tests (Doc 04)
*   **T07-1 (Missing Required Field Deadlock):**
    *   *Setup:* Plattform verlangt `model`. `ProductTruth` = `UNKNOWN`. Kein generischer Fallback zulässig.
    *   *Test:* `POST /listings/:id/publish`.
    *   *Assert:* State Machine blockiert mit `BLOCKED_BY_PLATFORM_REQUIREMENT` oder wirft `ERR_CAPABILITY_CHECK_FAILED`.

---

## 9. Deletion & Hard-Delete Tests
*Ziel: Beweisen, dass Löschungen vollständig sind und saubere Trennung herrscht.*

*   **T08-1 (Verified Deletion Lifecycle):**
    *   *Test:* Triggern des Hard-Delete-Lifecycles.
    *   *Assert:* 
        1. DB-Cascade löscht relationale Personendaten (`users`, `items`, etc.).
        2. Job-Queue verifiziert asynchrone Medienlöschung (S3).
        3. Ein anonymer Eintrag in `deletion_audit_logs` mit `db_records_deleted: true` und `media_hard_deleted: true` wird als rechtlicher Nachweis (Endzustand) generiert.

## 10. Freeze Criteria
Dieses Dokument ist eingefroren. Jeder Feature-Pull-Request in der CI/CD-Pipeline **muss** beweisen, dass diese 9 Test-Suiten (T01-T08) fehlerfrei durchlaufen (TDD-Mandat).