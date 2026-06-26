import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import type { AuthRequest } from '../../middleware/auth'
import { listProducts, createProduct, updateProduct, deleteProduct, activateProduct } from './products.service'

const router = Router()

router.get('/products', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const includeInactive = req.query.includeInactive === 'true'
    const products = await listProducts(workspaceId, includeInactive)
    res.json(products)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/products', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const product = await createProduct(workspaceId, req.body)
    res.status(201).json(product)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(400).json({ error: message })
  }
})

router.put('/products/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const product = await updateProduct(workspaceId, req.params.id, req.body)
    res.json(product)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('no encontrado') ? 404 : 400
    res.status(status).json({ error: message })
  }
})

router.delete('/products/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    await deleteProduct(workspaceId, req.params.id)
    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(404).json({ error: message })
  }
})

router.patch('/products/:id/activate', authenticate, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const product = await activateProduct(workspaceId, req.params.id)
    res.json(product)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(404).json({ error: message })
  }
})

export default router
