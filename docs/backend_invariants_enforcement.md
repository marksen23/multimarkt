# Architekturvertrag Teil 3: Backend Invariants & Enforcement
> **Dokument:** 03_BACKEND_INVARIANTS.md
> **Version:** V2.2 (Freeze Candidate)
> **Zweck:** Technische Durchsetzung (Enforcement) der Daten- und Zustandsregeln. Definiert, wie das Backend physisch verhindert, dass Invarianten durch APIs, Webhooks, Jobs oder Fehler umgangen werden.

---

## 1. Purpose
Während das Datenmodell (SQL) die Speicherung und die State Machine (Doc 02) die logischen Prozesse definiert, legt dieses Dokument die **technischen Wächter (Enforcement Mechanisms)** im Backend fest. Es garantiert, dass keine Business-Regel durch unautorisierte Aufrufer, asynchrone Race-Conditions oder fehlschlagende Transaktionen kompromittiert wird.

## 2. Authority Model
Das Backend unterscheidet streng zwischen drei Akteuren (Actors) mit asymmetrischen Rechten:
1.  **User (Authenticated Session):** Darf Human-Gates passieren (z.B. ProductTruth bestätigen, Konflikte auflösen).
2.  **System / Job (Internal Worker):** Darf API-Calls zu externen Marktplätzen ausführen und asynchrone Retries steuern. Darf **niemals** Human-Gates überspringen.
3.  **Webhook (External Platform):** Darf ausschließlich Events (Claims/Evidence) injizieren, aber **niemals** direkte Zustandsänderungen auf dem Aggregat (Item) erzwingen.

## 3. Invariant Classes

### 3.1 Data Integrity
Kein Datenpunkt darf ohne verifizierte Provenance (Herkunft) geschrieben werden.

### 3.2 State Integrity
Zustandsübergänge dürfen nur durch einen zentralisierten State Guard (z.B. XState-Interpreter oder striktes State-Pattern) ausgeführt werden.

### 3.3 Epistemic Integrity
Die Trennung zwischen `UNKNOWN`, `INFERRED` und `CONFIRMED` ist absolut. Das Backend darf niemals ein `INFERRED` Feld durch fehlende Nutzerinteraktion stillschweigend zu `CONFIRMED` eskalieren.

### 3.4 Human-Gate Integrity
Routen/Services, die menschliche Entscheidungen implementieren, verlangen zwingend einen User-Actor-Context. Webhook-Tokens oder Job-Berechtigungen werden hart mit HTTP 403 / Unauthorized abgelehnt.

### 3.5 Marketplace Integrity
Eine Formatierungshilfe (Copy/Paste-Plattform) darf systemintern niemals als "Live-API-Integration" behandelt werden. Das Backend verlässt sich hierbei nicht auf API-Responses, sondern ausschließlich auf Human Assertions.

### 3.6 Concurrency Integrity
Parallele, asynchrone Zugriffe (z.B. zwei gleichzeitige Sale-Webhooks) auf dasselbe Item müssen durch atomare Datenbank-Transaktionen und Row-Level-Locks sequentialisiert werden.

### 3.7 Deletion Integrity
Hard-Deletes müssen kaskadierend alle Relationen und physischen Dateien abräumen, verifiziert durch einen nachgelagerten Audit-Log.

---

## 4. ProductTruth Invariants
*   **Enforcement:** Der Backend-Service für das Speichern des Confidence Centers validiert die Payload gegen das SQL-Schema. Ist das `condition`-Feld nicht explizit in der Payload als `USER_CONFIRMED` markiert, wird der Übergang nach `READY` vom State Guard blockiert und mit HTTP 422 abgelehnt.
*   **Kein Fallback-Bleed:** Fallbacks für Marktplätze (z.B. `Sonstige`) dürfen nicht in die `product_truth`-Tabelle geschrieben werden. Sie werden zur Laufzeit in der `ListingProjection`-Schicht generiert.

## 5. UNKNOWN / INFERRED / USER_CONFIRMED
*   **Enforcement:** Backend-APIs, die KI-Ergebnisse (Vision/Web Grounding) entgegennehmen, MÜSSEN den Status der Attribute hart auf `INFERRED` oder `UNKNOWN` setzen. Ein API-Call vom AI-Service darf keinen Payload senden, der `USER_CONFIRMED` enthält. Dieser Status ist kryptographisch/session-technisch an den Client des Nutzers gebunden.

## 6. Listing Publication Invariants
*   **Enforcement:** Vor jedem `PUBLISHING`-Event wird der `CapabilityCheck`-Service aufgerufen. Fehlt ein von der Zielplattform verlangtes Pflichtfeld und es existiert kein generischer Fallback, blockiert das Backend den Job und wirft eine `PlatformRequirementError`-Exception.

## 7. Bundle Invariants
*   **Enforcement:** Eine Datenbanktransaktion stellt sicher, dass das `bundle_items` Mapping nur geschrieben wird, wenn die Kind-Items im Status `READY` sind. Das Update-Statement lockt die Items (`SELECT FOR UPDATE`) und schaltet sie auf `BUNDLED`. XOR-Constraint in der Datenbank (`canonical_listings`) garantiert, dass ein Listing niemals ein Item UND ein Bundle mischt.

## 8. Sale Invariants
*   **Enforcement:** `sale_events` werden als append-only Log geschrieben. Ein Sale Event ändert *nicht* sofort das Item auf `SOLD`. Die Aggregat-Root-Logik evaluiert nach dem Insert, ob es sich um den einzigen Verkauf handelt (→ `SOLD`) oder um einen von mehreren (→ `SALE_CONFLICT`).

## 9. SALE_CONFLICT Invariants
*   **Enforcement:** Trifft ein `SALE_REPORTED` Webhook ein, wird die Tabelle `items` mit `SELECT ... FOR UPDATE` gelockt.
*   Trifft während des Locks ein zweiter Webhook für dasselbe Item ein, muss dieser warten.
*   Nach dem ersten Insert sieht die zweite Transaktion, dass bereits ein Sale existiert. Der Status geht dadurch atomar und deterministisch in `SALE_CONFLICT`. Zwei Webhooks können niemals eine Race-Condition auslösen, die das Item illegalerweise zweimal auf `SOLD` setzt.

## 10. CANCEL_PENDING Invariants
Das Backend differenziert strikt zwischen:
*   **Authoritative API Response (z.B. eBay):** Der Endpunkt empfängt ein HTTP 200/204 auf den Storno-Call. Das Backend wertet dies als verifizierten Abschluss → `CANCELLED`.
*   **Human Assertion (z.B. Kleinanzeigen):** Der Nutzer klickt "Ich habe es storniert". Das Backend verbucht dies als Audit-Log (Actor: User) und wertet die Assertion als Abschluss → `CANCELLED`.
*   *Enforcement:* Das System darf niemals einen API-Call-Timeout als erfolgreiches Storno interpretieren.

## 11. Human-Gate Enforcement
*   **Enforcement:** Middleware/Guards auf Controller-Ebene überprüfen den JWT/Session-Kontext.
*   Routen wie `POST /items/:id/resolve-conflict` oder `POST /items/:id/confirm-truth` verlangen das Role/Actor-Tag `USER`. Internal-Service-Tokens (z.B. von BullMQ oder Webhook-Receivern) werden hart blockiert.

## 12. Webhook / Event Ingestion
*   **Enforcement:** Die `sale_events` Tabelle benötigt einen UNIQUE Constraint auf `(marketplace_key, external_event_id)`.
*   Jeder eintreffende Webhook muss vom Ingestion-Service validiert (Signature Check, z.B. eBay `X-EBAY-SIGNATURE`) und auf sein natives Format geparst werden.

## 13. Idempotency
*   **Enforcement:** Sendet eine Plattform denselben Webhook mehrfach (z.B. bei Network Jitter), fängt der UNIQUE Constraint auf der `external_event_id` dies auf (Insert schlägt fehl bzw. wird mit `ON CONFLICT DO NOTHING` behandelt).
*   Das Backend antwortet der Plattform mit HTTP 200 OK (um weitere Replays zu stoppen), löst aber *keine* erneute State-Machine-Evaluation aus.

## 14. Transaction & Locking Rules
*   **Rule 1:** Lesende Zugriffe, die eine Zustandsänderung (Mutation) ableiten, müssen zwingend row-level Locks (`SELECT ... FOR UPDATE`) auf das Aggregat (`items`) anwenden.
*   **Rule 2:** Datenbanktransaktionen müssen so kurz wie möglich sein. Externe API-Aufrufe (Publishing auf eBay) dürfen **niemals** innerhalb einer laufenden SQL-Transaktion blockieren.

## 15. Deletion Invariants
*   **Enforcement:** Der `ACCOUNT_DELETED` Flow triggert den `DELETE FROM users` Befehl. Postgres `ON DELETE CASCADE` räumt relationale Daten ab.
*   Eine asynchrone S3-Garbage-Collection (Background Job) vergleicht S3-Bucket-Inhalte mit verbliebenen DB-Records und löscht verwaiste Medien (Orphaned Files). Das Backend dokumentiert den Abschluss mit einem anonymen Audit-Eintrag.

## 16. Forbidden Backend Operations
Folgende technische Muster sind im Codebase verboten und führen zum Scheitern der CI/CD-Pipeline (Code Review Rules):
*   Direkte `UPDATE items SET status = ...` Aufrufe außerhalb des dedizierten State-Machine-Services.
*   Bedingtes Ausführen von Business-Logik basierend auf reinen HTTP-Statuscodes von Webhooks, ohne die Kryptographie der Payload zu prüfen.
*   Das Mischen von `ProductTruth`-Updates und `ListingProjection`-Updates in einer einzigen Service-Methode.

## 17. Error Semantics
*   Prozess-Subzustände wie `FAILED_RETRY_PENDING` oder `API_CANCEL_REQUESTED` sind **keine** permanenten Datenbank-Enums im `projection_lifecycle_state`.
*   Sie werden als BullMQ Job-States (Queue Status) oder im Feld `last_error` modelliert.
*   Das Backend unterscheidet zwischen *transienten* Fehlern (z.B. HTTP 503 von eBay → Auto-Retry durch BullMQ) und *permanenten* Fehlern (z.B. HTTP 400 Validation Error → Status geht auf `FAILED`, Nutzer muss interagieren).

## 18. Security Boundary
*   **Internal API:** Services (AI, Queue Workers) kommunizieren über ein geschlossenes Netzwerk (VPC) oder authentifizierte gRPC/REST Calls.
*   **External API:** Endpunkte für das Web-/Mobile-Frontend. Rate-Limited, Session-based.
*   **Webhook Ingestion:** Öffentlich erreichbar, aber Payload-Validierung ist der allererste Schritt im Controller.

## 19. Invariant → Enforcement Mapping

| Invariante | Durchsetzungsebene |
| :--- | :--- |
| `UNKNOWN` darf nicht bestätigt sein | DB `CHECK` Constraint + Service-Validation |
| `BUNDLED` Item darf nicht einzeln gelistet werden | DB XOR Constraint (`canonical_listings`) + State Guard |
| `SALE_CONFLICT` darf nicht autonom `SOLD` werden | State Guard + Actor Context Requirement (`USER`) |
| Doppelter Webhook darf keine 2. Aktion auslösen | DB `UNIQUE` (`external_event_id`) + `ON CONFLICT` Ignorieren |
| `CANCEL_PENDING` ≠ `CANCELLED` | State Guard (Verlangt explizites Command von API oder User) |
| `SOLD` darf keine aktiven Listings besitzen | BullMQ Queue Delisting Job + DB Transaction |
| User-Gate darf nicht durch API/Webhook umgangen werden | Auth-Middleware (Actor/Capability Check = `USER`) |
| Hard-Delete entfernt personenbezogene Kinddaten | DB `ON DELETE CASCADE` + S3 Garbage Collector Job |

## 20. Invariant → Test Mapping (Preview for Doc 05)
Das QA-/Test-Framework wird diese Invarianten direkt validieren:
*   *Test:* Senden eines `sale_reported` Webhooks mit einem `Internal-System-Token` auf den Endpunkt für die menschliche Konfliktauflösung. → Assert: HTTP 403 Forbidden.
*   *Test:* Gleichzeitiges Abfeuern von zwei `sale_reported` Webhooks für dasselbe Item. → Assert: Kein Race-Condition-Absturz, Item landet in `SALE_CONFLICT`.

## 21. Freeze Criteria
Dieses Dokument ist eingefroren. Änderungen an den Invarianten (insbesondere das Aufweichen der Human-Gates oder der Concurrency Locks) bedürfen einer formalen Architektur-Revision. Neue Marktplätze erfordern lediglich neue Adapter-Implementationen, aber keine Änderung dieses Backend-Vertrags.