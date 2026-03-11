import { prisma } from '../lib/prisma'

export async function createAuditLog(data: {
    workspaceId?: string,
    source: string,
    event: string,
    status: string,
    message?: string,
    payload?: any
}) {
    try {
        return await prisma.auditLog.create({
            data: {
                workspaceId: data.workspaceId,
                source: data.source,
                event: data.event,
                status: data.status,
                message: data.message,
                payload: data.payload
            }
        })
    } catch (error) {
        console.error('Failed to create audit log:', error)
    }
}
