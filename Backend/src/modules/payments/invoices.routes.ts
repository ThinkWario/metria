import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import type { AuthRequest } from '../../middleware/auth'
import { createInvoice, listInvoices } from './invoices.service'

const router = Router()

router.post('/invoices', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const invoice = await createInvoice(workspaceId, req.body)
    res.status(201).json(invoice)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('no encontrado') ? 404 : 400
    res.status(status).json({ error: message })
  }
})

router.get('/invoices', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const invoices = await listInvoices(workspaceId)
    res.json(invoices)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
