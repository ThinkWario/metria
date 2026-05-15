import { prisma } from './prisma'

export async function waitForDb(retries = 10, delay = 2000): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`
            console.log('[DB] Database connection established.')
            return true
        } catch (err) {
            console.log(`[DB] Waiting for database... (${i + 1}/${retries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }
    console.error('[DB] Could not connect to database after several retries.')
    return false
}

export async function checkTablesExist(): Promise<boolean> {
    try {
        // Just try to query one of the core tables
        await prisma.user.findFirst({ select: { id: true } })
        return true
    } catch (err: any) {
        if (err.code === 'P2021') {
            return false
        }
        // If it's another error (like connection), we already handled it in waitForDb
        return false
    }
}
