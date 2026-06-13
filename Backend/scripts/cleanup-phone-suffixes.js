const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const count = await prisma.$executeRaw`
    UPDATE contacts
    SET phone = split_part(phone, '@', 1)
    WHERE phone LIKE '%@%'
  `
  console.log(`Updated ${count} contacts`)
}

main()
  .catch(err => { console.error('Phone cleanup failed:', err.message); process.exit(0) })
  .finally(() => prisma.$disconnect())
