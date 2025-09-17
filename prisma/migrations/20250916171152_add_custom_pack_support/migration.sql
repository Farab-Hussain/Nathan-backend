/*
  Warnings:

  - Added the required column `sku` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `CartItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Product_sku_key";

-- AlterTable
ALTER TABLE "public"."CartItem" ADD COLUMN     "flavorId" TEXT[],
ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "sku" TEXT NOT NULL,
ADD COLUMN     "unitPrice" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "public"."Product" ALTER COLUMN "sku" DROP NOT NULL,
ALTER COLUMN "sku" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "verificationTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "verificationTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "CartItem_recipeId_idx" ON "public"."CartItem"("recipeId");

-- CreateIndex
CREATE INDEX "CartItem_flavorId_idx" ON "public"."CartItem"("flavorId");
