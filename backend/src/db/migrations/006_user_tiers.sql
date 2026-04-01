-- Migration 006: User tiers
-- Adds a `tier` column to users ('free' default, 'admin' for unlimited access).
-- Makes scheduling_pages.expires_at nullable so admin-tier users can create
-- pages that never expire.

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free';

ALTER TABLE scheduling_pages ALTER COLUMN expires_at DROP NOT NULL;
