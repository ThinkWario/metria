import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors the logic in middleware.ts
// ─────────────────────────────────────────────────────────────────────────────

function makeJwt(role: string): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ id: '1', email: 'test@metria.com', role, workspaceId: 'ws1' }))
    return `${header}.${payload}.fake-sig`
}

function getTokenPayload(token: string): { role?: string } | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(payload)
    } catch {
        return null
    }
}

function simulateMiddleware(
    pathname: string,
    session: string | null
): { action: 'next' | 'redirect'; location?: string } {
    const protectedPaths = ['/admin', '/dashboard', '/force-password']
    const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

    // Unauthenticated: block protected routes
    if (!session && isProtected) return { action: 'redirect', location: '/login' }

    if (session) {
        const payload = getTokenPayload(session)

        // /admin/* → SUPER_ADMIN only
        if (pathname.startsWith('/admin')) {
            if (!payload || payload.role !== 'SUPER_ADMIN') {
                return { action: 'redirect', location: '/dashboard' }
            }
        }

        // Redirect away from login based on role
        if (pathname === '/login') {
            const dest = payload?.role === 'SUPER_ADMIN' ? '/admin/workspaces' : '/dashboard'
            return { action: 'redirect', location: dest }
        }
    }

    return { action: 'next' }
}

// ─────────────────────────────────────────────────────────────────────────────

const SUPER_ADMIN_TOKEN = makeJwt('SUPER_ADMIN')
const ADMIN_TOKEN = makeJwt('ADMIN')

describe('Middleware – Route Access Control', () => {

    // ── Unauthenticated ──────────────────────────────────────────────────────

    it('redirects unauthenticated user from /admin/workspaces to /login', () => {
        const r = simulateMiddleware('/admin/workspaces', null)
        expect(r).toEqual({ action: 'redirect', location: '/login' })
    })

    it('redirects unauthenticated user from /admin/settings to /login', () => {
        const r = simulateMiddleware('/admin/settings', null)
        expect(r).toEqual({ action: 'redirect', location: '/login' })
    })

    it('redirects unauthenticated user from /dashboard to /login', () => {
        const r = simulateMiddleware('/dashboard', null)
        expect(r).toEqual({ action: 'redirect', location: '/login' })
    })

    it('redirects unauthenticated user from /force-password to /login', () => {
        const r = simulateMiddleware('/force-password', null)
        expect(r).toEqual({ action: 'redirect', location: '/login' })
    })

    it('allows unauthenticated user to access /login', () => {
        const r = simulateMiddleware('/login', null)
        expect(r.action).toBe('next')
    })

    // ── SUPER_ADMIN ──────────────────────────────────────────────────────────

    it('allows SUPER_ADMIN to access /admin/workspaces', () => {
        const r = simulateMiddleware('/admin/workspaces', SUPER_ADMIN_TOKEN)
        expect(r.action).toBe('next')
    })

    it('allows SUPER_ADMIN to access /admin/settings', () => {
        const r = simulateMiddleware('/admin/settings', SUPER_ADMIN_TOKEN)
        expect(r.action).toBe('next')
    })

    it('redirects SUPER_ADMIN from /login to /admin/workspaces', () => {
        const r = simulateMiddleware('/login', SUPER_ADMIN_TOKEN)
        expect(r).toEqual({ action: 'redirect', location: '/admin/workspaces' })
    })

    // ── ADMIN (non-super) ────────────────────────────────────────────────────

    it('blocks ADMIN role from /admin/workspaces and redirects to /dashboard', () => {
        const r = simulateMiddleware('/admin/workspaces', ADMIN_TOKEN)
        expect(r).toEqual({ action: 'redirect', location: '/dashboard' })
    })

    it('blocks ADMIN role from /admin/settings and redirects to /dashboard', () => {
        const r = simulateMiddleware('/admin/settings', ADMIN_TOKEN)
        expect(r).toEqual({ action: 'redirect', location: '/dashboard' })
    })

    it('allows ADMIN role to access /dashboard', () => {
        const r = simulateMiddleware('/dashboard', ADMIN_TOKEN)
        expect(r.action).toBe('next')
    })

    it('redirects ADMIN from /login to /dashboard', () => {
        const r = simulateMiddleware('/login', ADMIN_TOKEN)
        expect(r).toEqual({ action: 'redirect', location: '/dashboard' })
    })

    // ── Edge cases ───────────────────────────────────────────────────────────

    it('blocks malformed token from /admin/* and redirects to /dashboard', () => {
        const r = simulateMiddleware('/admin/workspaces', 'not.a.valid.jwt')
        expect(r).toEqual({ action: 'redirect', location: '/dashboard' })
    })
})
