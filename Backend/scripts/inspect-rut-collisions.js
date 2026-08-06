const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SOLAR_SOURCE = 'solar_direct'

function normalizeRut(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[.\s-]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return null
  return cleaned
}

/**
 * Read-only companion to backfill-contact-rut.js — prints name/email/phone/
 * sessionId/createdAt for every Contact caught in a RUT collision, so a
 * human can tell QA/test artifacts apart from real leads before deciding
 * how to reconcile them (QA_REVALIDACION_POST_FIXES_DESARROLLADOR_
 * 06AGO2026.md §5.4/§10: no automatic merge/delete).
 *
 * Run: node scripts/inspect-rut-collisions.js
 */

function extractRawRut(qualificationData) {
  if (!qualificationData || typeof qualificationData !== 'object') return null
  const rawFields = qualificationData.rawFields
  if (!rawFields || typeof rawFields !== 'object') return null
  const rut = rawFields.rut
  return typeof rut === 'string' ? rut : null
}

async function main() {
  const rows = await prisma.contact.findMany({
    where: { source: SOLAR_SOURCE },
    select: {
      id: true, workspaceId: true, name: true, email: true, phone: true, rut: true,
      sessionId: true, createdAt: true, qualificationData: true
    }
  })

  const byWorkspaceRut = new Map()
  for (const row of rows) {
    const rut = row.rut ?? normalizeRut(extractRawRut(row.qualificationData))
    if (!rut) continue
    const key = `${row.workspaceId}::${rut}`
    const list = byWorkspaceRut.get(key) ?? []
    list.push(row)
    byWorkspaceRut.set(key, list)
  }

  const collisions = [...byWorkspaceRut.entries()].filter(([, list]) => list.length > 1)
  if (collisions.length === 0) {
    console.log('No RUT collisions found (checking both Contact.rut and qualificationData.rawFields.rut).')
    return
  }

  console.log(`${collisions.length} colliding RUT group(s):\n`)
  for (const [key, list] of collisions) {
    const [workspaceId, rut] = key.split('::')
    console.log(`--- rut=${rut} workspace=${workspaceId} (${list.length} contacts) ---`)
    for (const c of list.sort((a, b) => a.createdAt - b.createdAt)) {
      console.log(
        `  id=${c.id}\n` +
        `    name=${c.name}  email=${c.email ?? '—'}  phone=${c.phone ?? '—'}\n` +
        `    Contact.rut=${c.rut ?? 'NULL (not backfilled)'}  sessionId=${c.sessionId ?? '—'}\n` +
        `    createdAt=${c.createdAt.toISOString()}`
      )
    }
    console.log('')
  }
}

main()
  .catch(err => { console.error('Inspection failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
