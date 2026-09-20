# Personal Resale Assistant V2

> **Status:** Finalisierte Produkt- und Architekturdefinition (Architektur-Vertrag) für eine persönliche Single-User-App
> **Version:** V2.2 (Freeze Candidate) – Verkaufs-Konflikt-UI, Bundle-Relations-Constraints und verifizierbarer Hard-Delete präzisiert.
> **Ziel:** Eigene Gegenstände mit minimalem manuellen Aufwand erfassen, verifizieren, bewerten, für geeignete Marktplätze vorbereiten/veröffentlichen und Verkäufe zentral verfolgen.
> **Leitprinzip:** So einfach wie möglich für einen privaten Nutzer – aber mit einem belastbaren Datenmodell und klaren Sicherheits-/Provenienzregeln.

────────

## 1. Executive Summary

Die App ist kein reiner Cross-Listing-Wrapper. Sie ist ein persönlicher Verkaufsassistent und perspektivisch ein Personal Resale OS.

Der Nutzer soll möglichst wenig Formulare ausfüllen. Der bevorzugte Ablauf lautet:

```text
GEGENSTAND
    ↓
FOTO / ETIKETT / TYPENSCHILD
    ↓
KI-ANALYSE + OCR
    ↓
PRODUCT TRUTH
    ↓
NUTZER-BESTÄTIGUNG
    ↓
DISPOSITION (inkl. Bundles)
    ↓
PREIS + VERKAUFSSTRATEGIE
    ↓
CANONICAL LISTING
    ↓
PLATTFORM-PROJEKTION
    ↓
VERÖFFENTLICHUNG
    ↓
NACHRICHTEN / ANGEBOTE
    ↓
VERKAUF
    ↓
INVENTAR AKTUALISIEREN
```

### Kernversprechen

> **Fotografieren statt Formulare ausfüllen.**

Die App reduziert kognitive und operative Arbeit, ohne unbestätigte Tatsachen zu erfinden oder wesentliche Verkaufsentscheidungen heimlich selbst zu treffen.

────────

## 2. Produktvision

Die V2 löst drei Probleme gleichzeitig:

1. Erfassung: Was ist dieser Gegenstand?
2. Verkaufsentscheidung: Lohnt sich ein Verkauf und auf welchem Weg?
3. Ausführung: Wie bekomme ich ihn mit möglichst wenig Arbeit auf den passenden Marktplatz?

Die langfristige Vision ist:

```text
                 PERSONAL RESALE OS

                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       INVENTORY      SELLING       HISTORY
          │             │             │
          ▼             ▼             ▼
       Was habe ich?  Wie verkaufe   Was hat
                      ich es?       funktioniert?
```

Der Kern bleibt:

> **Ein Gegenstand → eine verlässliche Wahrheit → eine passende Verkaufs-/Verwertungsentscheidung → möglichst wenig Arbeit.**

────────

## 3. Zielgruppe und Scope

Die V2 ist bewusst auf einen privaten Nutzer ausgelegt. Typische Fälle: Wohnung ausmisten, Umzug, Kleidung/Elektronik/Möbel verkaufen.
Nicht Ziel der V2: Multi-Tenant-SaaS, Händler-Teams, Enterprise-Workflows.

────────

## 4. Unverrückbare Architekturprinzipien

### 4.1 ProductTruth First
Es gibt genau eine plattformneutrale Wahrheit über den konkreten Gegenstand. Ein Marktplatz darf diese Wahrheit formatieren, aber nicht verändern.

### 4.2 Never silently invent
Die KI darf erkennen und vorschlagen, aber **keine** unbestätigte Tatsache als bestätigt ausgeben (z.B. Marke, Modell, Zustand).

### 4.3 Unknown ist ein gültiger Zustand
`UNKNOWN ≠ INFERRED ≠ CONFIRMED`. „Ich weiß es nicht“ ist kein Anlass, eine plausible Antwort zu erfinden.

### 4.4 Plattformzwang verändert ProductTruth nicht
Erlaubt eine Plattform Fallbacks wie "Sonstige", geschieht dies *nur* in der Projection. Die `ProductTruth` bleibt `UNKNOWN`.

### 4.5 Deterministische Geschäftslogik
Das LLM liefert Kandidaten. Anwendungscode entscheidet über Pflichtfelder und Freigaben. Keine KI-gesteuerte Autonomie beim Veröffentlichen.

────────

## 5. Die zentrale fachliche Trennung

```text
OBSERVATION (Foto, OCR)
    ↓
CLAIM (KI-Vermutung)
    ↓
PRODUCT TRUTH (Vom Nutzer bestätigt / UNKNOWN)
    ↓
CANONICAL LISTING (Verkaufsdarstellung)
    ↓
LISTING PROJECTION (Plattform-Formatierung)
```

────────

## 6. Kern-User-Journey

1. **Capture:** Foto von Artikel, Etikett, Mängeln.
2. **Analyse:** KI extrahiert Fakten als "Claims".
3. **Adaptive Rückfragen:** Die App fragt nur Unsicherheiten ab.
4. **Review (Confidence Center):** Ampelsystem zur Bestätigung (Grün/Gelb/Rot).
5. **Disposition:** Lohnt der Einzelverkauf? (Ggf. Bundle/Spende).
6. **Preis:** KI liefert Spanne aus Marktdaten.
7. **Listing:** Live-API oder Mobile Share (Formatierungshilfe).
8. **Verkauf:** Item-Status wird zu SOLD.

────────

## 7. Umgang mit Unwissen und Deadlocks

Ein Nutzer kann bei einer Pflichtangabe sagen: "WEISS NICHT".
*   **Ebene A (Optional):** Feld bleibt leer.
*   **Ebene B (Generischer Wert erlaubt):** `ProductTruth = UNKNOWN`, `Projection = PLATFORM_GENERIC_VALUE`.
*   **Ebene C (Plattform blockiert):** Listing wird hart blockiert ("BLOCKED_BY_PLATFORM_REQUIREMENT").

────────

## 8. Canonical Listing und Marketplace Projection

Ein physischer Gegenstand ist genau ein Item.
Das Canonical Listing enthält Titel, Text, Preis, Zustand, Bilder. Die Projection enthält plattformspezifische IDs und Fallbacks.

────────

## 9. Live API vs. Formatierungshilfe

*   **Live API:** Direkter Push via eBay/Hood API.
*   **Formatierungshilfe:** PWA nutzt Web Share API für Smartphone Share Sheet (Text + Bilder).
*   **Fallback:** Bulk-Download/Copy-Paste-Anleitung. Keine Bot-Skripte (AGB-Konformität).

────────

## 10. Resale-OS-Kern & Disposition

Schätzwert < Schwelle (z.B. 10€) führt zu Warnhinweis. Aktionen: `[Trotzdem verkaufen]`, `[Als Bundle vormerken]`, `[Nicht weiterverfolgen]`.

────────

## 11. Bundle Engine (Datenmodell)

Ein Bundle ist ein eigenständiges Dispositionsobjekt, keine Listing-Sonderform.

```text
Item A ─┐
Item B ─┼─> Bundle ──> Canonical Listing ──> Listing Projection
Item C ─┘
```
**Relationale Eindeutigkeit:** Items werden über die Mapping-Tabelle `bundle_items` verknüpft. 
**Status-Lock:** Ein Item, das in ein Bundle aufgenommen wird, wird in seinem eigenen Lifecycle auf den Status `BUNDLED` gesperrt. Es kann nicht mehr einzeln bearbeitet oder gelistet werden, solange das Bundle existiert. Wird das Bundle verkauft, wechseln alle Kind-Items synchron auf `SOLD`.

────────

## 12. Cross-Listing und Verkaufs-Konflikte (Resolution Lifecycle)

Ein physischer Gegenstand darf nicht versehentlich mehrfach verkauft werden. Wird ein Artikel als verkauft bestätigt, markiert die Anwendung alle anderen aktiven Listings deterministisch als `CANCEL_PENDING`. Sofern die jeweilige Plattform eine autorisierte API-Aktion unterstützt, kann die Anwendung die Entfernung technisch vorbereiten bzw. ausführen. Andernfalls erzeugt sie eine konkrete Handlungsempfehlung bzw. Storno-/Rücknahmevorlage für den Nutzer. Eine erfolgreiche Entfernung wird erst nach bestätigtem Plattformstatus als abgeschlossen betrachtet.

**Konfliktauflösung (SALE_CONFLICT):**
Wenn mehrere Plattformen fast gleichzeitig einen Verkauf melden, handelt die App streng deterministisch und nicht autonom:

```text
MULTIPLE_SALE_EVENTS_DETECTED
        ↓
CONFLICT_REVIEW_REQUIRED (Item wird im UI gesperrt)
        ↓
Nutzer wählt den tatsächlichen Verkauf ("Sieger-Marktplatz")
        ↓
SALE_CONFIRMED (auf Sieger-Plattform)
        ↓
andere Listings → CANCEL_PENDING
        ↓
App generiert vorbereitete Storno-Nachricht (z.B. "Artikel wurde parallel verkauft...")
        ↓
Nutzer versendet Nachricht & bestätigt Checkliste im UI
        ↓
CONFLICT_RESOLVED
```
**UI-Zwang:** Das Dashboard zwingt den Nutzer in eine geführte Konfliktauflösung. Das Konflikt-Flag auf dem Item wird erst entfernt, wenn der Nutzer explizit bestätigt, dass die Storno-Nachrichten versendet wurden.

────────

## 13. Zustandsmodell (Lifecycle)

**Item:**
`NEW` → `ANALYZING` → `REVIEW_REQUIRED` → `READY` → `BUNDLED` (optional) → `LISTED` → `SOLD` → `ARCHIVED` (Zusätzlich: `SALE_CONFLICT`, `CANCELLED`)

**Listing:**
`DRAFT` → `READY` → `PUBLISHING` → `ONLINE` → `CANCEL_PENDING` → `SOLD`

────────

## 14. Datenmodell (SQL-Kern)

```sql
CREATE TABLE items (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL,
    -- ...
);

CREATE TABLE bundles (
    id UUID PRIMARY KEY,
    title TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mapping-Tabelle garantiert 1:n Zuordnung ohne Daten-Duplikation
CREATE TABLE bundle_items (
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE RESTRICT,
    PRIMARY KEY (bundle_id, item_id)
);

CREATE TABLE listings (
    id UUID PRIMARY KEY,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    marketplace TEXT NOT NULL,
    status TEXT NOT NULL,
    
    -- STRIKTER CONSTRAINT: Ein Listing ist entweder für ein Item ODER ein Bundle
    CONSTRAINT check_item_or_bundle CHECK (
        (item_id IS NOT NULL AND bundle_id IS NULL) OR 
        (item_id IS NULL AND bundle_id IS NOT NULL)
    )
);
```

────────

## 15. Sicherheit, Backup & Technische Löschverifikation (Hard-Delete)

Das Versprechen des "Nicht-Datengefängnisses" erfordert einen überprüfbaren, rückstandslosen Löschprozess für alle personenbezogenen Daten. Ein simples `is_deleted=true` Flag ist unzulässig.

### Der verifizierbare Deletion-Lifecycle

```text
DELETE_REQUESTED
      ↓
CONFIRMATION (Nutzer bestätigt via Auth-Faktor)
      ↓
DELETION_IN_PROGRESS
      ↓
MEDIA_DELETED (Physischer Hard-Delete aus S3)
      ↓
PERSONAL_DATA_DELETED (Kaskadierender Hard-Delete aus DB)
      ↓
ACCOUNT_DELETED
      ↓
DELETION_VERIFIED (Ausstellen der Lösch-Quittung)
```

**Technische Vorgaben für die rückstandslose Löschung:**
1. **Datenbank-Kaskade:** Durch `ON DELETE CASCADE` auf der `users`-Tabelle werden alle `items`, `listings`, `item_attributes` und OAuth-Tokens physisch aus der Postgres-Datenbank gelöscht.
2. **S3 Garbage Collection:** Ein asynchroner Cron-Job (Garbage Collector) vergleicht wöchentlich die S3-Buckets mit der Datenbank und löscht verwaiste Medien (Orphaned Files) physisch, falls der `MEDIA_DELETED` Schritt in der State Machine durch einen Netzwerkfehler unterbrochen wurde.
3. **Audit-Quittung:** Der Schritt `DELETION_VERIFIED` erzeugt einen anonymen, systeminternen Audit-Log-Eintrag (ohne Personenbezug), der technisch nachweist, dass der Lösch-Workflow erfolgreich beendet wurde (Compliance-Nachweis).
4. **Anonymisierte Betriebsdaten:** Reine Metriken (z. B. `platform_performance: eBay, days_to_sell: 5, final_price: 20`) werden vor der Accountlöschung von der `user_id` entkoppelt und für das System-Lernen (V3) behalten, da sie keinen Personen- oder Objektbezug mehr zulassen.

────────

## 16. Provider-Abstraktion & KI

KI-Anbieter bleiben austauschbar (z.B. Gemini, OpenAI, Local AI). 
Prompt- und Modellversionen werden pro Analyse-Job geloggt (`model`, `prompt_version`, `input_hash`).

────────

## 17. Definition of Success

Die App ist erfolgreich, wenn der Nutzer das Gefühl hat:
> **„Ich habe ein Foto gemacht – und der Rest war fast erledigt.“**

Technisch bleibt die App dabei streng:
*   Wahrheit vor Bequemlichkeit (`ProductTruth`)
*   Nutzerkontrolle vor Autonomie (`Never silently invent`)
*   Determinismus vor KI-Magie

Der Architektur-Vertrag ist hiermit geschlossen. Das Fundament für das Personal Resale OS steht bereit zur Implementierung.