import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { prisma } from '../../lib/prisma'
import { getAvailableSlots, listAppointments, scheduleAppointment, updateAppointmentStatus } from './scheduling.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/appointments', ...auth, async (req: any, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined
  const to = req.query.to ? new Date(String(req.query.to)) : undefined
  res.json(await listAppointments(req.workspaceId, from, to))
})

router.post('/appointments', ...auth, async (req: any, res) => {
  try {
    const { contactId, type, scheduledAt, dealId, notes } = req.body
    const appt = await scheduleAppointment(req.workspaceId, {
      contactId, type, scheduledAt: new Date(scheduledAt), dealId, notes, createdBy: req.userId ?? 'USER'
    })
    res.status(201).json(appt)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/appointments/:id/status', ...auth, async (req: any, res) => {
  try {
    res.json(await updateAppointmentStatus(req.workspaceId, req.params.id, req.body.status))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/availability/slots', ...auth, async (req: any, res) => {
  const type = String(req.query.type || 'SITE_VISIT')
  const slots = await getAvailableSlots(req.workspaceId, type, new Date(), 14)
  res.json(slots)
})

// CRUD for availability rules
router.get('/availability/rules', ...auth, async (req: any, res) => {
  res.json(await prisma.availabilityRule.findMany({ where: { workspaceId: req.workspaceId } }))
})

router.post('/availability/rules', ...auth, async (req: any, res) => {
  const { dayOfWeek, startTime, endTime, slotMinutes, apptType } = req.body
  res.status(201).json(await prisma.availabilityRule.create({
    data: { workspaceId: req.workspaceId, dayOfWeek, startTime, endTime, slotMinutes: slotMinutes ?? 60, apptType: apptType ?? 'SITE_VISIT' }
  }))
})

router.delete('/availability/rules/:id', ...auth, async (req: any, res) => {
  await prisma.availabilityRule.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } })
  res.json({ ok: true })
})

export default router
