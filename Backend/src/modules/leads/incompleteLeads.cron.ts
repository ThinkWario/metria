import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { SOLAR_SOURCE, INCOMPLETE_LEAD_TAG } from './leadIngestion.service'

// Abandoned wizard sessions (resolveOrCreatePartialContact created a Contact
// on `save` but the user never reached `complete`) are excluded from CRM
// counts (contact.service.ts::listContacts) but still sit in the table
// forever otherwise. Sweep them out after a window long enough that a
// legitimate multi-day "I'll finish this later" session isn't cut short —
// QA_E2E_POST_FIXES_05AGO2026.md §10.4 opción 2 ("aplicar expiración y
// limpieza programada").
const STALE_AFTER_DAYS = 14

export async function cleanupStaleIncompleteLeads(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000)

  const stale = await prisma.contact.findMany({
    where: {
      source: SOLAR_SOURCE,
      createdAt: { lt: cutoff },
      tags: { some: { name: INCOMPLETE_LEAD_TAG } }
    },
    select: { id: true }
  })

  let deleted = 0
  for (const { id } of stale) {
    try {
      await prisma.contactTag.deleteMany({ where: { contactId: id } })
      await prisma.contact.delete({ where: { id } })
      deleted++
    } catch (err) {
      // A draft that picked up a real relation (note, deal, conversation)
      // after creation is no longer just an abandoned session — leave it
      // for manual review instead of failing the whole sweep.
      console.error(`[IncompleteLeadsCleanup] Could not delete contact ${id}:`, err)
    }
  }

  return deleted
}

export function startIncompleteLeadsCleanupCron(): void {
  cron.schedule('0 4 * * *', () => {
    cleanupStaleIncompleteLeads()
      .then(count => { if (count > 0) console.log(`[IncompleteLeadsCleanup] Removed ${count} stale draft contact(s)`) })
      .catch(err => console.error('[Cron: IncompleteLeadsCleanup] Error:', err))
  })
  console.log('[IncompleteLeadsCleanupCron] Scheduled daily at 04:00')
}
