import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

let _io: Server | null = null

export function initSocket(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }
  })
  return _io
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first')
  return _io
}
