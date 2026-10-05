import { PrismaClient, CampaignStatus, SubscriberStatus, EventType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a user
  const user = await prisma.user.create({
    data: {
      email: 'demo.user@example.com',
      name: 'Demo User',
      image: 'https://example.com/avatar.png',
    },
  });

  // Create a template for the user
  const template = await prisma.template.create({
    data: {
      name: 'Welcome Template',
      subject: 'Welcome to Our Newsletter!',
      content: '<h1>Hi {{firstName}}, welcome aboard!</h1>',
      userId: user.id,
    },
  });

  // Create a list for the user
  const list = await prisma.list.create({
    data: {
      name: 'Main Newsletter List',
      description: 'List of engaged subscribers',
      userId: user.id,
    },
  });

  // Create subscribers for the list
  const subscribers = await prisma.subscriber.createMany({
    data: [
      {
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        status: SubscriberStatus.ACTIVE,
        listId: list.id,
      },
      {
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Johnson',
        status: SubscriberStatus.ACTIVE,
        listId: list.id,
      },
    ],
  });

  // Create a campaign for the list using the template
  const campaign = await prisma.campaign.create({
    data: {
      name: 'July Promo',
      subject: 'Hot Deals in July!',
      content: '<p>Check out our hottest July offers 🔥</p>',
      status: CampaignStatus.SENT,
      scheduledAt: new Date(),
      sentAt: new Date(),
      userId: user.id,
      listId: list.id,
      templateId: template.id,
      fromEmail: 'placeholder@example.com', // Placeholder for drafts
      fromName: 'Draft Campaign',
      replyTo: '',
    },
  });

  // Create events for a subscriber and the campaign
  const alice = await prisma.subscriber.findFirst({
    where: { email: 'alice@example.com', listId: list.id },
  });

  if (alice) {
    await prisma.event.createMany({
      data: [
        {
          type: EventType.SENT,
          subscriberId: alice.id,
          campaignId: campaign.id,
        },
        {
          type: EventType.OPENED,
          subscriberId: alice.id,
          campaignId: campaign.id,
        },
      ],
    });
  }

  console.log('🌱 Dummy data has been seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
