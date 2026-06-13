/**
 * One-time migration: strip @lid, @c.us, @newsletter suffixes from contact.phone
 * Run from Easypanel console:
 *   node scripts/cleanup-phone-suffixes.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const count = await prisma.$executeRaw`
    UPDATE "Contact"
    SET phone = split_part(phone, '@', 1)
    WHERE phone LIKE '%@%'
  `
  console.log(`Updated ${count} contacts`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
