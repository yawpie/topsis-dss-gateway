/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `criteria` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "criteria_name_key" ON "criteria"("name");
