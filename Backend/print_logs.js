const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.paymentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  
  for (const log of logs) {
    console.log('---');
    console.log('ID:', log.id);
    console.log('STATUS:', log.status);
    console.log('ERROR:', log.errorMessage);
    console.log('CREATED:', log.createdAt);
  }
}

main().finally(() => prisma.$disconnect());
