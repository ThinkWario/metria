import { Request, Response, NextFunction } from 'express'

const windows = new Map<string, number[]>()

export function simpleRateLimit(windowMs: number, max: number, message?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const key = `${req.path}:${ip}`
    const now = Date.now()
    const hits = (windows.get(key) ?? []).filter(t => now - t < windowMs)
    if (hits.length >= max) {
      res.status(429).json({ error: message ?? 'Demasiadas solicitudes. Inténtalo en un momento.' })
      return
    }
    hits.push(now)
    windows.set(key, hits)
    next()
  }
}
