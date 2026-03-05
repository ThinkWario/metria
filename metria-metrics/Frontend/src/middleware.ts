import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
    const session = request.cookies.get("metria_session")?.value

    // Protect /dashboard
    if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
        return NextResponse.redirect(new URL("/login", request.url))
    }

    // Redirect /login to /dashboard if already logged in
    if (session && request.nextUrl.pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    // Root redirect to /login
    if (request.nextUrl.pathname === "/") {
        return NextResponse.redirect(new URL("/login", request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/dashboard/:path*", "/login", "/"],
}
