const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Step 1: delete @lid contacts where the clean version already exists (duplicates)
  const deleted = await prisma.$executeRaw`
    DELETE FROM contacts c1
    WHERE c1.phone LIKE '%@%'
    AND EXISTS (
      SELECT 1 FROM contacts c2
      WHERE c2.workspace_id = c1.workspace_id
        AND c2.phone = split_part(c1.phone, '@', 1)
        AND c2.id <> c1.id
    )
  `
  console.log(`Deleted ${deleted} duplicate contacts with @lid suffix`)

  // Step 2: update remaining contacts that still have a suffix (no conflict now)
  const updated = await prisma.$executeRaw`
    UPDATE contacts
    SET phone = split_part(phone, '@', 1)
    WHERE phone LIKE '%@%'
  `
  console.log(`Updated ${updated} contacts`)
}

main()
  .catch(err => { console.error('Phone cleanup failed:', err.message); process.exit(0) })
  .finally(() => prisma.$disconnect())
