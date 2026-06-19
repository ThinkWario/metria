import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { prisma } from '../../lib/prisma'
import { getAvailableSlots, listAppointments, scheduleAppointment, updateAppointmentStatus } from './scheduling.service'
import { slugify } from './booking.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

router.get('/appointments', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const from = req.query.from ? new Date(String(req.query.from)) : undefined
    const to = req.query.to ? new Date(String(req.query.to)) : undefined
    res.json(await listAppointments(workspaceId, from, to))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/appointments', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const { contactId, type, scheduledAt, dealId, notes } = req.body
    const appt = await scheduleAppointment(workspaceId, {
      contactId, type, scheduledAt: new Date(scheduledAt), dealId, notes, createdBy: req.user?.id ?? 'USER'
    })
    res.status(201).json(appt)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/appointments/:id/status', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const updated = await updateAppointmentStatus(workspaceId, req.params.id, req.body.status)
    res.json(updated)
    // Cancel Google Calendar event non-blockingly when appointment is cancelled
    if (req.body.status === 'CANCELLED' && (updated as any).googleEventId) {
      const { cancelCalendarEvent } = await import('./google-calendar.service')
      cancelCalendarEvent(workspaceId, (updated as any).googleEventId).catch(err =>
        console.error('[gcal] cancel event failed:', err)
      )
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/availability/slots', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const type = String(req.query.type || 'SITE_VISIT')
    const slots = await getAvailableSlots(workspaceId, type, new Date(), 14)
    res.json(slots)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// CRUD for availability rules
router.get('/availability/rules', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    res.json(await prisma.availabilityRule.findMany({ where: { workspaceId } }))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/availability/rules', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const { dayOfWeek, startTime, endTime, slotMinutes, apptType } = req.body
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be an integer between 0 and 6' })
    }
    if (typeof startTime !== 'string' || !TIME_RE.test(startTime) || typeof endTime !== 'string' || !TIME_RE.test(endTime)) {
      return res.status(400).json({ error: 'startTime and endTime must be in HH:mm format' })
    }
    res.status(201).json(await prisma.availabilityRule.create({
      data: { workspaceId, dayOfWeek, startTime, endTime, slotMinutes: slotMinutes ?? 60, apptType: apptType ?? 'SITE_VISIT' }
    }))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/availability/rules/:id', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    await prisma.availabilityRule.deleteMany({ where: { id: req.params.id, workspaceId } })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Public booking link configuration (authenticated dashboard) ─────────────

router.get('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
    })
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    res.json({
      bookingSlug: ws.bookingSlug,
      bookingTitle: ws.bookingTitle,
      bookingDurationMin: ws.bookingDurationMin
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })

    const { bookingSlug, bookingTitle, bookingDurationMin } = req.body ?? {}
    const data: { bookingSlug?: string; bookingTitle?: string | null; bookingDurationMin?: number } = {}

    if (bookingSlug !== undefined) {
      const slug = slugify(String(bookingSlug))
      if (!slug) return res.status(400).json({ error: 'El enlace no puede estar vacío' })
      data.bookingSlug = slug
    }
    if (bookingTitle !== undefined) {
      data.bookingTitle = bookingTitle === null ? null : String(bookingTitle).trim().slice(0, 120)
    }
    if (bookingDurationMin !== undefined) {
      const dur = Number(bookingDurationMin)
      if (!Number.isFinite(dur) || dur < 5 || dur > 480) {
        return res.status(400).json({ error: 'La duración debe estar entre 5 y 480 minutos' })
      }
      data.bookingDurationMin = Math.round(dur)
    }

    try {
      const ws = await prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
      })
      res.json({
        bookingSlug: ws.bookingSlug,
        bookingTitle: ws.bookingTitle,
        bookingDurationMin: ws.bookingDurationMin
      })
    } catch (e: any) {
      // Prisma unique-constraint violation on bookingSlug
      if (e?.code === 'P2002') return res.status(409).json({ error: 'slug en uso' })
      throw e
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
