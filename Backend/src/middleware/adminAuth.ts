import { Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from './auth'

// This middleware must be used AFTER authenticate
export const requireSuperAdmin = [
    authenticate,
    (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Super Admin access required' })
        }
        next()
    }
]
