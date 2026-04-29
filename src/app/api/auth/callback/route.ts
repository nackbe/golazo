import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  let redirectTo = searchParams.get('redirectTo');

  // Fallback to cookie if not in query params
  if (!redirectTo) {
    const cookieStore = cookies();
    redirectTo = cookieStore.get('redirect_to')?.value ?? null;
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('alias')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.alias) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        if (redirectTo) {
          // Ensure redirectTo is a relative path to prevent open redirects
          const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/pollas';
          return NextResponse.redirect(`${origin}${safeRedirect}`);
        }

        return NextResponse.redirect(`${origin}/pollas`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
