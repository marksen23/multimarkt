-- ==============================================================================
-- Entwicklungsplan Phase 0: ProductTruth & Provenance Schema (PostgreSQL)
-- ==============================================================================

-- 1. ENUMS FÜR LIFECYCLE UND PROVENANCE
-- ==============================================================================

-- Der gesamte Lebenszyklus eines Artikels (State Machine)
CREATE TYPE lifecycle_state AS ENUM (
    'CAPTURED',         -- Fotos hochgeladen, KI-Analyse läuft
    'REVIEW_REQUIRED',  -- KI ist fertig, wartet auf Nutzerbestätigung
    'READY',            -- Fakten sind bestätigt, Disposition (Preis/Strategie) steht
    'PUBLISHED',        -- Auf mind. einer Plattform online
    'INTERESTED',       -- Erste Anfragen/Klicks generiert
    'NEGOTIATING',      -- Aktiver Preiskampf/Chat
    'RESERVED',         -- Blockiert (z.B. Käufer kommt morgen)
    'SOLD',             -- Erfolgreich vermittelt
    'PAYMENT_PENDING',  -- Warte auf Geld
    'SHIPPED',          -- Versendet / Übergeben
    'COMPLETED',        -- Abgeschlossen & Bewertet
    'ARCHIVED'          -- Gelöscht / Nicht verkauft
);

-- Die 3 Schichten der Datenwahrheit (PUBLISHED ist der Zustand des Listings, nicht des Fakts)
CREATE TYPE data_status AS ENUM (
    'OBSERVED',         -- Rohdaten (z.B. roher OCR Text)
    'INFERRED',         -- KI-Schlussfolgerung (z.B. "Marke ist vermutlich Nike")
    'USER_CONFIRMED'    -- Vom Menschen abgesegnet (Die ultimative Wahrheit)
);

-- Die Quelle einer Information (Audit-Trail)
CREATE TYPE data_source AS ENUM (
    'CAMERA_RAW',
    'OCR_PIPELINE',
    'GEMINI_VISION',
    'WEB_GROUNDING',
    'USER_INPUT',
    'BUYER_MESSAGE'
);

-- Zustands-Kategorien (rechtlich bindend)
CREATE TYPE product_condition AS ENUM (
    'NEW',
    'LIKE_NEW',
    'GOOD',
    'FAIR',
    'DEFECTIVE'
);


-- 2. KERN-TABELLEN
-- ==============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OBSERVED DATA: Hier landen alle Roh-Eingaben (Bilder, Texte), BEVOR sie gedeutet werden.
CREATE TABLE observed_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_type data_source NOT NULL,
    raw_payload JSONB NOT NULL, -- z.B. das exakte JSON der Google Cloud Vision API oder S3-Links zu Bildern
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCT TRUTH: Das Herzstück der Architektur
CREATE TABLE product_truth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Lifecycle
    state lifecycle_state NOT NULL DEFAULT 'CAPTURED',
    
    -- Explizite, rechtlich kritische Felder
    -- Zustand MUSS getrennt vom JSON sein, da wir hier Datenbank-Constraints brauchen
    condition_value product_condition,
    condition_status data_status,
    condition_confidence NUMERIC(3,2), -- 0.00 bis 1.00
    
    -- Disposition & Strategie (Was will der Nutzer?)
    target_strategy TEXT CHECK (target_strategy IN ('FAST', 'BALANCED', 'MAX_PROFIT', 'DONATE', 'DISCARD')),
    min_acceptable_price NUMERIC(10, 2),
    
    -- Dynamische Attribute mit Provenance
    -- Erwartetes Format:
    -- {
    --   "brand": { "value": "Nike", "status": "USER_CONFIRMED", "source": "USER_INPUT", "confidence": 1.0 },
    --   "color": { "value": "Black", "status": "INFERRED", "source": "GEMINI_VISION", "confidence": 0.85 }
    -- }
    attributes JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. HARTE REGELN (CONSTRAINTS) - "Never silently invent"
-- ==============================================================================

-- VERIFIKATIONS-REGEL: Ein Produkt darf den Status REVIEW_REQUIRED nicht überschreiten, 
-- wenn der Zustand (condition) nicht explizit vom Nutzer bestätigt wurde.
ALTER TABLE product_truth ADD CONSTRAINT require_user_confirmed_condition
CHECK (
    -- Wenn der Status kleiner als READY ist, ist alles okay...
    state IN ('CAPTURED', 'REVIEW_REQUIRED') 
    OR 
    -- ...aber ab READY MUSS der Zustand vom Nutzer bestätigt sein!
    (state NOT IN ('CAPTURED', 'REVIEW_REQUIRED') AND condition_status = 'USER_CONFIRMED')
);


-- 4. LISTING PROJECTIONS (Die Sichten für die Marktplätze)
-- ==============================================================================

CREATE TABLE listing_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_truth_id UUID REFERENCES product_truth(id) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- 'EBAY', 'KLEINANZEIGEN', 'VINTED'
    
    -- Die für diese Plattform generierten Daten
    projected_title TEXT NOT NULL,
    projected_description TEXT NOT NULL,
    projected_price NUMERIC(10, 2) NOT NULL,
    
    -- Plattform-Spezifika (z.B. die spezifische Kategorie-ID von eBay)
    platform_category_id TEXT,
    
    -- Status auf dem externen Marktplatz
    external_listing_id TEXT,
    is_active BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LERN- & HEURISTIK-TABELLEN (Vorbereitung für Phase 2 & 3)
-- ==============================================================================

CREATE TABLE marketplace_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_projection_id UUID REFERENCES listing_projections(id) ON DELETE SET NULL,
    product_truth_id UUID REFERENCES product_truth(id) ON DELETE CASCADE,
    
    platform TEXT NOT NULL,
    final_sale_price NUMERIC(10,2),
    days_to_sell INTEGER,
    messages_received INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexe für Performance bei Suchen in JSONB
CREATE INDEX idx_product_attributes ON product_truth USING GIN (attributes);
CREATE INDEX idx_product_state ON product_truth (state);