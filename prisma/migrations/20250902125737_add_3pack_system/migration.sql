-- CreateTable
CREATE TABLE "public"."Flavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackRecipe" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackRecipeItem" (
    "id" TEXT NOT NULL,
    "packRecipeId" TEXT NOT NULL,
    "flavorId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PackRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlavorInventory" (
    "id" TEXT NOT NULL,
    "flavorId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlavorInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CartLine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flavor_name_key" ON "public"."Flavor"("name");

-- CreateIndex
CREATE INDEX "Flavor_active_idx" ON "public"."Flavor"("active");

-- CreateIndex
CREATE INDEX "PackRecipe_kind_idx" ON "public"."PackRecipe"("kind");

-- CreateIndex
CREATE INDEX "PackRecipe_active_idx" ON "public"."PackRecipe"("active");

-- CreateIndex
CREATE INDEX "PackRecipeItem_packRecipeId_idx" ON "public"."PackRecipeItem"("packRecipeId");

-- CreateIndex
CREATE INDEX "PackRecipeItem_flavorId_idx" ON "public"."PackRecipeItem"("flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "PackRecipeItem_packRecipeId_flavorId_key" ON "public"."PackRecipeItem"("packRecipeId", "flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "FlavorInventory_flavorId_key" ON "public"."FlavorInventory"("flavorId");

-- CreateIndex
CREATE INDEX "FlavorInventory_flavorId_idx" ON "public"."FlavorInventory"("flavorId");

-- CreateIndex
CREATE INDEX "CartLine_userId_idx" ON "public"."CartLine"("userId");

-- CreateIndex
CREATE INDEX "CartLine_productId_idx" ON "public"."CartLine"("productId");

-- CreateIndex
CREATE INDEX "CartLine_recipeId_idx" ON "public"."CartLine"("recipeId");

-- AddForeignKey
ALTER TABLE "public"."PackRecipeItem" ADD CONSTRAINT "PackRecipeItem_packRecipeId_fkey" FOREIGN KEY ("packRecipeId") REFERENCES "public"."PackRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackRecipeItem" ADD CONSTRAINT "PackRecipeItem_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "public"."Flavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlavorInventory" ADD CONSTRAINT "FlavorInventory_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "public"."Flavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartLine" ADD CONSTRAINT "CartLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartLine" ADD CONSTRAINT "CartLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."PackRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
