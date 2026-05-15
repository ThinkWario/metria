import 'dotenv/config'
console.log('DEBUG: DATABASE_URL =', process.env.DATABASE_URL)
import { createServer } from 'http'
import app from './app'
import { initSocket } from './lib/socket'
import { registerSocketHandlers } from './modules/messaging/socket.handler'
import { waitForDb } from './lib/db-check'

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set')
  process.exit(1)
}

const PORT = process.env.PORT || 4000

async function startServer() {
  // Wait for DB to be ready
  await waitForDb()

  const httpServer = createServer(app)
  const io = initSocket(httpServer)
  registerSocketHandlers(io)

  httpServer.listen(PORT, () => {
    console.log(`[Server] API running on http://127.0.0.1:${PORT}`)
  })

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server')
    httpServer.close(() => {
      console.log('HTTP server closed')
      process.exit(0)
    })
  })
}

startServer().catch(err => {
  console.error('[FATAL] Failed to start server:', err)
  process.exit(1)
})
