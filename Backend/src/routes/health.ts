import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'

const router = Router()

router.get('/', async (req, res) => {
    try {
        // Check DB connection
        await prisma.$queryRaw`SELECT 1`

        // Check Redis connection
        await redis.ping()

        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            db: 'connected',
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
