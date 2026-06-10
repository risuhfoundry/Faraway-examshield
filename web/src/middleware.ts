import { updateSession } from './lib/supabase/middleware'
import { type NextRequest, NextResponse } from 'next/server'

// Routes that require authentication
const protectedRoutes = ['/dashboard']

// Routes that should redirect authenticated users away (public auth routes)
const authRoutes = ['/login', '/signup']

// Routes that should be skipped entirely (public, no auth check needed)
const publicRoutes = ['/auth/callback']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for public callback routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  const { supabase, supabaseResponse } = updateSession(request)

  // Get the current user session from Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated users trying to access protected routes to login
  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users trying to access login/signup to dashboard
  if (user && authRoutes.some((route) => pathname === route)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
