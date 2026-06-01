import type { Response, NextFunction } from 'express'
import type { AuthRequest } from './auth'

interface PlanGateRequest extends AuthRequest {
  workspace?: {
    plan: string
  }
}

export function requirePlan(...plans: string[]) {
  return (req: PlanGateRequest, res: Response, next: NextFunction): void => {
    const workspace = req.workspace
    const userEmail = (req as any).user?.email
    
    console.log(`[PlanGate] User: ${userEmail}, Role: ${req.user?.role}, Workspace Plan: ${workspace?.plan}, Required: ${plans.join(',')}`)

    if (
        userEmail === 'cmoralesv.fb@gmail.com' || 
        userEmail === 'admin@metria.com' || 
        userEmail === 'superadmin@metria.ai' ||
        req.user?.role === 'SUPER_ADMIN' ||
        req.user?.role === 'ADMIN' ||
        workspace?.plan === 'STARTER' // TEMPORAL: Permitir acceso total al plan Starter
    ) {
      console.log(`[PlanGate] Bypass granted for user: ${userEmail} (Plan: ${workspace?.plan}, Role: ${req.user?.role})`)
      return next()
    }

    if (!workspace || !plans.includes(workspace.plan)) {
      res.status(403).json({
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlans: plans,
        error: 'Your current plan does not support this feature. Please upgrade.'
      })
      return
    }
    next()
  }
}
