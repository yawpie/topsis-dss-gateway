/*
  Warnings:

  - This migration destructively replaces the old schema with the TOPSIS schema
    from the project document. Existing data in users, students, criteria,
    alternatif, results, and processes will be removed.
*/

-- Drop new-schema tables first if this migration is reapplied in a reset flow.
DROP TABLE IF EXISTS "nilai_alternatif" CASCADE;
DROP TABLE IF EXISTS "hasil_topsis" CASCADE;
DROP TABLE IF EXISTS "alternatif" CASCADE;
DROP TABLE IF EXISTS "kriteria" CASCADE;

-- Drop old-schema tables.
DROP TABLE IF EXISTS "results" CASCADE;
DROP TABLE IF EXISTS "students" CASCADE;
DROP TABLE IF EXISTS "criteria" CASCADE;
DROP TABLE IF EXISTS "weights" CASCADE;
DROP TABLE IF EXISTS "processes" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Drop old enum types and recreate the new criterion type.
DROP TYPE IF EXISTS "CriterionType";
DROP TYPE IF EXISTS "ProcessStatus";
DROP TYPE IF EXISTS "JenisKriteria";

CREATE TYPE "JenisKriteria" AS ENUM ('BENEFIT', 'COST');

CREATE TABLE "users" (
    "id_user" SERIAL NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id_user")
);

CREATE TABLE "alternatif" (
    "id_alternatif" SERIAL NOT NULL,
    "kode_alternatif" VARCHAR(50) NOT NULL,
    "nama_alternatif" VARCHAR(255) NOT NULL,
    "provinsi" VARCHAR(255),

    CONSTRAINT "alternatif_pkey" PRIMARY KEY ("id_alternatif")
);

CREATE TABLE "kriteria" (
    "id_kriteria" SERIAL NOT NULL,
    "kode_kriteria" VARCHAR(50) NOT NULL,
    "nama_kriteria" VARCHAR(255) NOT NULL,
    "bobot" DECIMAL(18,6) NOT NULL,
    "jenis" "JenisKriteria" NOT NULL,

    CONSTRAINT "kriteria_pkey" PRIMARY KEY ("id_kriteria")
);

CREATE TABLE "nilai_alternatif" (
    "id_nilai" SERIAL NOT NULL,
    "id_alternatif" INTEGER NOT NULL,
    "id_kriteria" INTEGER NOT NULL,
    "nilai" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "nilai_alternatif_pkey" PRIMARY KEY ("id_nilai")
);

CREATE TABLE "hasil_topsis" (
    "id_hasil" SERIAL NOT NULL,
    "id_alternatif" INTEGER NOT NULL,
    "d_plus" DECIMAL(18,6) NOT NULL,
    "d_minus" DECIMAL(18,6) NOT NULL,
    "nilai_preferensi" DECIMAL(18,6) NOT NULL,
    "ranking" INTEGER NOT NULL,
    "kategori" VARCHAR(50) NOT NULL,

    CONSTRAINT "hasil_topsis_pkey" PRIMARY KEY ("id_hasil")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "alternatif_kode_alternatif_key" ON "alternatif"("kode_alternatif");
CREATE UNIQUE INDEX "kriteria_kode_kriteria_key" ON "kriteria"("kode_kriteria");
CREATE UNIQUE INDEX "kriteria_nama_kriteria_key" ON "kriteria"("nama_kriteria");
CREATE UNIQUE INDEX "nilai_alternatif_id_alternatif_id_kriteria_key" ON "nilai_alternatif"("id_alternatif", "id_kriteria");
CREATE INDEX "nilai_alternatif_id_alternatif_idx" ON "nilai_alternatif"("id_alternatif");
CREATE INDEX "nilai_alternatif_id_kriteria_idx" ON "nilai_alternatif"("id_kriteria");
CREATE UNIQUE INDEX "hasil_topsis_id_alternatif_key" ON "hasil_topsis"("id_alternatif");
CREATE INDEX "hasil_topsis_id_alternatif_idx" ON "hasil_topsis"("id_alternatif");

ALTER TABLE "nilai_alternatif" ADD CONSTRAINT "nilai_alternatif_id_alternatif_fkey" FOREIGN KEY ("id_alternatif") REFERENCES "alternatif"("id_alternatif") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nilai_alternatif" ADD CONSTRAINT "nilai_alternatif_id_kriteria_fkey" FOREIGN KEY ("id_kriteria") REFERENCES "kriteria"("id_kriteria") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hasil_topsis" ADD CONSTRAINT "hasil_topsis_id_alternatif_fkey" FOREIGN KEY ("id_alternatif") REFERENCES "alternatif"("id_alternatif") ON DELETE CASCADE ON UPDATE CASCADE;
