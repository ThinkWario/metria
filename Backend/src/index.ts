import 'dotenv/config'
import { createServer } from 'http'
import app from './app'
import { initSocket } from './lib/socket'
import { registerSocketHandlers } from './modules/messaging/socket.handler'

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set')
  process.exit(1)
}

const PORT = process.env.PORT || 4000

const httpServer = createServer(app)
const io = initSocket(httpServer)
registerSocketHandlers(io)

httpServer.listen(PORT, () => {
  console.log(`[Server] API running on http://127.0.0.1:${PORT}`)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  httpServer.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})
