/*
  Warnings:

  - A unique constraint covering the columns `[sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "sku" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "public"."ProductFlavor" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "flavorId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ProductFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFlavor_productId_idx" ON "public"."ProductFlavor"("productId");

-- CreateIndex
CREATE INDEX "ProductFlavor_flavorId_idx" ON "public"."ProductFlavor"("flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFlavor_productId_flavorId_key" ON "public"."ProductFlavor"("productId", "flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "public"."Product"("sku");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "public"."Product"("sku");

-- AddForeignKey
ALTER TABLE "public"."ProductFlavor" ADD CONSTRAINT "ProductFlavor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductFlavor" ADD CONSTRAINT "ProductFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "public"."Flavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
