-- Run this once against the Railway PostgreSQL database AFTER taking a backup.
-- Safe to re-run: existing rows and settings are preserved.
ALTER TABLE "SiteConfig"
ADD COLUMN IF NOT EXISTS "taxPaused" BOOLEAN NOT NULL DEFAULT FALSE;
