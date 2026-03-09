import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Decode JWT payload without verification (Edge Runtime has no crypto).
// Verification is already done by the backend on every API call.
// We only need the `role` field for routing decisions.
function getTokenPayload(token: string): { role?: string } | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        // atob is available in Edge Runtime (and modern browsers)
        const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(payload)
    } catch {
        return null
    }
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('metria_session')

    // ── Unauthenticated: block all protected routes ──────────────────────────
    if (!session && (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/force-password'))) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (session) {
        const payload = getTokenPayload(session.value)

        // ── /admin/* requires SUPER_ADMIN role ──────────────────────────────
        if (pathname.startsWith('/admin')) {
            if (!payload || payload.role !== 'SUPER_ADMIN') {
                // Authenticated but wrong role → send to their dashboard
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }

        // ── Redirect away from login ─────────────────────────────────────────
        if (pathname === '/login') {
            const dest = payload?.role === 'SUPER_ADMIN' ? '/admin/workspaces' : '/dashboard'
            return NextResponse.redirect(new URL(dest, request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*', '/dashboard/:path*', '/force-password', '/login'],
}

