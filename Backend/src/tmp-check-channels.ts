import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const workspaceId = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';
  console.log(`Checking channels for workspace: ${workspaceId}`);

  const channels = await prisma.channel.findMany({
    where: {
      workspaceId: workspaceId,
    },
  });

  if (channels.length === 0) {
    console.log('No channels found for this workspace.');
  } else {
    console.log(`Found ${channels.length} channels:`);
    channels.forEach((channel) => {
      console.log(`- ID: ${channel.id}`);
      console.log(`  Platform: ${channel.platform}`);
      console.log(`  Name: ${channel.name}`);
      console.log(`  Status: ${channel.status}`);
      console.log(`  Config: ${JSON.stringify(channel.config, null, 2)}`);
      console.log('---');
    });
  }

  // Also check AuditLogs for any webhook events
  const logs = await prisma.auditLog.findMany({
    where: {
      workspaceId: workspaceId,
      source: {
        in: ['WhatsApp', 'Instagram', 'Messenger', 'Telegram', 'Meta'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  if (logs.length === 0) {
    console.log('No recent webhook audit logs found.');
  } else {
    console.log(`Recent webhook audit logs:`);
    logs.forEach((log) => {
      console.log(`- Date: ${log.createdAt}`);
      console.log(`  Source: ${log.source}`);
      console.log(`  Event: ${log.event}`);
      console.log(`  Status: ${log.status}`);
      console.log(`  Message: ${log.message}`);
      console.log('---');
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
