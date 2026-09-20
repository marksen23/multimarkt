-- ==============================================================================
-- PERSONAL RESALE ASSISTANT V2 - SQL-DATENMODELL (Core)
-- Umsetzung der Architektur-Spezifikation V2.2
-- ==============================================================================

-- ==============================================================================
-- 1. TYPEN & ENUMS (State Machines & Provenance)
-- ==============================================================================

-- Lifecycle des physischen Gegenstands (§13)
CREATE TYPE item_lifecycle_state AS ENUM (
    'NEW', 
    'ANALYZING', 
    'REVIEW_REQUIRED', 
    'READY', 
    'BUNDLED', 
    'LISTED', 
    'SOLD', 
    'ARCHIVED', 
    'SALE_CONFLICT', 
    'CANCELLED'
);

-- Epistemische Zustände für das "Never silently invent" Prinzip (§4.2, §4.3)
CREATE TYPE truth_state AS ENUM (
    'UNKNOWN', 
    'INFERRED', 
    'USER_CONFIRMED'
);

-- Lifecycle der plattformspezifischen Listings (§13, §12)
CREATE TYPE projection_lifecycle_state AS ENUM (
    'DRAFT', 
    'READY', 
    'PUBLISHING', 
    'ONLINE', 
    'CANCEL_PENDING', 
    'SOLD'
);

-- ==============================================================================
-- 2. KERN-TABELLEN & HARD-DELETE KASKADEN (§15)
-- ==============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    -- ON DELETE CASCADE in Kind-Tabellen garantiert den rückstandslosen Hard-Delete
);

-- PRODUCT TRUTH: Der physische Gegenstand
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status item_lifecycle_state NOT NULL DEFAULT 'NEW',
    
    -- Basisdaten (werden erst ab READY als validiert betrachtet)
    title TEXT,
    condition TEXT, 
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PROVENANCE: Detail-Attribute mit exaktem Herkunftsnachweis
CREATE TABLE item_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    attribute_key TEXT NOT NULL, -- z.B. 'brand', 'model', 'size'
    attribute_value TEXT,        -- NULL erlaubt, wenn truth_state = 'UNKNOWN'
    
    truth_state truth_state NOT NULL DEFAULT 'UNKNOWN',
    source TEXT NOT NULL,        -- z.B. 'GEMINI_VISION', 'USER_INPUT', 'OCR'
    
    -- Invariante: Wenn der Status USER_CONFIRMED ist, darf der Wert nicht beliebig erfunden sein.
    CONSTRAINT check_unknown_value CHECK (
        (truth_state = 'UNKNOWN' AND attribute_value IS NULL) OR 
        (truth_state != 'UNKNOWN' AND attribute_value IS NOT NULL)
    ),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, attribute_key)
);

-- BUNDLE ENGINE (§11)
CREATE TABLE bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status item_lifecycle_state NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BUNDLE MAPPING: Verhindert Duplikation und erzwingt Status-Locks
CREATE TABLE bundle_items (
    bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    PRIMARY KEY (bundle_id, item_id)
);

-- ==============================================================================
-- 3. CANONICAL LISTING & PROJECTIONS (§8)
-- ==============================================================================

-- Die plattformneutrale Verkaufsdarstellung
CREATE TABLE canonical_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    
    selling_price NUMERIC(10, 2) NOT NULL,
    description_text TEXT NOT NULL,
    
    -- INVARIANTE: Ein Canonical Listing repräsentiert IMMER entweder ein Item ODER ein Bundle (XOR).
    CONSTRAINT check_item_or_bundle_listing CHECK (
        (item_id IS NOT NULL AND bundle_id IS NULL) OR 
        (item_id IS NULL AND bundle_id IS NOT NULL)
    ),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Die plattformspezifische Formatierung und Status-Verwaltung
CREATE TABLE marketplace_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_listing_id UUID NOT NULL REFERENCES canonical_listings(id) ON DELETE CASCADE,
    
    marketplace_id TEXT NOT NULL, -- 'EBAY', 'KLEINANZEIGEN'
    status projection_lifecycle_state NOT NULL DEFAULT 'DRAFT',
    
    -- Plattform-Spezifika und Fallbacks (§4.4)
    external_platform_id TEXT, 
    fallback_data JSONB DEFAULT '{}', -- z.B. {"model": "Sonstige"}
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (canonical_listing_id, marketplace_id)
);

-- ==============================================================================
-- 4. VERKAUFS-KONFLIKTE & RESOLUTION (§12)
-- ==============================================================================

CREATE TABLE sale_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projection_id UUID NOT NULL REFERENCES marketplace_projections(id) ON DELETE CASCADE,
    
    reported_price NUMERIC(10, 2) NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Konfliktmanagement
    is_winner BOOLEAN, -- NULL = noch unentschieden (SALE_CONFLICT), TRUE = Sieger, FALSE = Verlierer (Storno nötig)
    cancellation_confirmed BOOLEAN NOT NULL DEFAULT false, -- Wurde das Storno vom Nutzer bestätigt?
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 5. LÖSCH-VERIFIKATION (Hard-Delete Compliance §15)
-- ==============================================================================

-- Diese Tabelle überlebt den ON DELETE CASCADE des Users bewusst, 
-- speichert aber KEINE personen- oder objektbezogenen Daten mehr.
CREATE TABLE deletion_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymized_user_hash TEXT NOT NULL, -- Kryptographischer Hash, nicht rückrechenbar
    media_hard_deleted BOOLEAN NOT NULL DEFAULT false,
    db_records_deleted BOOLEAN NOT NULL DEFAULT false,
    deletion_completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indices
CREATE INDEX idx_item_attributes_item ON item_attributes(item_id);
CREATE INDEX idx_marketplace_projections_canonical ON marketplace_projections(canonical_listing_id);