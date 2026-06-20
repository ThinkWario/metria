import { Router, Request, Response } from 'express'
import { trackingService } from './tracking.service'

const router = Router()

// Tracking pixel — open
router.get('/o/:recipientId', async (req: Request, res: Response) => {
  const { recipientId } = req.params
  try {
    await trackingService.recordOpen(recipientId)
  } catch {
    // silently ignore errors — always serve the pixel
  }
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.send(trackingService.pixel())
})

// Click redirect
router.get('/c/:recipientId', async (req: Request, res: Response) => {
  const { recipientId } = req.params
  const urlParam = req.query.url as string | undefined
  if (!urlParam) {
    res.status(400).send('Missing url')
    return
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(urlParam)
  } catch {
    res.status(400).send('Invalid url')
    return
  }
  if (!/^https?:\/\/.{1,2048}/.test(decoded)) {
    res.status(400).send('Invalid url')
    return
  }
  try {
    await trackingService.recordClick(recipientId)
  } catch {
    // silently ignore — always redirect
  }
  res.redirect(302, decoded)
})

export default router
