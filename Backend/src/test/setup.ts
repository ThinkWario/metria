import { beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const prisma = new PrismaClient()

beforeAll(async () => {
    // Ensure we are using the test database
    if (!process.env.DATABASE_URL?.includes('5433') && !process.env.NODE_ENV?.includes('test')) {
        throw new Error('SAFETY: Test setup attempted on non-test database!')
    }

    // Run migrations on the test database
    console.log('Running migrations on test database...')
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
})

afterAll(async () => {
    await prisma.$disconnect()
})

beforeEach(async () => {
    // Clean up database between tests if needed
    // await prisma.user.deleteMany()
})

export { prisma }
