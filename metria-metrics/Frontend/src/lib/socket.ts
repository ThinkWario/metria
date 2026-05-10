import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('metria_token')
  if (!token) return null
  if (!socket) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
    const baseUrl = apiUrl.replace(/\/api$/, '')
    socket = io(baseUrl, { auth: { token }, transports: ['websocket'] })
  }
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
