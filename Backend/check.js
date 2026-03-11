const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.globalSetting.findFirst().then(console.log).finally(() => p.$disconnect());
