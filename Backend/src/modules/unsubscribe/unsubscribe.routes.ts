import { Router, Request, Response } from 'express'
import { processUnsubscribe, renderUnsubscribePage } from './unsubscribe.service'

export const unsubscribeRouter = Router()

unsubscribeRouter.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params

  if (!token) {
    return res.status(400).send(renderUnsubscribePage(false, 'Token no proporcionado.'))
  }

  try {
    await processUnsubscribe(token)
    return res.status(200).send(renderUnsubscribePage(true))
  } catch (err: unknown) {
    // Invalid/tampered token → 400 (matched by explicit messages, not substrings)
    if (err instanceof Error && (err.message === 'Invalid token format' || err.message === 'Invalid token signature')) {
      return res.status(400).send(renderUnsubscribePage(false))
    }
    // Prisma "record not found" (e.g. findUniqueOrThrow) → 400, link no longer valid
    if ((err as { code?: string })?.code === 'P2025') {
      return res.status(400).send(renderUnsubscribePage(false))
    }
    console.error('[unsubscribe] Unexpected error:', err)
    return res.status(500).send(renderUnsubscribePage(false, 'Error interno. Inténtalo más tarde.'))
  }
})
