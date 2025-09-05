import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding 3-Pack Products...\n");

  // First, ensure flavors exist (from previous seed)
  const flavors = [
    { id: "red_twist", name: "Red Twist", aliases: [], active: true },
    { id: "blue_raspberry", name: "Blue Raspberry", aliases: [], active: true },
    { id: "fruit_rainbow", name: "Fruit Rainbow", aliases: [], active: true },
    {
      id: "green_apple",
      name: "Green Apple",
      aliases: ["Apple"],
      active: true,
    },
    { id: "watermelon", name: "Watermelon", aliases: [], active: true },
    { id: "cherry", name: "Cherry", aliases: [], active: true },
    { id: "berry_delight", name: "Berry Delight", aliases: [], active: true },
    { id: "cotton_candy", name: "Cotton Candy", aliases: [], active: true },
    {
      id: "strawberry_banana",
      name: "Strawberry Banana",
      aliases: ["Strawberry - Banana"],
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

  // Ensure inventory exists for all flavors
  const inventory = [
    { flavorId: "red_twist", onHand: 120, reserved: 0, safetyStock: 5 },
    { flavorId: "blue_raspberry", onHand: 80, reserved: 0, safetyStock: 5 },
    { flavorId: "fruit_rainbow", onHand: 90, reserved: 0, safetyStock: 5 },
    { flavorId: "green_apple", onHand: 75, reserved: 0, safetyStock: 5 },
    { flavorId: "watermelon", onHand: 70, reserved: 0, safetyStock: 5 },
    { flavorId: "cherry", onHand: 85, reserved: 0, safetyStock: 5 },
    { flavorId: "berry_delight", onHand: 65, reserved: 0, safetyStock: 5 },
    { flavorId: "cotton_candy", onHand: 50, reserved: 0, safetyStock: 5 },
    { flavorId: "strawberry_banana", onHand: 55, reserved: 0, safetyStock: 5 },
  ];

  for (const inv of inventory) {
    await prisma.flavorInventory.upsert({
      where: { flavorId: inv.flavorId },
      update: inv,
      create: inv,
    });
  }

  // Clear existing products
  await prisma.product.deleteMany({});

  // Create the 6 individual 3-pack products
  const products = [
    {
      id: "traditional-3-red-twist",
      name: "Traditional - 3 Red Twist",
      description: "Classic combination of 3 Red Twist candies in one pack",
      price: 27.0,
      stock: 50,
      category: "Traditional",
      sku: "3P-TRD-REDx3",
      flavors: [{ flavorId: "red_twist", quantity: 3 }],
    },
    {
      id: "sour-blue-raspberry-fruit-rainbow-green-apple",
      name: "Sour - Blue Raspberry, Fruit Rainbow, Green Apple",
      description:
        "Tangy mix of Blue Raspberry, Fruit Rainbow, and Green Apple",
      price: 27.0,
      stock: 45,
      category: "Sour",
      sku: "3P-SOR-BLURAS-FRURAI-GREAPP",
      flavors: [
        { flavorId: "blue_raspberry", quantity: 1 },
        { flavorId: "fruit_rainbow", quantity: 1 },
        { flavorId: "green_apple", quantity: 1 },
      ],
    },
    {
      id: "sour-watermelon-cherry-berry-delight",
      name: "Sour - Watermelon, Cherry, Berry Delight",
      description:
        "Refreshing sour blend of Watermelon, Cherry, and Berry Delight",
      price: 27.0,
      stock: 40,
      category: "Sour",
      sku: "3P-SOR-WAT-CHE-BERDEL",
      flavors: [
        { flavorId: "watermelon", quantity: 1 },
        { flavorId: "cherry", quantity: 1 },
        { flavorId: "berry_delight", quantity: 1 },
      ],
    },
    {
      id: "sour-green-apple-blue-raspberry-cherry",
      name: "Sour - Green Apple, Blue Raspberry, Cherry",
      description:
        "Bold sour combination of Green Apple, Blue Raspberry, and Cherry",
      price: 27.0,
      stock: 35,
      category: "Sour",
      sku: "3P-SOR-GREAPP-BLURAS-CHE",
      flavors: [
        { flavorId: "green_apple", quantity: 1 },
        { flavorId: "blue_raspberry", quantity: 1 },
        { flavorId: "cherry", quantity: 1 },
      ],
    },
    {
      id: "sweet-fruit-rainbow-cotton-candy-strawberry-banana",
      name: "Sweet - Fruit Rainbow, Cotton Candy, Strawberry Banana",
      description:
        "Delightfully sweet mix of Fruit Rainbow, Cotton Candy, and Strawberry Banana",
      price: 27.0,
      stock: 60,
      category: "Sweet",
      sku: "3P-SWE-FRURAI-COT-STRBAN",
      flavors: [
        { flavorId: "fruit_rainbow", quantity: 1 },
        { flavorId: "cotton_candy", quantity: 1 },
        { flavorId: "strawberry_banana", quantity: 1 },
      ],
    },
    {
      id: "sweet-watermelon-berry-delight-cherry",
      name: "Sweet - Watermelon, Berry Delight, Cherry",
      description:
        "Sweet and juicy blend of Watermelon, Berry Delight, and Cherry",
      price: 27.0,
      stock: 55,
      category: "Sweet",
      sku: "3P-SWE-WAT-BERDEL-CHE",
      flavors: [
        { flavorId: "watermelon", quantity: 1 },
        { flavorId: "berry_delight", quantity: 1 },
        { flavorId: "cherry", quantity: 1 },
      ],
    },
  ];

  console.log("Creating individual 3-pack products...");

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

  console.log("\n🎉 Successfully seeded 6 individual 3-pack products!");
  console.log("📊 Summary:");
  console.log(`   - Traditional: 1 product`);
  console.log(`   - Sour: 3 products`);
  console.log(`   - Sweet: 2 products`);
  console.log(`   - Total: 6 products at $27.00 each`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding products:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
