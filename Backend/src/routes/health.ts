import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { checkTablesExist } from '../lib/db-check'

const router = Router()

router.get('/', async (req, res) => {
    try {
        // Check DB connection
        await prisma.$queryRaw`SELECT 1`
        
        // Check if tables exist (sync state)
        const tablesReady = await checkTablesExist()

        // Check Redis connection
        await redis.ping()

        res.status(tablesReady ? 200 : 206).json({
            status: tablesReady ? 'ok' : 'initializing',
            timestamp: new Date().toISOString(),
            db: 'connected',
            tables: tablesReady ? 'ready' : 'missing',
            redis: 'connected',
            version: '1.0.0'
        })
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: 'Service unavailable',
            error: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

export default router
