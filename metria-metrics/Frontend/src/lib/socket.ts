import { io, Socket } from 'socket.io-client'

const g = globalThis as typeof globalThis & { _metriaSocket?: Socket }

let socket: Socket | null = null

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('metria_token')
  if (!token) return null

  // Pick up HMR-orphaned socket in dev
  if (!socket) socket = g._metriaSocket ?? null

  // Reconnect if auth token changed (e.g. re-login without page reload)
  if (socket) {
    if ((socket.auth as { token: string }).token !== token) {
      disconnectSocket()
    } else {
      return socket
    }
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
  const baseUrl = apiUrl.replace(/\/api$/, '')
  socket = io(baseUrl, { auth: { token }, transports: ['websocket'] })
  if (process.env.NODE_ENV === 'development') g._metriaSocket = socket

  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
  delete g._metriaSocket
}
