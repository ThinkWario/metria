import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { ingestDocument, listDocuments, deleteDocument } from './knowledge.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.post('/knowledge', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const { name, sourceType, content, botAgentId } = req.body
    if (!name || !sourceType || !content) return res.status(400).json({ error: 'name, sourceType, content required' })
    const doc = await ingestDocument(workspaceId, { name, sourceType, content, botAgentId })
    res.status(201).json(doc)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/knowledge', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    res.json(await listDocuments(workspaceId))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/knowledge/:id', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    await deleteDocument(workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

export default router
