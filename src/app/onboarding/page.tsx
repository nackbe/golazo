import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/features/auth/onboarding-form';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('alias')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.alias) redirect('/pollas');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-5xl">⚽</span>
          <h2 className="mt-2 text-2xl font-black text-primary-dark">Golazo</h2>
        </div>

        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-6">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-black">¡Casi listo!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Elegí un alias para que tus amigos te reconozcan en las pollas.
            </p>
          </div>
          <OnboardingForm email={user.email ?? ''} />
        </div>
      </div>
    </main>
  );
}
