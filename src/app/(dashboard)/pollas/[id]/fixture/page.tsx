import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FixtureList } from '@/components/features/dashboard/fixture-list';

interface Props {
  params: { id: string };
  searchParams: { all?: string };
}

export default async function FixturePage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Paralelizar polla + membership (3 RTT → 2)
  const [pollaRes, membershipRes] = await Promise.all([
    supabase
      .from('pollas')
      .select('*, tournaments(name)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('polla_members')
      .select('status')
      .eq('polla_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const polla = pollaRes.data;
  const membership = membershipRes.data;

  if (!polla) notFound();

  const isAdmin = polla.admin_id === user.id;
  const isMember = membership?.status === 'approved';
  if (!isAdmin && !isMember) redirect('/pollas');

  const showingAll = searchParams.all === '1';

  // Cargar todo lo que depende del torneo en paralelo
  let matchesQuery = supabase
    .from('matches')
    .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
    .eq('tournament_id', polla.tournament_id);

  if (!showingAll) {
    matchesQuery = matchesQuery.order('scheduled_at', { ascending: false }).limit(200);
  } else {
    matchesQuery = matchesQuery.order('scheduled_at', { ascending: true });
  }

  const [countRes, matchesRes, predictionsRes, matchPointsRes] = await Promise.all([
    supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', polla.tournament_id),
    matchesQuery,
    supabase
      .from('predictions')
      .select('match_id, home_goals, away_goals, wildcard_used')
      .eq('polla_id', params.id)
      .eq('user_id', user.id),
    supabase
      .from('match_points')
      .select('match_id, points')
      .eq('polla_id', params.id)
      .eq('user_id', user.id),
  ]);
  const totalCount = countRes.count;
  const matchesRaw = matchesRes.data;
  const rawPredictions = predictionsRes.data;
  const matchPoints = matchPointsRes.data;

  // Si traemos los últimos 200 (orden DESC), revertir para que queden ASC
  const matches = showingAll ? (matchesRaw || []) : [...(matchesRaw || [])].reverse();

  const pointsByMatch = new Map((matchPoints || []).map((mp) => [mp.match_id, mp.points]));
  const predictions = (rawPredictions || []).map((p) => ({
    ...p,
    points: pointsByMatch.get(p.match_id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/pollas/${params.id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Fixture</h1>
        <p className="text-sm text-muted-foreground">
          {polla.tournaments?.name || 'Torneo'} · {totalCount || 0} partidos
        </p>
      </div>

      <FixtureList
        pollaId={params.id}
        matches={matches}
        predictions={predictions || []}
        betDeadlineMinutes={polla.bet_deadline_minutes || 5}
        isAdmin={isAdmin}
        pollaStatus={polla.status}
        pollaName={polla.name}
        pointSystem={polla.point_system}
        totalCount={totalCount ?? 0}
        showingAll={showingAll}
      />
    </div>
  );
}
