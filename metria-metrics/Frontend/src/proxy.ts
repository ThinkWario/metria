import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

interface TokenPayload {
    id: string
    role: string
    workspaceId?: string | null
    subscriptionStatus?: string
}

function getTokenPayload(token: string): TokenPayload | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        // atob is available in Edge Runtime
        const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(payload)
    } catch {
        return null
    }
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    
    // Skip static assets
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/static') ||
        pathname.includes('.')
    ) {
        return NextResponse.next()
    }

    // Customer-facing lead-capture pages are ALWAYS public: a prospect filling a
    // form (/f/[slug]) or booking a visit (/book/[slug]) is never logged in, and
    // an authenticated owner previewing their own page must not be bounced away.
    if (pathname.startsWith('/f/') || pathname.startsWith('/book/')) {
        return NextResponse.next()
    }

    const session = request.cookies.get('metria_session')

    // Public routes
    const isPublicRoute = pathname === '/login' || pathname === '/signup' || pathname === '/' || pathname === '/force-password'
    const isOnboardingRoute = pathname.startsWith('/onboarding')

    // 1. Unauthenticated users
    if (!session) {
        if (!isPublicRoute && !isOnboardingRoute) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return NextResponse.next()
    }

    // 2. Authenticated users
    const payload = getTokenPayload(session.value)
    
    if (!payload) {
        const response = NextResponse.redirect(new URL('/login', request.url))
        response.cookies.delete('metria_session')
        return response
    }

    // If authenticated, redirect away from public routes to appropriate destination
    if (isPublicRoute) {
        if (payload.role === 'SUPER_ADMIN') {
            return NextResponse.redirect(new URL('/admin/workspaces', request.url))
        }
        
        const hasActivePlan = payload.workspaceId && (payload.subscriptionStatus === 'TRIAL' || payload.subscriptionStatus === 'ACTIVE')
        
        if (hasActivePlan) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
        return NextResponse.redirect(new URL('/onboarding/plans', request.url))
    }

    // ── /admin/* requires SUPER_ADMIN role ──────────────────────────────
    if (pathname.startsWith('/admin')) {
        if (payload.role !== 'SUPER_ADMIN') {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    }

    // CRITICAL GATE: Block dashboard access if no workspaceId OR no active plan (TRIAL/ACTIVE)
    if (pathname.startsWith('/dashboard')) {
        if (payload.role !== 'SUPER_ADMIN' && payload.role !== 'ADMIN') {
            const hasNoWorkspace = !payload.workspaceId
            const isInactive = payload.subscriptionStatus !== 'TRIAL' && payload.subscriptionStatus !== 'ACTIVE'
            
            if (hasNoWorkspace || isInactive) {
                return NextResponse.redirect(new URL('/onboarding/plans', request.url))
            }
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
