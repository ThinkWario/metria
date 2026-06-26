import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as fs from './forms.service'
import { prisma } from '../../lib/prisma'

/**
 * Authenticated Form Builder CRUD.
 *
 * Mount in app.ts, e.g.:
 *   import formsRoutes from './modules/crm/forms.routes'
 *   app.use('/api', formsRoutes)
 *
 * Resulting endpoints (all require auth + PRO/SCALE plan):
 *   GET    /api/crm/forms
 *   POST   /api/crm/forms
 *   GET    /api/crm/forms/:id
 *   PATCH  /api/crm/forms/:id
 *   DELETE /api/crm/forms/:id
 */

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

function statusFor(err: any): number {
  return String(err?.message ?? '').toLowerCase().includes('not found') ? 404 : 400
}

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/crm/forms', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await fs.listForms(workspaceId))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Create ───────────────────────────────────────────────────────────────────

router.post('/crm/forms', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { name, description, fields, isActive, submitButtonText, successMessage } = req.body ?? {}
    const form = await fs.createForm(workspaceId, {
      name,
      description,
      fields,
      isActive,
      submitButtonText,
      successMessage
    })
    res.status(201).json(form)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ── Get one ──────────────────────────────────────────────────────────────────

router.get('/crm/forms/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await fs.getForm(workspaceId, req.params.id))
  } catch (err: any) {
    res.status(statusFor(err)).json({ error: err.message })
  }
})

// ── Update ───────────────────────────────────────────────────────────────────

router.patch('/crm/forms/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await fs.updateForm(workspaceId, req.params.id, req.body ?? {}))
  } catch (err: any) {
    res.status(statusFor(err)).json({ error: err.message })
  }
})

// ── Delete ───────────────────────────────────────────────────────────────────

router.delete('/crm/forms/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    await fs.deleteForm(workspaceId, req.params.id)
    res.status(204).send()
  } catch (err: any) {
    res.status(statusFor(err)).json({ error: err.message })
  }
})

// ── Duplicate ─────────────────────────────────────────────────────────────────

router.post('/crm/forms/:id/duplicate', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const duplicate = await fs.duplicateForm(workspaceId, req.params.id)
    res.status(201).json(duplicate)
  } catch (err: any) {
    res.status(statusFor(err)).json({ error: err.message })
  }
})

// ── Submissions ───────────────────────────────────────────────────────────────

router.get('/crm/forms/:id/submissions', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const form = await prisma.form.findFirst({ where: { id: req.params.id, workspaceId }, select: { id: true } })
    if (!form) { res.status(404).json({ error: 'Formulario no encontrado' }); return }
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: req.params.id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 200
    })
    res.json(submissions)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
