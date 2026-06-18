import { describe, it, expect, vi } from 'vitest'
import { requirePlan } from '../planGate'
import type { Request, Response, NextFunction } from 'express'

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
  return res as unknown as Response
}

describe('requirePlan', () => {
  it('calls next() when workspace plan matches', () => {
    const req = { workspace: { plan: 'PRO' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO', 'SCALE')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when workspace plan does not match', () => {
    // NOTE: 'STARTER' is intentionally bypassed in planGate (temporary full-access
    // rule), so use a genuinely non-allowed plan to exercise the 403 path.
    const req = { workspace: { plan: 'FREE' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO', 'SCALE')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlans: ['PRO', 'SCALE'],
      error: 'Your current plan does not support this feature. Please upgrade.'
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when workspace is missing', () => {
    const req = {} as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
