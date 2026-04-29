import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trophy, Hash } from 'lucide-react';
import { PollaCard } from '@/components/features/dashboard/polla-card';

export default async function PollasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: adminPollas }, { data: memberPollas }] = await Promise.all([
    supabase
      .from('pollas')
      .select('*, tournaments(name)')
      .eq('admin_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('polla_members')
      .select('polla_id, alias, pollas(id, name, code, status, tournaments(name))')
      .eq('user_id', user.id)
      .eq('status', 'approved'),
  ]);

  const adminIds = new Set(adminPollas?.map((p) => p.id) ?? []);
  const memberOnlyPollas =
    memberPollas
      ?.filter((m) => !adminIds.has(m.polla_id))
      .map((m) => m.pollas)
      .filter(Boolean) ?? [];

  const allPollas = [
    ...(adminPollas ?? []).map((p) => ({ ...p, isAdmin: true })),
    ...(memberOnlyPollas ?? []).map((p) => ({ ...p, isAdmin: false })),
  ];

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0d3d1f] px-6 py-8 text-white shadow-lg">
        <div className="relative z-10">
          <p className="text-sm font-medium text-white/60 uppercase tracking-wider mb-1">Bienvenido</p>
          <h1 className="text-3xl font-black mb-1">Mis Pollas ⚽</h1>
          <p className="text-white/70 text-sm mb-5">
            Creá una polla e invitá a tus amigos, o unite con un código.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/pollas/nueva"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Crear polla
            </Link>
            <Link
              href="/pollas/unirse"
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/25"
            >
              <Hash className="h-4 w-4" />
              Tengo un código
            </Link>
          </div>
        </div>
        {/* Decorative ball */}
        <div className="absolute -right-6 -top-6 text-[120px] opacity-10 select-none pointer-events-none">⚽</div>
      </div>

      {/* Lista */}
      {allPollas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold">Todavía no tenés pollas</h3>
          <p className="mt-1 mb-6 max-w-xs text-sm text-muted-foreground">
            Creá tu primera polla o pedile el código a un amigo para unirte.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/pollas/nueva"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Crear polla
            </Link>
            <Link
              href="/pollas/unirse"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold hover:bg-muted"
            >
              <Hash className="h-4 w-4" /> Tengo un código
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">
              {allPollas.length} {allPollas.length === 1 ? 'polla' : 'pollas'}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allPollas.map((polla) => (
              <PollaCard key={polla.id} polla={polla} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
