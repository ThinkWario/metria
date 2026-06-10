import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { prisma } from '../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'

export interface AuthRequest extends Request {
    user?: {
        id: string
        email: string
        role: string
        workspaceId?: string | null
        isImpersonating?: boolean
    }
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization
        let token: string | undefined

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1]
        } else if (req.query.token) {
            // Support token in query params for browser redirects (OAuth flow)
            token = req.query.token as string
        }

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' })
        }

        const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user']

        req.user = decoded
        // Ensure workspaceId is at least null if missing
        if (req.user && req.user.workspaceId === undefined) req.user.workspaceId = null

        // Workspace status and trial check
        if (req.user?.workspaceId) {
            const workspace = await prisma.workspace.findUnique({
                where: { id: req.user.workspaceId }
            })

            if (workspace) {
                // Attach workspace to request for planGate and other middlewares
                ;(req as any).workspace = workspace

                // TEMPORAL: Bypass de expiración para plan Starter
                const isStarter = workspace.plan === 'STARTER'
                
                // If trial expired, update status
                if (!isStarter && workspace.subscriptionStatus === 'TRIAL' && workspace.trialEndsAt && workspace.trialEndsAt < new Date()) {
                    await prisma.workspace.update({
                        where: { id: workspace.id },
                        data: { subscriptionStatus: 'EXPIRED', status: 'SUSPENDED' }
                    })
                    return res.status(403).json({ error: 'Tu periodo de prueba ha expirado. Por favor, selecciona un plan de pago.', code: 'TRIAL_EXPIRED' })
                }

                if (!isStarter && workspace.status === 'SUSPENDED') {
                    return res.status(403).json({ error: 'Tu cuenta está suspendida. Por favor, revisa tu suscripción.', code: 'SUBSCRIPTION_REQUIRED' })
                }
            }
        }

        next()
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' })
    }
}
