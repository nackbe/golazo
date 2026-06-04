import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/features/auth/signup-form';

export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect('/pollas');

  const cookieStore = cookies();
  const redirectTo = cookieStore.get('redirect_to')?.value;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-5xl">⚽</span>
          <h1 className="mt-2 text-3xl font-black text-primary-dark">Golazo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá tu cuenta para empezar a predecir
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-6">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold">Crear cuenta</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Recibirás un link de confirmación por correo
            </p>
          </div>
          <SignupForm redirectTo={redirectTo} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Al crear tu cuenta aceptás los términos de uso y la política de privacidad.
        </p>
      </div>
    </main>
  );
}
