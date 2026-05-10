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
