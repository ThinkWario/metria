import { Request, Response, NextFunction } from 'express'
import { redis } from '../lib/redis'
import { AuthRequest } from './auth'

// Cache middleware factory function for adjustable TTLs
export const cacheMiddleware = (ttlSeconds: number) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next()
        }

        // Tenant-isolated cache key — CRITICAL for multi-tenant security
        const workspaceId = (req as AuthRequest).user?.workspaceId || 'public'
        const key = `cache:${workspaceId}:${req.originalUrl || req.url}`

        try {
            const cachedData = await redis.get(key)
            if (cachedData) {
                return res.status(200).json(JSON.parse(cachedData))
            }

            // Override res.json to cache the outgoing response
            const originalJson = res.json.bind(res)
            res.json = (body: any) => {
                // Background caching to avoid blocking response
                redis.setex(key, ttlSeconds, JSON.stringify(body)).catch(console.error)
                return originalJson(body)
            }

            next()
        } catch (error) {
            console.error('Redis Cache Error:', error)
            next()
        }
    }
}

// Invalidate all cache entries for a specific workspace
export const invalidateWorkspaceCache = async (workspaceId: string) => {
    try {
        const pattern = `cache:${workspaceId}:*`
        const keys = await redis.keys(pattern)
        if (keys.length > 0) {
            await redis.del(...keys)
        }
    } catch (error) {
        console.error('Cache invalidation error:', error)
    }
}

// Common TTL constants
export const CACHE_TTL = {
    MINUTE_1: 60,
    MINUTE_5: 300,
    HOUR_1: 3600,
    DAY_1: 86400
}

