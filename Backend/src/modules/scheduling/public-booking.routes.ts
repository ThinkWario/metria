import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { scheduleAppointment } from './scheduling.service'
import {
  PUBLIC_BOOKING_TYPE,
  findWorkspaceBySlug,
  getPublicSlotsForDate,
  wallClockToInstant
} from './booking.service'

/**
 * PUBLIC, UNAUTHENTICATED self-service booking routes (Calendly-style).
 *
 * Mount in app.ts WITHOUT any auth middleware, e.g.:
 *   import publicBookingRoutes from './modules/scheduling/public-booking.routes'
 *   app.use('/api/public', publicBookingRoutes)
 *
 * Resulting public endpoints:
 *   GET  /api/public/booking/:slug
 *   GET  /api/public/booking/:slug/slots?date=YYYY-MM-DD
 *   POST /api/public/booking/:slug/book
 *
 * Everything here treats input as hostile: no internal data is leaked, all
 * inputs are validated, and slot availability is re-checked server-side at
 * booking time (via the existing scheduling engine) to prevent double-booking.
 */

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const SLUG_RE = /^[a-z0-9-]{1,60}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanSlug(raw: string): string | null {
  const slug = String(raw || '').toLowerCase().trim()
  return SLUG_RE.test(slug) ? slug : null
}

// GET /booking/:slug → public-safe workspace booking info
router.get('/booking/:slug', async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug)
    if (!slug) return res.status(404).json({ error: 'Enlace no válido' })
    const ws = await findWorkspaceBySlug(slug)
    if (!ws) return res.status(404).json({ error: 'Enlace no válido' })
    res.json({
      workspaceName: ws.name,
      bookingTitle: ws.bookingTitle || 'Agenda una cita',
      bookingDurationMin: ws.bookingDurationMin
    })
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudo cargar la página de reservas' })
  }
})

// GET /booking/:slug/slots?date=YYYY-MM-DD → available "HH:mm" slots for that day
router.get('/booking/:slug/slots', async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug)
    if (!slug) return res.status(404).json({ error: 'Enlace no válido' })
    const date = String(req.query.date || '')
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida' })

    const ws = await findWorkspaceBySlug(slug)
    if (!ws) return res.status(404).json({ error: 'Enlace no válido' })

    const slots = await getPublicSlotsForDate(ws.id, date)
    res.json({ slots })
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudieron cargar los horarios' })
  }
})

// POST /booking/:slug/book → find-or-create contact + create appointment
router.post('/booking/:slug/book', async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug)
    if (!slug) return res.status(404).json({ error: 'Enlace no válido' })

    const ws = await findWorkspaceBySlug(slug)
    if (!ws) return res.status(404).json({ error: 'Enlace no válido' })

    const body = req.body ?? {}
    const name = String(body.name || '').trim().slice(0, 120)
    const phoneRaw = body.phone == null ? '' : String(body.phone).trim().slice(0, 40)
    const emailRaw = body.email == null ? '' : String(body.email).trim().toLowerCase().slice(0, 160)
    const date = String(body.date || '')
    const time = String(body.time || '')

    // ── Validation ───────────────────────────────────────────────
    if (name.length < 2) return res.status(400).json({ error: 'Ingresa tu nombre' })
    if (!phoneRaw || phoneRaw.replace(/\D/g, '').length < 6) {
      return res.status(400).json({ error: 'Ingresa un teléfono válido' })
    }
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      return res.status(400).json({ error: 'El correo no es válido' })
    }
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida' })
    if (!TIME_RE.test(time)) return res.status(400).json({ error: 'Hora inválida' })

    // ── Re-check availability server-side (defensive) ─────────────
    const available = await getPublicSlotsForDate(ws.id, date)
    if (!available.includes(time)) {
      return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro.' })
    }

    const scheduledAt = await wallClockToInstant(ws.id, date, time)

    // ── Find-or-create contact (match by phone or email) ──────────
    const email = emailRaw || null
    let contact = await prisma.contact.findFirst({
      where: {
        workspaceId: ws.id,
        OR: [
          { phone: phoneRaw },
          ...(email ? [{ email }] : [])
        ]
      }
    })

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          workspaceId: ws.id,
          name,
          phone: phoneRaw,
          email,
          source: 'BOOKING',
          status: 'LEAD'
        }
      })
    }

    // ── Create the appointment via the existing engine ────────────
    let appt
    try {
      appt = await scheduleAppointment(ws.id, {
        contactId: contact.id,
        type: PUBLIC_BOOKING_TYPE,
        scheduledAt,
        createdBy: 'PUBLIC_BOOKING'
      })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (/taken|availability/i.test(msg)) {
        return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro.' })
      }
      throw e
    }

    res.status(201).json({ ok: true, appointmentId: appt.id })
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudo completar la reserva. Inténtalo de nuevo.' })
  }
})

export default router
