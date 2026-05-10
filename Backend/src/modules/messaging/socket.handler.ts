import type { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'

interface AuthPayload {
  userId: string
}

export function registerSocketHandlers(io: Server): void {
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as any)?.token as string | undefined
    if (!token) return next(new Error('AUTH_REQUIRED'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, workspaceId: true }
      })
      if (!user?.workspaceId) return next(new Error('NO_WORKSPACE'));
      (socket as any).userId = user.id;
      (socket as any).workspaceId = user.workspaceId
      next()
    } catch {
      next(new Error('INVALID_TOKEN'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const { userId, workspaceId } = socket as any
    socket.join(`workspace:${workspaceId}`)

    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`workspace:${workspaceId}:conv:${conversationId}`)
      io.to(`workspace:${workspaceId}`).emit('agent:viewing', { conversationId, userId })
    })

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`workspace:${workspaceId}:conv:${conversationId}`)
    })
  })
}
