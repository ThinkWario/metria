import { Redis } from 'ioredis'
import 'dotenv/config'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
    }
})

redis.on('error', (err) => {
    console.error('Redis error:', err)
})

redis.on('connect', () => {
    console.log('Connected to Redis')
})
