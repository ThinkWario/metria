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
    const msg = err instanceof Error ? err.message : undefined
    if (msg && (msg.includes('Invalid token') || msg.includes('No record found'))) {
      return res.status(400).send(renderUnsubscribePage(false))
    }
    console.error('[unsubscribe] Unexpected error:', err)
    return res.status(500).send(renderUnsubscribePage(false, 'Error interno. Inténtalo más tarde.'))
  }
})
