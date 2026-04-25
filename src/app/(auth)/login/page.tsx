import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect('/pollas');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Bienvenido a Golazo</h1>
          <p className="text-muted-foreground">
            Inicia sesión para crear o unirte a una polla deportiva.
          </p>
        </div>
        {/* Auth UI will be implemented here */}
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Componente de autenticación (Google + Email) próximamente.
        </div>
      </div>
    </main>
  );
}
