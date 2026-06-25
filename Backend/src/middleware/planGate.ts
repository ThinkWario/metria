import type { Response, NextFunction } from 'express'
import type { AuthRequest } from './auth'

interface PlanGateRequest extends AuthRequest {
  workspace?: {
    plan: string
  }
}

// Demo/admin accounts exempt from plan gating. Configure via env (comma-separated).
// These are non-billing internal accounts, NOT a way to bypass paid plans.
const PLAN_GATE_ALLOWLIST = (process.env.PLAN_GATE_ALLOWLIST ?? 'cmoralesv.fb@gmail.com,admin@metria.com,superadmin@metria.ai')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export function requirePlan(...plans: string[]) {
  return (req: PlanGateRequest, res: Response, next: NextFunction): void => {
    const workspace = req.workspace
    const userEmail = (req as any).user?.email

    if (
        (userEmail && PLAN_GATE_ALLOWLIST.includes(String(userEmail).toLowerCase())) ||
        req.user?.role === 'SUPER_ADMIN' ||
        req.user?.role === 'ADMIN'
    ) {
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
