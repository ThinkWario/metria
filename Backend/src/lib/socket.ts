import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

let _io: Server | null = null

export function initSocket(httpServer: HttpServer): Server {
  // FRONTEND_URL accepts a comma-separated list of allowed origins
  const origins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
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
