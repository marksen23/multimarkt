-- KORREKTUR basierend auf 02_STATE_MACHINE_SPECIFICATION.md
-- Hinzufügen von CANCELLED zum Listing/Projection State

ALTER TYPE projection_lifecycle_state ADD VALUE 'CANCELLED' AFTER 'CANCEL_PENDING';