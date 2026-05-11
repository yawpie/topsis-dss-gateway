/*
  Warnings:

  - You are about to drop the `weights` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[unique_name]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `weight` to the `criteria` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `criteria` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `unique_name` to the `students` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CriterionType" AS ENUM ('BENEFIT', 'COST');

-- CreateEnum
CREATE TYPE "ProcessStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "weights" DROP CONSTRAINT "weights_criterion_id_fkey";

-- AlterTable
ALTER TABLE "criteria" ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "CriterionType" NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "unique_name" TEXT NOT NULL;

-- DropTable
DROP TABLE "weights";

-- CreateTable
CREATE TABLE "results" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processes" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProcessStatus" NOT NULL,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "results_student_id_key" ON "results"("student_id");

-- CreateIndex
CREATE INDEX "idx_student_id" ON "results"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_unique_name_key" ON "students"("unique_name");

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
