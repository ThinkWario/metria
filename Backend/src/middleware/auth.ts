import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import 'dotenv/config'

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

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user']

        req.user = decoded
        // Ensure workspaceId is at least null if missing
        if (req.user && req.user.workspaceId === undefined) req.user.workspaceId = null
        next()
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' })
    }
}
