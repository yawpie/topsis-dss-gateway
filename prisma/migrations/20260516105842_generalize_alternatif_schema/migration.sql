-- Generalize alternatif schema:
-- 1. Rename provinsi → metadata (preserves any existing data)
-- 2. Make nama_alternatif optional
-- 3. Change metadata column type to TEXT

-- Rename column to preserve data
ALTER TABLE "alternatif" RENAME COLUMN "provinsi" TO "metadata";

-- Change type from VARCHAR(255) to TEXT
ALTER TABLE "alternatif" ALTER COLUMN "metadata" TYPE TEXT;

-- Make nama_alternatif optional
ALTER TABLE "alternatif" ALTER COLUMN "nama_alternatif" DROP NOT NULL;
