import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

let _io: Server | null = null

export function initSocket(httpServer: HttpServer): Server {
  // ALLOWED_ORIGINS / FRONTEND_URL accept comma-separated lists — mirror app.ts's CORS setup
  // so socket.io doesn't reject origins (e.g. localhost in dev) that the REST API allows.
  const origins = [
    ...(process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    ...(process.env.FRONTEND_URL || '').split(',')
  ]
    .map(o => o.trim())
    .filter(Boolean)
  _io = new Server(httpServer, {
    cors: {
      origin: origins,
      credentials: true
    }
  })
  return _io
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first')
  return _io
}
