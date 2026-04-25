import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/features/auth/onboarding-form';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if profile already exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('alias')
    .eq('id', user.id)
    .single();

  if (profile?.alias) {
    redirect('/pollas');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">¡Casi listo!</h1>
          <p className="text-muted-foreground">
            Elige un alias para que tus amigos te reconozcan en las pollas.
          </p>
        </div>
        <OnboardingForm userId={user.id} email={user.email ?? ''} />
      </div>
    </main>
  );
}
