import { NextRequest, NextResponse } from 'next/server'

const protectedPaths = ['/admin', '/dashboard', '/force-password']

function getTokenPayload(token: string): { role?: string } | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const payload = Buffer.from(
            parts[1].replace(/-/g, '+').replace(/_/g, '/'),
            'base64'
        ).toString('utf-8')
        return JSON.parse(payload)
    } catch {
        return null
    }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('metria_session')?.value ?? null

    const isProtected = protectedPaths.some(p => pathname.startsWith(p))

    if (!session && isProtected) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (session) {
        const payload = getTokenPayload(session)

        if (pathname.startsWith('/admin')) {
            if (!payload || payload.role !== 'SUPER_ADMIN') {
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }

        if (pathname === '/login') {
            const dest = payload?.role === 'SUPER_ADMIN' ? '/admin/workspaces' : '/dashboard'
            return NextResponse.redirect(new URL(dest, request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/).*)',
    ],
}
