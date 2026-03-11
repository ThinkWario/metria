import { Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from './auth'

/**
 * Middleware that ensures the user has one of the allowed roles.
 * Must be used in combination with (or after) `authenticate`.
 * Allowed DB roles for example: 'SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'
 */
export const requireRole = (allowedRoles: string[]) => {
    return [
        authenticate,
        (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.user || !req.user.role) {
                return res.status(401).json({ error: 'Unauthorized: Missing user role' })
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ 
                    error: `Forbidden: Requires one of the following roles: ${allowedRoles.join(', ')}` 
                })
            }

            next()
        }
    ]
}
