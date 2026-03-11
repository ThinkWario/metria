import 'dotenv/config'
import app from './app'

const PORT = process.env.PORT || 4000

const server = app.listen(PORT, () => {
    console.log(`[Server] API running on http://127.0.0.1:${PORT}`)
})

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server')
    server.close(() => {
        console.log('HTTP server closed')
        process.exit(0)
    })
})
