import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as pls from './payment-links.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/crm/payment-links', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await pls.listPaymentLinks(workspaceId))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Create ───────────────────────────────────────────────────────────────────

router.post('/crm/payment-links', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { contactId, dealId, amount, currency, description } = req.body

    const amountNum = Number(amount)
    if (!isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' })
      return
    }

    const link = await pls.createPaymentLink(workspaceId, {
      contactId: contactId || null,
      dealId: dealId || null,
      amount: amountNum,
      currency,
      description
    })
    res.status(201).json(link)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get one ──────────────────────────────────────────────────────────────────

router.get('/crm/payment-links/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await pls.getPaymentLink(workspaceId, req.params.id))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Update status ────────────────────────────────────────────────────────────

router.patch('/crm/payment-links/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { status } = req.body
    if (!status) {
      res.status(400).json({ error: 'status is required' })
      return
    }
    res.json(await pls.updatePaymentLinkStatus(workspaceId, req.params.id, status))
  } catch (err: any) {
    const msg = err.message.toLowerCase()
    const code = msg.includes('not found') ? 404 : msg.includes('invalid status') ? 400 : 500
    res.status(code).json({ error: err.message })
  }
})

export default router
