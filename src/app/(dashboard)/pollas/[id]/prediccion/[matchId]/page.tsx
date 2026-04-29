import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { PredictionForm } from '@/components/features/dashboard/prediction-form';
import { BackToFixtureLink } from '@/components/features/dashboard/back-to-fixture-link';
import { MatchPredictionsList } from '@/components/features/dashboard/match-predictions-list';

interface Props {
  params: { id: string; matchId: string };
}

export default async function PrediccionPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, name, admin_id, tournament_id, bet_deadline_minutes, status, wildcards')
    .eq('id', params.id)
    .single();

  if (!polla) notFound();

  const { data: membership } = await supabase
    .from('polla_members')
    .select('status')
    .eq('polla_id', params.id)
    .eq('user_id', user.id)
    .single();

  const isAdmin = polla.admin_id === user.id;
  const isMember = membership?.status === 'approved';
  if (!isAdmin && !isMember) redirect('/pollas');

  const { data: match } = await supabase
    .from('matches')
    .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
    .eq('id', params.matchId)
    .single();

  if (!match) notFound();

  // Verificar que el partido pertenezca al torneo de la polla
  if (match.tournament_id !== polla.tournament_id) {
    redirect(`/pollas/${params.id}/fixture`);
  }

  // Verificar si el plazo cerró (server-side)
  const { data: nowData } = await supabase.rpc('get_server_time');
  const serverNow = new Date(nowData || new Date().toISOString());
  const deadline = new Date(match.scheduled_at);
  deadline.setMinutes(deadline.getMinutes() - (polla.bet_deadline_minutes || 60));
  const isOpen = serverNow < deadline;

  // Cargar predicción existente
  const { data: prediction } = await supabase
    .from('predictions')
    .select('home_goals, away_goals, wildcard_used')
    .eq('polla_id', params.id)
    .eq('match_id', params.matchId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Cargar comodines disponibles del jugador
  const { data: playerWildcards } = await supabase
    .from('predictions')
    .select('wildcard_used, match_id')
    .eq('polla_id', params.id)
    .eq('user_id', user.id)
    .not('wildcard_used', 'is', null);

  const totalX2 = (polla.wildcards as any)?.find((w: any) => w.type === 'x2')?.quantity ?? 2;
  const totalX3 = (polla.wildcards as any)?.find((w: any) => w.type === 'x3')?.quantity ?? 1;

  const usedX2 = (playerWildcards || []).filter((w) => w.wildcard_used === 'x2').length;
  const usedX3 = (playerWildcards || []).filter((w) => w.wildcard_used === 'x3').length;

  // Si el usuario ya tiene comodín en ESTE partido, lo "devolvemos" al contar disponibles
  const currentWildcard = prediction?.wildcard_used;
  const usedX2ExcludingCurrent = usedX2 - (currentWildcard === 'x2' ? 1 : 0);
  const usedX3ExcludingCurrent = usedX3 - (currentWildcard === 'x3' ? 1 : 0);

  const wildcardsAvailable = {
    x2: Math.max(0, totalX2 - usedX2ExcludingCurrent),
    x3: Math.max(0, totalX3 - usedX3ExcludingCurrent),
  };

  // Cargar predicciones de todos cuando el partido ya no está abierto
  let allPredictions: any[] = [];
  if (!isOpen) {
    const admin = createAdminClient();
    const { data: preds } = await admin
      .from('predictions')
      .select('user_id, home_goals, away_goals, wildcard_used, match_points(points), polla_members!inner(alias, profiles(avatar_url))')
      .eq('polla_id', params.id)
      .eq('match_id', params.matchId)
      .eq('polla_members.status', 'approved');

    allPredictions = (preds || []).map((p: any) => {
      const memberData = Array.isArray(p.polla_members) ? p.polla_members[0] : p.polla_members;
      const profileData = memberData?.profiles;
      const pointsData = Array.isArray(p.match_points) ? p.match_points[0] : p.match_points;
      return {
        user_id: p.user_id,
        alias: memberData?.alias || '—',
        avatar_url: profileData?.avatar_url ?? null,
        home_goals: p.home_goals,
        away_goals: p.away_goals,
        wildcard_used: p.wildcard_used,
        points: pointsData?.points ?? null,
        is_me: p.user_id === user.id,
      };
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <BackToFixtureLink pollaId={params.id} />

      <div className="space-y-1 text-center">
        <h1 className="text-xl font-bold">Tu predicción</h1>
        <p className="text-sm text-muted-foreground">{polla.name}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-center gap-4">
          <div className={`flex flex-col items-center gap-1 ${!isOpen && match.home_goals !== null && match.away_goals !== null && (match.home_goals > match.away_goals) ? 'text-green-700' : ''}`}>
            {match.home_team?.logo_url && (
              <img src={match.home_team.logo_url} alt="" className="h-10 w-10 object-contain" />
            )}
            <span className="text-sm font-semibold">{match.home_team?.name || 'Local'}</span>
          </div>
          <div className="flex flex-col items-center px-4">
            {!isOpen && match.home_goals !== null && match.away_goals !== null ? (
              <>
                <span className="text-2xl font-black">
                  {match.home_goals} - {match.away_goals}
                </span>
                {match.home_penalty_goals !== null && match.away_penalty_goals !== null && (
                  <span className="text-xs text-muted-foreground">
                    Penales: {match.home_penalty_goals} - {match.away_penalty_goals}
                  </span>
                )}
              </>
            ) : (
              <span className="text-lg font-bold text-muted-foreground">vs</span>
            )}
          </div>
          <div className={`flex flex-col items-center gap-1 ${!isOpen && match.home_goals !== null && match.away_goals !== null && (match.away_goals > match.home_goals) ? 'text-green-700' : ''}`}>
            {match.away_team?.logo_url && (
              <img src={match.away_team.logo_url} alt="" className="h-10 w-10 object-contain" />
            )}
            <span className="text-sm font-semibold">{match.away_team?.name || 'Visitante'}</span>
          </div>
        </div>

        {!isOpen && match.home_goals !== null && match.away_goals !== null && (
          <div className="text-center">
            {match.home_goals > match.away_goals ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Ganó {match.home_team?.name || 'Local'}
              </span>
            ) : match.away_goals > match.home_goals ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Ganó {match.away_team?.name || 'Visitante'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                Empate
              </span>
            )}
          </div>
        )}
      </div>

      <PredictionForm
        pollaId={params.id}
        matchId={params.matchId}
        isOpen={isOpen}
        existingPrediction={prediction}
        wildcardsAvailable={wildcardsAvailable}
      />

      {!isOpen && allPredictions.length > 0 && (
        <MatchPredictionsList
          predictions={allPredictions}
          homeTeamName={match.home_team?.name || 'Local'}
          awayTeamName={match.away_team?.name || 'Visitante'}
          matchStatus={match.status}
          homeGoals={match.home_goals}
          awayGoals={match.away_goals}
        />
      )}
    </div>
  );
}
