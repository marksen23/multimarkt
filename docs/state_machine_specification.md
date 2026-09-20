# Architekturvertrag Teil 2: State Machine Specification
> **Dokument:** 02_STATE_MACHINE_SPECIFICATION.md
> **Version:** V2.2 (Freeze Candidate)
> **Zweck:** Formaler Vertrag für alle Zustandsübergänge im Backend. Keine Zustandsänderung darf außerhalb dieses Regelwerks erfolgen.

---

## 1. Purpose and Scope
Dieses Dokument definiert die deterministischen Automaten (State Machines) für die Kern-Entitäten (`Item`, `Listing Projection`, `Bundle`, `Sale Event`). Es legt fest:
* Erlaubte Zustände und Übergänge.
* Harte Vor- und Nachbedingungen (Pre-/Postconditions).
* Die Position menschlicher Freigabe-Tore (Human-Gates), die von keiner KI und keinem externen Webhook übersprungen werden dürfen.
* Die Idempotenz-Anforderungen für externe Events.

## 2. State Vocabulary
*(Hinweis: Erfordert ein Update von `projection_lifecycle_state` im SQL-Modell um den Wert `CANCELLED`)*

*   **Item:** `NEW`, `ANALYZING`, `REVIEW_REQUIRED`, `READY`, `BUNDLED`, `LISTED`, `SOLD`, `ARCHIVED`, `SALE_CONFLICT`, `CANCELLED`
*   **Listing (Projection):** `DRAFT`, `READY`, `PUBLISHING`, `ONLINE`, `CANCEL_PENDING`, `CANCELLED`, `SOLD`
*   **Bundle:** `NEW`, `READY`, `LISTED`, `SOLD`, `CANCELLED`
*   **Sale Event:** `REPORTED`, `CONFLICTED`, `HUMAN_SELECTED`, `REJECTED` (für Verlierer-Listings)

## 3. Global Transition Rules
*   **Kein Überspringen:** Zustände dürfen nicht übersprungen werden (z. B. `DRAFT` → `ONLINE` ist verboten; es muss über `PUBLISHING` gehen).
*   **Kein Human-Gate-Bypass:** System-/Webhook-Aktionen enden strikt VOR einem Human-Gate. Der Übergang DURCH das Gate erfordert zwingend eine verifizierte Client-Payload (Nutzer-Aktion).
*   **Event-Unveränderlichkeit:** Events (wie `SALE_REPORTED`) sind append-only Beweise (Evidence) und ändern niemals rückwirkend ihren eigenen Payload, sondern triggern neue Zustände in der Aggregat-Root (z.B. Item).

## 4. Item State Machine
*   `NEW` ──(Foto-Upload)──→ `ANALYZING`
*   `ANALYZING` ──(KI fertig)──→ `REVIEW_REQUIRED`
*   `REVIEW_REQUIRED` ──(User speichert ProductTruth)──→ `READY`
*   `READY` ──(Bundle Erstellung)──→ `BUNDLED`
*   `READY` ──(Listing Start)──→ `LISTED`
*   `LISTED` ──(Einziger Verkauf gemeldet)──→ `SOLD`
*   `LISTED` ──(Mehrere Verkäufe)──→ `SALE_CONFLICT`
*   `SALE_CONFLICT` ──(User wählt Sieger)──→ `SOLD`
*   `SALE_CONFLICT` ──(User storniert alle)──→ `CANCELLED`
*   `SOLD` ──(Zeitablauf/Löschung)──→ `ARCHIVED`

## 5. Listing State Machine
*   `DRAFT` ──(Config komplett)──→ `READY`
*   `READY` ──(User drückt Publish)──→ `PUBLISHING`
*   `PUBLISHING` ──(API Success / User Copy)──→ `ONLINE`
*   `ONLINE` ──(Verkauf auf DIESER Plattform)──→ `SOLD`
*   `ONLINE` ──(Verkauf auf ANDERER Plattform)──→ `CANCEL_PENDING`
*   `CANCEL_PENDING` ──(API Confirm / User Confirm)──→ `CANCELLED`

## 6. Bundle State Machine
Ein Bundle aggregiert den Lifecycle seiner gebündelten Items.
*   `NEW` ──(Items zugewiesen)──→ `READY`
*   `READY` ──(Listing Start)──→ `LISTED`
*   `LISTED` ──(Verkauf gemeldet & bestätigt)──→ `SOLD`
*   *Postcondition `SOLD`: Alle zugewiesenen Items (die auf `BUNDLED` gelockt waren) wechseln synchron auf `SOLD`.*

## 7. Sale Event State Machine (Epistemischer Prozess)
Ein Sale Event ist zunächst nur eine Behauptung der Außenwelt.
*   `REPORTED` (Webhook trifft ein oder User klickt "Verkauft")
*   `REPORTED` ──(Check: Gibt es bereits andere?)──→ `CONFLICTED` (falls > 1) oder Verbleib auf `REPORTED`
*   `CONFLICTED` ──(User wählt aus)──→ `HUMAN_SELECTED` (für den Sieger) & `REJECTED` (für Verlierer)

## 8. SALE_CONFLICT Resolution
Wenn für ein einzelnes Item (oder Bundle) `SALE_REPORTED(A)` und `SALE_REPORTED(B)` eintreffen:
1.  Item geht deterministisch in Zustand `SALE_CONFLICT`.
2.  Das UI zwingt den Nutzer in ein `HUMAN_CONFLICT_REVIEW`.
3.  Nutzer wählt den tatsächlichen Gewinner-Verkauf aus (z.B. Sale A).
4.  Sale A wird zu `HUMAN_SELECTED` → Triggert Item zu `SOLD`.
5.  Listing A wird zu `SOLD`.
6.  Sale B wird zu `REJECTED`.
7.  Listing B geht deterministisch in `CANCEL_PENDING`.

## 9. CANCEL_PENDING Resolution
Die Auflösung von `CANCEL_PENDING` (z.B. für Listing B aus Punkt 8) gabelt sich nach Plattform-Fähigkeit:

**Pfad A: API-fähiger Marktplatz (z. B. eBay)**
*   `CANCEL_PENDING`
*   `API_CANCEL_REQUESTED` (System triggert asynchronen Job)
*   `PLATFORM_CONFIRMED_CANCEL` (API antwortet mit 200 OK)
*   `CANCELLED` (Status abgeschlossen)

**Pfad B: Nicht API-fähiger Marktplatz (z. B. Kleinanzeigen)**
*   `CANCEL_PENDING`
*   `CANCELLATION_ACTION_REQUIRED` (System generiert Storno-Text für den Nutzer)
*   `USER_SENDS_CANCELLATION` (Nutzer kopiert Text und sendet ihn)
*   `USER_CONFIRMS_ACTION` (Nutzer hakt Checkbox in App ab: "Ich habe den Artikel gelöscht/storniert")
*   `CANCELLED` (Status abgeschlossen)

## 10. Human-Gate Matrix
| Übergang | Automatisch | Human Gate | Bemerkung |
| :--- | :--- | :--- | :--- |
| `NEW` → `ANALYZING` | Ja | Nein | Startet bei Upload |
| `ANALYZING` → `REVIEW_REQUIRED` | Ja | Nein | KI Pipeline Output |
| `REVIEW_REQUIRED` → `READY` | Nein | **Ja** | ProductTruth Bestätigung |
| `READY` → `BUNDLED` | Nein | **Ja** | Disposition-Entscheidung |
| `READY` → `LISTED` | Nein | **Ja** | Publish Intent |
| `LISTED` → `SOLD` | Bedingt | **Ja** (Sale Confirmation) | Webhook bereitet vor, User/System validiert |
| `LISTED` → `SALE_CONFLICT` | Ja | Nein | Deterministischer Aggregat-Schutz |
| `SALE_CONFLICT` → `SOLD` | Nein | **Ja** | Manuelle Konfliktauflösung |
| `SALE_CONFLICT` → `CANCELLED`| Nein | **Ja** | Manuelle Konfliktauflösung |
| `SOLD` → `ARCHIVED` | Ja | Nein | Data Lifecycle Job |

## 11. Preconditions
*   **Precondition für `READY` (Item):** Item-Zustand (`condition`) muss explizit auf `USER_CONFIRMED` stehen.
*   **Precondition für `PUBLISHING` (Listing):** Capability-Check der Plattform (Pflichtfelder) muss `TRUE` zurückgeben.
*   **Precondition für `BUNDLED` (Item):** Item muss in `READY` sein. Darf keine aktiven `LISTED` Projections besitzen.

## 12. Postconditions
*   **Postcondition für `SOLD` (Item):** Alle Projections (Listings), die nicht das Sieger-Event ausgelöst haben, MÜSSEN deterministisch in `CANCEL_PENDING` versetzt werden.
*   **Postcondition für `BUNDLED` (Item):** Item ist gesperrt. Manipulationen der ProductTruth auf Item-Ebene sind untersagt, solange das Bundle existiert.

## 13. Forbidden Transitions
*   `UNKNOWN` → `CONFIRMED` ohne expliziten Nutzer-Payload.
*   `SALE_CONFLICT` → `SOLD` ausgelöst durch ein drittes eintreffendes Webhook-Event.
*   `CANCEL_PENDING` → `CANCELLED` ohne verifizierten Plattform-Status (API) oder explizites User-Acknowledge (Non-API).

## 14. Idempotency & Replay
*   Alle Webhook-Eingänge (z.B. eBay `ITEM_SOLD`) müssen mit einer eindeutigen Event-ID verarbeitet werden.
*   Trifft ein Event mit derselben ID bei einem Listing ein, das bereits in `SOLD`, `CANCEL_PENDING` oder einem nachfolgenden Zustand ist, wird das Event ignoriert (HTTP 200 OK an die Plattform, keine Zustandsänderung im Backend).
*   Das System ist streng replay-sicher: Die wiederholte Ausführung desselben State-Übergangs darf keinen inkonsistenten Folge-Zustand erzeugen.

## 15. Failure/Recovery Semantics
*   **API Timeouts bei `PUBLISHING`:** Status wechselt auf `FAILED_RETRY_PENDING` (Unterstatus von Publishing). Ein Background-Job versucht es mit Backoff erneut, bis Max-Retries erreicht sind. Dann Wechsel auf `DRAFT` mit Error-Log.
*   **Unterbrechung während `SALE_CONFLICT`:** Verlässt der Nutzer das UI ohne zu speichern, bleibt das Item strikt im `SALE_CONFLICT` hängen. Das Dashboard zwingt ihn bei der nächsten Session zur Rückkehr in den Auflösungs-Workflow.

## 16. Formal Invariants
*   **I1 – Kein illegaler Übergang:** Ein Item kann nicht von `READY` auf `SOLD` springen, ohne mindestens ein validiertes Listing-Objekt zu durchlaufen.
*   **I2 – Kein Human-Gate-Bypass:** `SALE_CONFLICT` → `SOLD` darf niemals durch einen Webhook oder einen System-Job evaluiert werden. Es erzwingt einen dokumentierten Audit-Trail (`actor: 'user'`).
*   **I3 – Kein falsches Cancellation-Completion:** `CANCEL_PENDING` darf nur dann zu `CANCELLED` werden, wenn eine kryptographisch verifizierte externe API-Bestätigung vorliegt (Pfad A) oder ein durch Nutzer-Session signierter Request (Pfad B).
*   **I4 – Kein paralleler Verkauf:** Ist ein Item `SOLD`, darf eine Query nach aktiven Listings (`status IN ('ONLINE', 'PUBLISHING')`) für dieses Item exakt 0 Ergebnisse liefern.
*   **I5 – Replay-Sicherheit:** Die Ingestion-Schicht garantiert, dass duplicate Webhooks die Postconditions nicht mehrfach triggern (z.B. mehrfaches Setzen von Verlierern auf `CANCEL_PENDING`).

## 17. Test Obligations
Entwickler müssen für diese Spezifikation folgende automatisierte Test-Suiten bereitstellen:
1.  **Gate-Bypass-Tests:** Assertions, die sicherstellen, dass API-Calls zur Zustandsänderung auf `READY` oder `SOLD` (aus Conflict) ohne gültigen User-Context hart abgelehnt werden (HTTP 403/400).
2.  **Concurrency/Race-Condition-Tests:** Simulieren von zwei exakt gleichzeitigen `SALE_REPORTED` Webhooks auf dasselbe Item. Assert: Endzustand MUSS `SALE_CONFLICT` sein, keines darf autonom `SOLD` werden.
3.  **Idempotency-Tests:** Replay von Webhook-Payloads auf alle Zustände.

## 18. Freeze Criteria
Dieses Dokument gilt als eingefroren. Anpassungen an den Invarianten (I1-I5) oder das Entfernen von Human-Gates erfordern zwingend eine neue Major-Version des Architekturvertrags und ein formales Audit der rechtlichen Risiken (insbesondere bzgl. autonomen Vertragsabschlüssen).