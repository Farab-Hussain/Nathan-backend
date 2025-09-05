/* eslint-disable no-console */
const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const products = [
    {
      name: 'Gummy Bears',
      description: 'Colorful, chewy gummy bears with fruity flavors.',
      price: 4.99,
      stock: 200,
      category: 'Candy',
      imageUrl: 'https://images.unsplash.com/photo-1604908554027-752c60dd09b0',
      isActive: true,
    },
    {
      name: 'Chocolate Bar',
      description: 'Silky smooth milk chocolate bar.',
      price: 2.49,
      stock: 300,
      category: 'Candy',
      imageUrl: 'https://images.unsplash.com/photo-1548907040-4baa42d10918',
      isActive: true,
    },
    {
      name: 'Lollipops',
      description: 'Assorted fruit lollipops. Fun for all ages!',
      price: 3.99,
      stock: 250,
      category: 'Candy',
      imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba',
      isActive: true,
    },
    {
      name: 'Sour Worms',
      description: 'Tangy and sweet sour gummy worms coated in sugar.',
      price: 3.49,
      stock: 220,
      category: 'Candy',
      imageUrl: 'https://images.unsplash.com/photo-1603052875331-7c7a90d89b65',
      isActive: true,
    },
    {
      name: 'Caramel Toffee',
      description: 'Rich, buttery caramel toffee bites.',
      price: 5.49,
      stock: 180,
      category: 'Candy',
      imageUrl: 'https://images.unsplash.com/photo-1612198182681-3beba9ba99b6',
      isActive: true,
    },
  ];

  for (const p of products) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.product.create({ data: p });
      console.log(`✅ Created product: ${p.name}`);
    } else {
      console.log(`↩️  Skipped existing: ${p.name}`);
    }
  }

  // Ensure an admin user exists (for accessing admin UI)
  const adminEmail = 'admin@nathan.local';
  const adminPassword = 'Admin123!';
  const adminHashed = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'admin' },
    create: {
      name: 'Site Admin',
      email: adminEmail,
      password: adminHashed,
      role: 'admin',
      provider: 'local',
      providerId: `seed_admin_${Date.now()}`,
    },
  });
  console.log(`✅ Admin ready: ${admin.email} (password: ${adminPassword})`);

  // Ensure a demo customer with a couple of orders exists
  const customerEmail = 'customer@nathan.local';
  const customerPassword = 'Password123!';
  const customerHashed = await bcrypt.hash(customerPassword, 10);
  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      name: 'Demo Customer',
      email: customerEmail,
      password: customerHashed,
      role: 'user',
      provider: 'local',
      providerId: `seed_customer_${Date.now()}`,
    },
  });
  console.log(`✅ Customer ready: ${customer.email} (password: ${customerPassword})`);

  const dbProducts = await prisma.product.findMany({ where: { isActive: true }, take: 3 });
  if (dbProducts.length >= 1) {
    // Create demo orders only if none exist yet
    const existingOrders = await prisma.order.count({ where: { userId: customer.id } });
    if (existingOrders === 0) {
      const itemsOne = [
        {
          productId: dbProducts[0].id,
          quantity: 2,
          price: dbProducts[0].price,
          total: dbProducts[0].price * 2,
        },
      ];
      const totalOne = itemsOne.reduce((s, i) => s + i.total, 0);

      await prisma.order.create({
        data: {
          userId: customer.id,
          status: 'confirmed',
          paymentStatus: 'paid',
          total: totalOne,
          shippingAddress: { address: '123 Demo Street', city: 'Demo City' },
          orderItems: { create: itemsOne },
        },
      });
      console.log('✅ Created demo order #1');

      if (dbProducts[1]) {
        const itemsTwo = [
          {
            productId: dbProducts[1].id,
            quantity: 1,
            price: dbProducts[1].price,
            total: dbProducts[1].price * 1,
          },
          dbProducts[2]
            ? {
                productId: dbProducts[2].id,
                quantity: 3,
                price: dbProducts[2].price,
                total: dbProducts[2].price * 3,
              }
            : null,
        ].filter(Boolean);
        const totalTwo = itemsTwo.reduce((s, i) => s + i.total, 0);

        await prisma.order.create({
          data: {
            userId: customer.id,
            status: 'shipped',
            paymentStatus: 'paid',
            total: totalTwo,
            shippingAddress: { address: '456 Sample Ave', city: 'Sample Town' },
            orderItems: { create: itemsTwo },
          },
        });
        console.log('✅ Created demo order #2');
      }
    } else {
      console.log('↩️  Skipped creating demo orders (already exist)');
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });


