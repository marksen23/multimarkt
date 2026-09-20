# Architekturvertrag Teil 4: API Contracts
> **Dokument:** 04_API_CONTRACTS.md
> **Version:** V2.2 (Freeze Candidate)
> **Zweck:** Definiert die kontrollierten Eintrittspunkte in das System. Das API erfindet keine neue Business-Logik, sondern exponiert ausschließlich die in Dokument 01 (SQL), 02 (State Machine) und 03 (Invariants) definierten, abgesicherten Fähigkeiten.

---

## 1. Purpose & Scope
Dieses Dokument spezifiziert die Verträge (Contracts) für die Kommunikation zwischen Frontend/Clients, externen Webhooks und dem Backend. 
**Grundregel:** Das API ist strikt Command-orientiert. Direkte Manipulationen des Domain-States (z.B. `PATCH /items/123 { "status": "SOLD" }`) sind strengstens untersagt. Das Backend verarbeitet ausschließlich Intentionen (Commands), wertet Invarianten aus und mutiert den State intern.

## 2. API Authority Model
Jeder API-Aufruf wird einem der drei in Doc 03 definierten Actor-Typen zugeordnet:
*   **USER:** Authentifizierter Besitzer der Ressourcen (JWT-Session).
*   **SYSTEM / INTERNAL_WORKER:** Background-Jobs oder Microservices im internen VPC.
*   **WEBHOOK:** Externe Aufrufe (z.B. von eBay), die durch Signaturen legitimiert sind, aber *niemals* Human-Gates passieren dürfen.

## 3. API Conventions
*   **Command-Design:** Aktionen, die den State der State-Machine ändern, werden als `POST /resource/:id/action-name` modelliert.
*   **HTTP-Status ≠ Business-Status:** Ein `HTTP 200/202` bedeutet lediglich, dass das Backend den Command nach Invarianten-Prüfung akzeptiert/verarbeitet hat. Er bedeutet *nicht*, dass ein nachgelagerter asynchroner Prozess (z.B. Listing-Publikation) bereits final erfolgreich war.

## 4. Authentication & Actor Context
Alle Routen (außer dedizierte Webhook-Endpoints) verlangen zwingend einen HTTP `Authorization: Bearer <Token>` Header. Die Middleware injiziert das `Actor`-Objekt (User-ID, Rolle, Capabilities) in den Request-Context.

## 5. Error Model
API-Fehler werden einheitlich als Standard-JSON zurückgegeben:
`{ "error_code": "STRING", "message": "...", "details": {} }`.
HTTP-Status-Semantik:
*   `400 Bad Request`: Payload-Validierung fehlgeschlagen.
*   `403 Forbidden`: Actor-Kontext darf diese Aktion nicht ausführen (z.B. Webhook ruft Human-Gate auf).
*   `409 Conflict`: Request verstößt gegen die aktuelle State-Machine (z.B. `confirm-truth` bei Item in `SOLD`).
*   `422 Unprocessable Entity`: Business-Invariante (Doc 03) verletzt.

## 6. Idempotency Model
Endpoints, die externe Side-Effects haben oder State mutieren (Publish, Cancel, Webhooks), erfordern zwingend Idempotenz.
*   **Webhooks:** Die Idempotenz wird aus dem externen Payload abgeleitet (z.B. Event-ID der Plattform).
*   **Client Commands:** Das Frontend sendet einen `Idempotency-Key` Header für kritische Mutationen (z.B. `resolve-conflict`).

---

## 7. Item APIs
*   `POST   /items` – Erstellt initiales Aggregat (State: `NEW`).
*   `GET    /items/:id` – Liest die ProductTruth (inkl. Provenance-Metadaten).
*   `POST   /items/:id/analyze` – Triggert die KI-Pipeline (State → `ANALYZING`).
*   `POST   /items/:id/confirm-truth` – **[Human-Gate]** Bestätigt die extrahierten Claims (State → `READY`).
*   `POST   /items/:id/prepare-listing` – Leitet das Canonical Listing ab.

## 8. Disposition APIs
*   `POST   /items/:id/bundle` – **[Human-Gate]** Erstellt ein Bundle aus Items (Status-Lock → `BUNDLED`).
*   `POST   /items/:id/disposition` – Setzt das dispositions-Ziel (Target Strategy).

## 9. Listing APIs
*   `POST   /listings` – Speichert den Projections-Entwurf (`DRAFT`).
*   `GET    /listings/:id`
*   `POST   /listings/:id/publish` – **[Human-Gate]** Triggert API-Publish oder Format-Helper-Export.
*   `POST   /listings/:id/cancel` – Triggert manuellen Storno-Prozess.

## 10. Bundle APIs
*   `POST   /bundles` – Erstellt Dispositions-Container.
*   `POST   /bundles/:id/items` – Fügt Kind-Items hinzu (XOR-Invariant-Check).
*   `POST   /bundles/:id/prepare-listing` – Äquivalent zu Item-API.

## 11. Sale APIs
*   `POST   /sale-events` – (Internal API) Legt eine Behauptung (Evidence) an.
*   `GET    /items/:id/sale-events` – Listet alle Konflikte/Events zu einem Item auf.

## 12. Conflict Resolution
*   `POST   /items/:id/resolve-conflict` – **[Human-Gate]** Bestätigt ein Event als `WINNER`.

---

## 13. Human Gates (Detailed Contracts)

### 13.1 `POST /items/:id/resolve-conflict`
*   **Actor:** `USER`
*   **Required Capability:** `item:resolve_sale_conflict`
*   **Preconditions:** 
    *   `item.status == 'SALE_CONFLICT'`
    *   `winning_sale_event_id` gehört zu `item`
    *   `winning_sale_event.status == 'CONFLICTED'`
*   **Forbidden:** `WEBHOOK`, `INTERNAL_WORKER`, `AI_SERVICE`
*   **State Transition:** 
    *   `winning event` → `HUMAN_SELECTED`
    *   `losing events` → `REJECTED`
    *   `winning listing` → `SOLD`
    *   `losing listings` → `CANCEL_PENDING`
    *   `item` → `SOLD`
*   **Side Effects:** Triggered ggf. API-Storno-Jobs für `losing listings`.
*   **Audit Event:** `CONFLICT_RESOLVED_BY_USER`
*   **Idempotency:** Erfordert Client `Idempotency-Key`. Mehrfachaufrufe mit demselben Key bei Status `SOLD` antworten mit 200 OK, ohne Seiteneffekte auszulösen.

### 13.2 `POST /items/:id/confirm-truth`
*   **Actor:** `USER`
*   **Preconditions:**
    *   `item.status == 'REVIEW_REQUIRED'`
    *   Payload enthält `condition` mit Zustand (z.B. `good`).
*   **Forbidden:** `WEBHOOK`, `AI_SERVICE`
*   **State Transition:** `REVIEW_REQUIRED` → `READY`
*   **Side Effects:** Setzt die Provenance in DB auf `USER_CONFIRMED`.

### 13.3 `POST /listings/:id/confirm-cancellation`
*   **Actor:** `USER` (für API-lose Plattformen) oder `SYSTEM` (Webhook-Polling für API-Plattformen)
*   **Preconditions:** `listing.status == 'CANCEL_PENDING'`
*   **State Transition:** `CANCEL_PENDING` → `CANCELLED`
*   **Audit Event:** `CANCELLATION_CONFIRMED_MANUALLY` oder `CANCELLATION_CONFIRMED_BY_API`.

---

## 14. Webhook Contracts
*   `POST /webhooks/:marketplace`
    *   **Actor:** `WEBHOOK`
    *   **Security:** Überprüfung der Plattform-Signatur (z.B. `X-EBAY-SIGNATURE`).
    *   **Behavior:** Payload wird geparst, an `POST /sale-events` als interner Job weitergeleitet (Idempotency über `external_event_id`). Der Endpunkt gibt asynchron HTTP 200 OK (oder 202) zurück, evaluiert aber synchron keine Folge-Businesslogik im selben Request-Cycle.

## 15. Capability Checks
*   `POST /listings/:id/capability-check`
    *   Prüft deterministisch vor dem Publish-Request, ob das Canonical Listing die Pflichtfelder (inkl. zulässiger Fallbacks) der Zielplattform erfüllt (Referenz auf Doc 01, Invariante).

## 16. Deletion APIs
*   `POST /account/deletion-request` – Startet den Hard-Delete Lifecycle (Doc 03).
*   `GET  /account/deletion-status` – Polling für den Nutzer bis `DELETION_VERIFIED`.

---

## 17. Response Schemas
*   Alle Responses umhüllen die Daten: `{ "data": { ... }, "meta": { "timestamp": "...", "version": "v2" } }`.
*   Für mutierende Commands wird nach Abschluss stets der aktualisierte Zustand (inklusive neuer State-Machine-Phase) zurückgeliefert, nicht nur ein `200 OK`.

## 18. Error Codes (Domain specific)
*   `ERR_STATE_TRANSITION_INVALID`: Aufruf ignoriert State-Machine-Flow.
*   `ERR_HUMAN_GATE_BYPASS`: Webhook/Job versucht Human-Verification zu überspringen.
*   `ERR_CAPABILITY_CHECK_FAILED`: Pflichtfelder für Plattform fehlen.
*   `ERR_UNCONFIRMED_CONDITION`: Versuch, ein Item ohne bestätigten Zustand zu listen.

## 19. Security Requirements
*   **Rate Limiting:** Zwingend auf externen Endpunkten (`USER` und public routes).
*   **Data Leakage:** Keine internen DB-IDs, sondern `UUIDs` für URLs. KI-Provider-Credentials verlassen *niemals* das Backend (Proxy-Pattern für alle AI-Anfragen).

## 20. API → State Machine Mapping
| API Command | Ziel-Zustand (Item) | Ziel-Zustand (Listing) |
| :--- | :--- | :--- |
| `POST /items/:id/confirm-truth` | `READY` | N/A |
| `POST /items/:id/bundle` | `BUNDLED` | N/A |
| `POST /listings/:id/publish` | N/A | `PUBLISHING` (API) oder `ONLINE` (Format Helper) |
| `POST /items/:id/resolve-conflict`| `SOLD` | `SOLD` (Winner), `CANCEL_PENDING` (Losers) |

## 21. API → Invariant Mapping
| API Design | Gesicherte Invariante (Doc 03) |
| :--- | :--- |
| Command-Pattern (`confirm-truth`) statt `PATCH` | State Integrity (Zustandsübergänge nur durch State Guard) |
| `Idempotency-Key` Headers | Concurrency / Idempotency (Kein 2. Publish bei Jitter) |
| Signatur-Check Middleware (`/webhooks/*`) | Marketplace Integrity (Webhooks) |
| HTTP 403 bei falschem Actor Context | Human-Gate Enforcement |

## 22. Freeze Criteria
Dieses Dokument ist eingefroren. Anpassungen an existierenden Commands oder das Öffnen neuer State-Machine-Hintertüren per HTTP-Endpoint erfordern ein Architektur-Audit und den synchronen Update von Dokument 02 und 03.