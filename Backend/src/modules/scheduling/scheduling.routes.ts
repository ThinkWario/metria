import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { prisma } from '../../lib/prisma'
import { getAvailableSlots, listAppointments, scheduleAppointment, updateAppointmentStatus } from './scheduling.service'

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
    res.json(await updateAppointmentStatus(workspaceId, req.params.id, req.body.status))
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

export default router
