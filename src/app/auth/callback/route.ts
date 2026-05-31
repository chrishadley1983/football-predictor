import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  // Only allow same-origin relative paths: a single leading slash, not "//" or
  // "/\" (which browsers can treat as protocol-relative external URLs).
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page if something went wrong
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}
