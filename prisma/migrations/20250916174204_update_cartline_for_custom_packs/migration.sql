/*
  Warnings:

  - You are about to drop the column `flavorId` on the `CartItem` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ProductFlavor" DROP CONSTRAINT "ProductFlavor_flavorId_fkey";

-- DropIndex
DROP INDEX "public"."CartItem_flavorId_idx";

-- AlterTable
ALTER TABLE "public"."CartItem" DROP COLUMN "flavorId",
ADD COLUMN     "flavorIds" TEXT[];

-- AlterTable
ALTER TABLE "public"."CartLine" ADD COLUMN     "flavorIds" TEXT[],
ALTER COLUMN "recipeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CartItem_flavorIds_idx" ON "public"."CartItem"("flavorIds");

-- CreateIndex
CREATE INDEX "CartLine_flavorIds_idx" ON "public"."CartLine"("flavorIds");

-- AddForeignKey
ALTER TABLE "public"."ProductFlavor" ADD CONSTRAINT "ProductFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "public"."Flavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
