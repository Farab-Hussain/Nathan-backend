import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Minimal Product Data (Database-Driven System)...\n");

  // Create minimal flavors - admin can add more through admin interface
  const flavors = [
    { id: "red_twist", name: "Red Twist", aliases: [], active: true },
    { id: "blue_raspberry", name: "Blue Raspberry", aliases: [], active: true },
    {
      id: "green_apple",
      name: "Green Apple",
      aliases: ["Apple"],
      active: true,
    },
  ];

  // Ensure all flavors exist
  for (const flavor of flavors) {
    await prisma.flavor.upsert({
      where: { id: flavor.id },
      update: flavor,
      create: flavor,
    });
  }

  // Ensure inventory exists for minimal flavors
  const inventory = [
    { flavorId: "red_twist", onHand: 100, reserved: 0, safetyStock: 5 },
    { flavorId: "blue_raspberry", onHand: 100, reserved: 0, safetyStock: 5 },
    { flavorId: "green_apple", onHand: 100, reserved: 0, safetyStock: 5 },
  ];

  for (const inv of inventory) {
    await prisma.flavorInventory.upsert({
      where: { flavorId: inv.flavorId },
      update: inv,
      create: inv,
    });
  }

  // Clear existing products - admin will create products through admin interface
  await prisma.product.deleteMany({});

  // Create minimal example products - admin can add more through admin interface
  const exampleProducts = [
    {
      id: "traditional-3-red-twist",
      name: "Traditional - 3 Red Twist",
      description: "Classic combination of 3 Red Twist candies in one pack",
      price: 27.0,
      stock: 50,
      category: "Traditional",
      sku: "3P-TRA-REDx3",
      flavors: [{ flavorId: "red_twist", quantity: 3 }],
    },
    {
      id: "sour-mixed-flavors",
      name: "Sour - Mixed Flavors",
      description: "Tangy mix of Blue Raspberry and Green Apple",
      price: 27.0,
      stock: 45,
      category: "Sour",
      sku: "3P-SOU-BLU-GRE",
      flavors: [
        { flavorId: "blue_raspberry", quantity: 1 },
        { flavorId: "green_apple", quantity: 2 },
      ],
    },
  ];

  const products = exampleProducts;

  console.log("Creating 3-pack and 5-pack products...");

  for (const productData of products) {
    const { flavors: productFlavors, ...product } = productData;

    // Create the product
    const createdProduct = await prisma.product.create({
      data: product,
    });

    // Create the product-flavor relationships
    for (const flavor of productFlavors) {
      await prisma.productFlavor.create({
        data: {
          productId: createdProduct.id,
          flavorId: flavor.flavorId,
          quantity: flavor.quantity,
        },
      });
    }

    console.log(`✅ Created: ${product.name} (${product.sku})`);
  }

  console.log("\n🎉 Successfully seeded minimal product data!");
  console.log("📊 Summary:");
  console.log(`   - Flavors: ${flavors.length} flavors (admin can add more)`);
  console.log(
    `   - Example Products: ${products.length} products (admin can add more)`
  );
  console.log(`   - Categories: Traditional, Sour, Sweet (admin can add more)`);
  console.log("\n💡 Next Steps:");
  console.log("   1. Use admin interface to add more flavors");
  console.log("   2. Use admin interface to create more products");
  console.log("   3. Use admin interface to manage inventory");
  console.log("   4. System now supports dynamic SKU generation!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding products:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
