import type { Request, Response, NextFunction } from 'express'

export function requirePlan(...plans: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const workspace = (req as any).workspace
    if (!workspace || !plans.includes(workspace.plan)) {
      res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlans: plans })
      return
    }
    next()
  }
}
