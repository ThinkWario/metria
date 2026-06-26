import { Router } from 'express'
import { simpleRateLimit } from '../../lib/rateLimit'
import * as fs from './forms.service'

/**
 * PUBLIC, UNAUTHENTICATED lead-capture form routes.
 *
 * Mount in app.ts WITHOUT any auth middleware, alongside public booking, e.g.:
 *   import publicFormsRoutes from './modules/crm/public-forms.routes'
 *   app.use('/api/public', publicFormsRoutes)
 *
 * Resulting public endpoints:
 *   GET  /api/public/forms/:slug
 *   POST /api/public/forms/:slug/submit
 *
 * All input is treated as hostile. getPublicForm/submitForm only ever surface
 * public-safe fields and re-validate every value server-side against the form's
 * own definition. Missing OR inactive forms return 404 without distinction.
 */

const router = Router()

// GET /forms/:slug → public-safe form definition for an ACTIVE form
router.get('/forms/:slug', async (req, res) => {
  try {
    const form = await fs.getPublicForm(req.params.slug)
    res.json(form)
  } catch (err: any) {
    const notFound = String(err?.message ?? '').toLowerCase().includes('not found')
    if (notFound) {
      res.status(404).json({ error: 'Formulario no encontrado' })
    } else {
      res.status(500).json({ error: 'No se pudo cargar el formulario' })
    }
  }
})

// POST /forms/:slug/submit → validate, find-or-create contact, emit FORM_SUBMITTED
// 5 submissions per IP per 5 minutes
router.post('/forms/:slug/submit', simpleRateLimit(5 * 60 * 1000, 5), async (req, res) => {
  try {
    const result = await fs.submitForm(req.params.slug, req.body?.data ?? req.body)
    res.status(201).json(result)
  } catch (err: any) {
    if (err instanceof fs.FormValidationError) {
      res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors })
      return
    }
    const notFound = String(err?.message ?? '').toLowerCase().includes('not found')
    if (notFound) {
      res.status(404).json({ error: 'Formulario no encontrado' })
    } else {
      res.status(500).json({ error: 'No se pudo enviar el formulario. Inténtalo de nuevo.' })
    }
  }
})

export default router
