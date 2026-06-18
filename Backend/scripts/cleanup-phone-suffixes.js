const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

/**
 * Normaliza teléfonos de contactos que quedaron guardados con un JID de WhatsApp.
 *
 * IMPORTANTE — sufijos de JID de WhatsApp:
 *   @s.whatsapp.net / @c.us  → el prefijo ES el número de teléfono (seguro normalizar).
 *   @lid                     → es el LID de WhatsApp (Linked/Local ID): identifica a un
 *                              usuario REAL cuyo número está oculto por privacidad. El
 *                              prefijo NO es un número de teléfono y NO debe deduplicarse
 *                              contra teléfonos ni recortarse — se perderían leads reales
 *                              y se rompería el match con su conversación.
 *
 * Por eso este script SOLO opera sobre JIDs de teléfono (@s.whatsapp.net / @c.us) y
 * deja intactos los contactos @lid (y cualquier otro sufijo no telefónico).
 */
async function main() {
  // Paso 1: borrar duplicados de JID telefónico (ej. "569123@c.us" cuando ya existe "569123").
  // Restringido a JIDs de teléfono para nunca colapsar un @lid sobre un número que coincida.
  const deleted = await prisma.$executeRaw`
    DELETE FROM contacts c1
    WHERE (c1.phone LIKE '%@s.whatsapp.net' OR c1.phone LIKE '%@c.us')
    AND EXISTS (
      SELECT 1 FROM contacts c2
      WHERE c2.workspace_id = c1.workspace_id
        AND c2.phone = split_part(c1.phone, '@', 1)
        AND c2.id <> c1.id
    )
  `
  console.log(`Deleted ${deleted} duplicate phone-JID contacts`)

  // Paso 2: normalizar los JID de teléfono restantes al número pelado. Los @lid quedan intactos.
  const updated = await prisma.$executeRaw`
    UPDATE contacts
    SET phone = split_part(phone, '@', 1)
    WHERE phone LIKE '%@s.whatsapp.net' OR phone LIKE '%@c.us'
  `
  console.log(`Updated ${updated} phone-JID contacts`)
}

main()
  .catch(err => { console.error('Phone cleanup failed:', err.message); process.exit(0) })
  .finally(() => prisma.$disconnect())
