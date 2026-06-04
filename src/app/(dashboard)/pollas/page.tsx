import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trophy, Hash } from 'lucide-react';
import { PollaCard } from '@/components/features/dashboard/polla-card';
import { PollaListFilters } from '@/components/features/dashboard/polla-list-filters';

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
      .select('polla_id, alias, pollas(id, name, code, status, created_at, admin_id, tournament_id, tournaments(name))')
      .eq('user_id', user.id)
      .eq('status', 'approved'),
  ]);

  const adminPollasIds = new Set(adminPollas?.map((p) => p.id) ?? []);
  const memberOnlyPollas =
    memberPollas
      ?.filter((m) => !adminPollasIds.has(m.polla_id))
      .map((m) => m.pollas)
      .filter(Boolean) ?? [];

  // Collect all admin IDs and tournament IDs for batch lookups
  const allPollasRaw = [
    ...(adminPollas ?? []),
    ...(memberOnlyPollas as any[]),
  ];

  const adminIds = Array.from(new Set(allPollasRaw.map((p) => p.admin_id).filter(Boolean)));
  const tournamentIds = Array.from(new Set(allPollasRaw.map((p) => p.tournament_id).filter(Boolean)));

  // Batch lookup: admin aliases
  const { data: adminProfiles } = adminIds.length > 0
    ? await supabase.from('profiles').select('id, alias').in('id', adminIds)
    : { data: [] };

  const adminAliasById = new Map((adminProfiles ?? []).map((p) => [p.id, p.alias]));

  // Batch lookup: match counts per tournament (total + finished)
  // Antes: 2 queries × N tournaments en loop secuencial (P95 ~6s con 10 pollas).
  // Ahora: 2 queries totales — agregamos en JS.
  const matchStatsByTournament = new Map<string, { total: number; finished: number }>();
  if (tournamentIds.length > 0) {
    const [{ data: allMatches }, { data: finishedMatches }] = await Promise.all([
      supabase
        .from('matches')
        .select('tournament_id')
        .in('tournament_id', tournamentIds),
      supabase
        .from('matches')
        .select('tournament_id')
        .in('tournament_id', tournamentIds)
        .in('status', ['FT', 'AET', 'AFT', 'PEN']),
    ]);
    for (const tid of tournamentIds) {
      matchStatsByTournament.set(tid, { total: 0, finished: 0 });
    }
    for (const m of allMatches || []) {
      const s = matchStatsByTournament.get(m.tournament_id);
      if (s) s.total++;
    }
    for (const m of finishedMatches || []) {
      const s = matchStatsByTournament.get(m.tournament_id);
      if (s) s.finished++;
    }
  }

  const allPollas = [
    ...(adminPollas ?? []).map((p) => ({
      ...p,
      isAdmin: true,
      adminAlias: adminAliasById.get(p.admin_id) ?? 'Admin',
      matchStats: matchStatsByTournament.get(p.tournament_id) ?? { total: 0, finished: 0 },
    })),
    ...(memberOnlyPollas as any[]).map((p) => ({
      ...p,
      isAdmin: false,
      adminAlias: adminAliasById.get(p.admin_id) ?? 'Admin',
      matchStats: matchStatsByTournament.get(p.tournament_id) ?? { total: 0, finished: 0 },
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-primary-dark px-4 sm:px-6 py-6 sm:py-8 text-white shadow-lg">
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
        <PollaListFilters pollas={allPollas} />
      )}
    </div>
  );
}
