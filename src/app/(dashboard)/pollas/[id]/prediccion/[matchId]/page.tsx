import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { PredictionForm } from '@/components/features/dashboard/prediction-form';
import { BackToFixtureLink } from '@/components/features/dashboard/back-to-fixture-link';
import { MatchPredictionsList } from '@/components/features/dashboard/match-predictions-list';

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatMatchTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

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

  // Cargar predicción existente + mis puntos en este partido
  const [{ data: prediction }, { data: myMatchPoints }] = await Promise.all([
    supabase
      .from('predictions')
      .select('home_goals, away_goals, wildcard_used')
      .eq('polla_id', params.id)
      .eq('match_id', params.matchId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('match_points')
      .select('points')
      .eq('polla_id', params.id)
      .eq('match_id', params.matchId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const myPoints = myMatchPoints?.points ?? null;

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

  // Predicciones de otros: visibles desde que el partido inicia (nunca antes)
  const matchStarted = !['NS', 'TBD', 'PST'].includes(match.status);
  let allPredictions: any[] = [];
  if (matchStarted) {
    const admin = createAdminClient();
    const [{ data: preds }, { data: members }, { data: allMatchPoints }] = await Promise.all([
      admin
        .from('predictions')
        .select('user_id, home_goals, away_goals, wildcard_used')
        .eq('polla_id', params.id)
        .eq('match_id', params.matchId),
      admin
        .from('polla_members')
        .select('user_id, alias, profiles(avatar_url)')
        .eq('polla_id', params.id)
        .eq('status', 'approved'),
      admin
        .from('match_points')
        .select('user_id, points')
        .eq('polla_id', params.id)
        .eq('match_id', params.matchId),
    ]);

    const memberMap = new Map((members || []).map((m: any) => [m.user_id, m]));
    const pointsMap = new Map((allMatchPoints || []).map((mp: any) => [mp.user_id, mp.points]));

    allPredictions = (preds || [])
      .filter((p: any) => memberMap.has(p.user_id))
      .map((p: any) => {
        const m = memberMap.get(p.user_id) as any;
        return {
          user_id: p.user_id,
          alias: m?.alias || '—',
          avatar_url: m?.profiles?.avatar_url ?? null,
          home_goals: p.home_goals,
          away_goals: p.away_goals,
          wildcard_used: p.wildcard_used,
          points: pointsMap.get(p.user_id) ?? null,
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
        {/* Fecha, hora y jornada */}
        <div className="rounded-xl border bg-muted/40 px-4 py-2.5 text-center space-y-0.5">
          <p className="text-sm font-medium capitalize">{formatMatchDate(match.scheduled_at)}</p>
          <p className="text-xs text-muted-foreground">{formatMatchTime(match.scheduled_at)}hs</p>
          {match.round && (
            <p className="text-xs text-muted-foreground">{match.round}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <div className={`flex flex-col items-center gap-1 text-center w-[110px] ${!isOpen && match.home_goals !== null && match.away_goals !== null && (match.home_goals > match.away_goals) ? 'text-green-700' : ''}`}>
            {match.home_team?.logo_url && (
              <img src={match.home_team.logo_url} alt="" className="h-12 w-12 object-contain" />
            )}
            <span className="text-sm font-semibold leading-tight">{match.home_team?.name || 'Local'}</span>
          </div>
          <div className="flex flex-col items-center px-3">
            {!isOpen && match.home_goals !== null && match.away_goals !== null ? (
              <>
                <span className="text-2xl font-black tabular-nums">
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
          <div className={`flex flex-col items-center gap-1 text-center w-[110px] ${!isOpen && match.home_goals !== null && match.away_goals !== null && (match.away_goals > match.home_goals) ? 'text-green-700' : ''}`}>
            {match.away_team?.logo_url && (
              <img src={match.away_team.logo_url} alt="" className="h-12 w-12 object-contain" />
            )}
            <span className="text-sm font-semibold leading-tight">{match.away_team?.name || 'Visitante'}</span>
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

      {/* Resultado de la predicción */}
      {!isOpen && prediction && match.home_goals !== null && match.away_goals !== null && (() => {
        const exact = prediction.home_goals === match.home_goals && prediction.away_goals === match.away_goals;
        const realResult = Math.sign(match.home_goals - match.away_goals);
        const predResult = Math.sign(prediction.home_goals - prediction.away_goals);
        const correct = realResult === predResult;
        if (exact) return (
          <div className="rounded-xl bg-emerald-500 text-white px-4 py-3 text-center space-y-0.5">
            <p className="text-lg font-black">🎯 ¡Marcador exacto!</p>
            <p className="text-sm opacity-90">Predijiste {prediction.home_goals} - {prediction.away_goals}</p>
            {myPoints != null && <p className="text-2xl font-black">+{myPoints} pts</p>}
          </div>
        );
        if (correct) return (
          <div className="rounded-xl bg-emerald-100 text-emerald-800 px-4 py-3 text-center space-y-0.5">
            <p className="text-lg font-black">✓ Acertaste el resultado</p>
            <p className="text-sm opacity-75">Predijiste {prediction.home_goals} - {prediction.away_goals}</p>
            {myPoints != null && <p className="text-xl font-black">+{myPoints} pts</p>}
          </div>
        );
        return (
          <div className="rounded-xl bg-red-100 text-red-700 px-4 py-3 text-center space-y-0.5">
            <p className="text-lg font-black">✗ No acertaste</p>
            <p className="text-sm opacity-75">Predijiste {prediction.home_goals} - {prediction.away_goals}</p>
            {myPoints != null && <p className="text-xl font-black">{myPoints} pts</p>}
          </div>
        );
      })()}

      <PredictionForm
        pollaId={params.id}
        matchId={params.matchId}
        isOpen={isOpen}
        existingPrediction={prediction}
        wildcardsAvailable={wildcardsAvailable}
      />

      {matchStarted && allPredictions.length > 0 && (
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
