import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PollasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/login');
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="mb-6 text-2xl font-bold">Mis Pollas</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Polla cards will be rendered here */}
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          No tienes pollas activas. ¡Crea una o únete con un código!
        </div>
      </div>
    </main>
  );
}
