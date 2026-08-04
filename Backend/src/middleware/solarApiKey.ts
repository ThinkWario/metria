import type { Request, Response, NextFunction } from 'express'

export function authenticateSolarApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('X-Solar-Api-Key')
  if (!key || key !== process.env.SOLAR_API_KEY) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }
  next()
}
