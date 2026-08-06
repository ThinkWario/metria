import { prisma } from '../lib/prisma'
import { normalizeRut } from '../lib/rutFormat'
import { SOLAR_SOURCE } from '../modules/leads/leadIngestion.service'

/**
 * One-off backfill for `Contact.rut` — QA_REVALIDACION_POST_FIXES_
 * DESARROLLADOR_06AGO2026.md §4/§5: `prisma db push` added the column and
 * its unique index, but never populated it for Contacts created before the
 * fix. Their RUT is still only inside `qualificationData.rawFields.rut`
 * (the raw onboarding payload), so those older rows silently don't
 * participate in the identity-conflict check — a session reusing that RUT
 * finds no `byRut` match and creates a second, disconnected Contact.
 *
 * Defaults to a dry run (report-only). Pass --apply to actually write.
 *
 * Never auto-resolves a collision (two Contacts whose historical RUT
 * normalizes to the same value, or a Contact whose RUT already collides
 * with an already-populated row) — those are reported and left untouched,
 * per the QA report's explicit instruction not to merge/delete without a
 * documented reconciliation policy (§5.4).
 *
 * Run: npx tsx src/scripts/backfillContactRut.ts [--apply]
 */

interface Candidate {
  id: string
  workspaceId: string
  rut: string
}

function extractRawRut(qualificationData: unknown): string | null {
  if (!qualificationData || typeof qualificationData !== 'object') return null
  const rawFields = (qualificationData as { rawFields?: unknown }).rawFields
  if (!rawFields || typeof rawFields !== 'object') return null
  const rut = (rawFields as { rut?: unknown }).rut
  return typeof rut === 'string' ? rut : null
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? '=== APPLY MODE — writes will happen ===' : '=== DRY RUN — no writes, pass --apply to commit ===')

  const rows = await prisma.contact.findMany({
    where: { source: SOLAR_SOURCE, rut: null },
    select: { id: true, workspaceId: true, qualificationData: true }
  })
  console.log(`Scanned ${rows.length} Contact(s) with source='${SOLAR_SOURCE}' and rut=NULL`)

  const candidates: Candidate[] = []
  let noRutInPayload = 0
  let invalidRutFormat = 0

  for (const row of rows) {
    const raw = extractRawRut(row.qualificationData)
    if (!raw) { noRutInPayload++; continue }
    const normalized = normalizeRut(raw)
    if (!normalized) { invalidRutFormat++; continue }
    candidates.push({ id: row.id, workspaceId: row.workspaceId, rut: normalized })
  }

  console.log(`  -> ${candidates.length} candidate(s) with a normalizable historical RUT`)
  console.log(`  -> ${noRutInPayload} had no rut in qualificationData.rawFields`)
  console.log(`  -> ${invalidRutFormat} had a rut that didn't normalize (bad format)`)

  // Collisions AMONG the candidates themselves (two pre-fix Contacts that
  // share the same normalized RUT in the same workspace).
  const byWorkspaceRut = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = `${c.workspaceId}::${c.rut}`
    const list = byWorkspaceRut.get(key) ?? []
    list.push(c)
    byWorkspaceRut.set(key, list)
  }

  const safeToBackfill: Candidate[] = []
  const internalCollisions: Candidate[][] = []
  for (const list of byWorkspaceRut.values()) {
    if (list.length === 1) safeToBackfill.push(list[0])
    else internalCollisions.push(list)
  }

  // Collisions AGAINST an already-populated Contact.rut (e.g. a post-fix
  // session already claimed this RUT for a different Contact).
  const alreadyBackfilled: Candidate[] = []
  const externalCollisions: { candidate: Candidate; existingContactId: string }[] = []
  for (const c of safeToBackfill.slice()) {
    const existing = await prisma.contact.findUnique({
      where: { workspaceId_rut: { workspaceId: c.workspaceId, rut: c.rut } },
      select: { id: true }
    })
    if (existing) {
      externalCollisions.push({ candidate: c, existingContactId: existing.id })
      const idx = safeToBackfill.indexOf(c)
      safeToBackfill.splice(idx, 1)
    } else {
      alreadyBackfilled.push(c)
    }
  }

  console.log(`\n${safeToBackfill.length} Contact(s) safe to backfill (unique RUT, no collision).`)
  if (internalCollisions.length > 0) {
    console.log(`\n${internalCollisions.length} RUT value(s) collide between multiple pre-fix Contacts — NOT backfilled, needs manual reconciliation:`)
    for (const list of internalCollisions) {
      console.log(`  rut=${list[0].rut} workspace=${list[0].workspaceId} contacts=[${list.map(c => c.id).join(', ')}]`)
    }
  }
  if (externalCollisions.length > 0) {
    console.log(`\n${externalCollisions.length} pre-fix Contact(s) collide with an already-populated Contact.rut — NOT backfilled, needs manual reconciliation:`)
    for (const { candidate, existingContactId } of externalCollisions) {
      console.log(`  rut=${candidate.rut} workspace=${candidate.workspaceId} pre-fix contact=${candidate.id} already-populated contact=${existingContactId}`)
    }
  }

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write the safe backfills above.')
    return
  }

  let written = 0
  for (const c of safeToBackfill) {
    await prisma.contact.update({ where: { id: c.id }, data: { rut: c.rut } })
    written++
  }
  console.log(`\nBackfilled rut on ${written} Contact(s).`)
  if (internalCollisions.length + externalCollisions.length > 0) {
    console.log(`${internalCollisions.length + externalCollisions.length} RUT collision group(s) were left untouched — resolve manually per QA_REVALIDACION_POST_FIXES_DESARROLLADOR_06AGO2026.md §5.4.`)
  }
}

main()
  .catch(err => { console.error('Contact.rut backfill failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
