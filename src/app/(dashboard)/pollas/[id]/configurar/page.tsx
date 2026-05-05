import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Settings, Play, Trophy, Globe, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PollaSettingsForm } from '@/components/features/dashboard/polla-settings-form';
import { PendingMembersList } from '@/components/features/dashboard/pending-members-list';
import { TournamentSearch } from '@/components/features/dashboard/tournament-search';
import { LoadFixturesButton, ActivatePollaButton, RecalculatePointsButton } from '@/components/features/dashboard/action-buttons';
import { selectTournament, loadFixtures, syncFixtures } from './actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function ConfigurarPollaPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, name, status, auto_approve, admin_plays, auto_random_prediction, bet_deadline_minutes, point_system, wildcards, special_point_system, admin_id, tournament_id, tournaments(id, name, season, country, type, logo_url, api_football_id)')
    .eq('id', params.id)
    .single();

  if (!polla) notFound();
  if (polla.admin_id !== user.id) redirect(`/pollas/${params.id}`);

  const { data: pendingMembers } = await supabase
    .from('polla_members')
    .select('id, alias, created_at')
    .eq('polla_id', params.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  // Cargar partidos del torneo si hay uno seleccionado
  let matches: any[] = [];
  let matchesCount = 0;
  if (polla.tournament_id) {
    const { data, count } = await supabase
      .from('matches')
      .select('id, scheduled_at, round, venue, status, home_team:home_team_id(name), away_team:away_team_id(name)', { count: 'exact' })
      .eq('tournament_id', polla.tournament_id)
      .order('scheduled_at', { ascending: true })
      .limit(6);
    matches = data || [];
    matchesCount = count || 0;
  }

  const pollaProp = {
    id: polla.id,
    name: polla.name,
    status: polla.status ?? 'draft',
    auto_approve: polla.auto_approve ?? false,
    admin_plays: polla.admin_plays ?? true,
    auto_random_prediction: polla.auto_random_prediction ?? false,
    bet_deadline_minutes: polla.bet_deadline_minutes ?? 60,
    point_system: polla.point_system as Record<string, number> | null,
    wildcards: polla.wildcards as Array<{ type: string; quantity: number }> | null,
    special_point_system: (polla.special_point_system as Record<string, number> | null) ?? {
      champion: 10,
      finalist: 5,
      third_place: 3,
      least_goals_against: 5,
      worst_team: 4,
      top_scorer_team: 5,
    },
  };

  const tournament = polla.tournaments as any;
  const hasTournament = !!polla.tournament_id;
  const hasFixtures = matchesCount > 0;
  const canLoad = hasTournament && (polla.status === 'draft' || polla.status === 'open');
  const canActivate = hasTournament && hasFixtures && (polla.status === 'draft' || polla.status === 'open');

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      <div className="flex items-center justify-between">
        <Link
          href={`/pollas/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la polla
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black">Configurar polla</h1>
          <p className="text-sm text-muted-foreground">{polla.name}</p>
        </div>
      </div>

      {pendingMembers && pendingMembers.length > 0 && (
        <PendingMembersList pollaId={params.id} members={pendingMembers} />
      )}

      {/* Selección de torneo */}
      {(polla.status === 'draft' || polla.status === 'open') && (
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Trophy className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold">Torneo</h2>
              <p className="text-sm text-muted-foreground">
                {hasTournament
                  ? 'Torneo seleccionado'
                  : 'Buscá un torneo desde API-Football'}
              </p>
            </div>
          </div>

          {/* Torneo seleccionado — siempre visible */}
          {hasTournament && tournament && (
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
              {tournament.logo_url ? (
                <img src={tournament.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{tournament.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {tournament.country || '—'} · {tournament.type || '—'} · Temporada {tournament.season}
                </p>
              </div>
              {tournament.api_football_id && (
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  API ID: {tournament.api_football_id}
                </span>
              )}
            </div>
          )}

          <TournamentSearch
            pollaId={params.id}
            onSelect={selectTournament}
            currentTournament={tournament}
          />
        </div>
      )}

      {/* Cargar partidos — solo en draft/open */}
      {(polla.status === 'draft' || polla.status === 'open') && hasTournament && (
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Partidos</h2>
              <p className="text-sm text-muted-foreground">
                {hasFixtures
                  ? `${matchesCount} partido${matchesCount !== 1 ? 's' : ''} cargado${matchesCount !== 1 ? 's' : ''} del torneo`
                  : 'Todavía no hay partidos cargados. Apretá el botón para traerlos.'}
              </p>
            </div>
            <LoadFixturesButton pollaId={params.id} tournamentId={polla.tournament_id!} loadAction={loadFixtures} />
          </div>

          {/* Preview de partidos cargados */}
          {hasFixtures && matches.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                {matches.map((match: any) => (
                  <div key={match.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground text-xs w-16 flex-shrink-0">
                        {new Date(match.scheduled_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="truncate">
                        {match.home_team?.name || '—'} vs {match.away_team?.name || '—'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                      {match.status}
                    </span>
                  </div>
                ))}
              </div>
              {matchesCount > matches.length && (
                <p className="text-xs text-muted-foreground text-center">
                  Y {matchesCount - matches.length} partido{matchesCount - matches.length !== 1 ? 's' : ''} más...
                </p>
              )}
            </div>
          )}

          {/* Warning si no hay partidos */}
          {!hasFixtures && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Tenés que cargar los partidos antes de poder iniciar la polla.</span>
            </div>
          )}
        </div>
      )}

      {/* Sincronizar partidos — solo cuando la polla está activa */}
      {polla.status === 'active' && hasTournament && (
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Sincronizar partidos</h2>
              <p className="text-sm text-muted-foreground">
                {hasFixtures
                  ? `${matchesCount} partido${matchesCount !== 1 ? 's' : ''} cargado${matchesCount !== 1 ? 's' : ''}. Si la API agregó nuevos partidos (ej: eliminatorias del Mundial), podés sincronizarlos acá.`
                  : 'No hay partidos cargados. Esta opción agrega partidos nuevos sin borrar los existentes.'}
              </p>
            </div>
            <LoadFixturesButton pollaId={params.id} tournamentId={polla.tournament_id!} loadAction={syncFixtures} label="Sincronizar" />
          </div>

          {hasFixtures && matches.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                {matches.map((match: any) => (
                  <div key={match.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground text-xs w-16 flex-shrink-0">
                        {new Date(match.scheduled_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="truncate">
                        {match.home_team?.name || '—'} vs {match.away_team?.name || '—'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                      {match.status}
                    </span>
                  </div>
                ))}
              </div>
              {matchesCount > matches.length && (
                <p className="text-xs text-muted-foreground text-center">
                  Y {matchesCount - matches.length} partido{matchesCount - matches.length !== 1 ? 's' : ''} más...
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Iniciar polla */}
      {(polla.status === 'draft' || polla.status === 'open') && (
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Iniciar polla</h2>
              <p className="text-sm text-muted-foreground">
                {canActivate
                  ? 'Todo listo. Al iniciar la polla quedará activa y los jugadores podrán hacer predicciones. Esta acción no se puede deshacer.'
                  : !hasTournament
                    ? 'Primero seleccioná un torneo.'
                    : !hasFixtures
                      ? 'Primero cargá los partidos del torneo.'
                      : 'La polla ya está activa o finalizada.'}
              </p>
            </div>
            <ActivatePollaButton disabled={!canActivate} pollaId={polla.id} />
          </div>
        </div>
      )}

      {/* Estado activo */}
      {(polla.status === 'active' || polla.status === 'finished') && (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="font-bold text-green-800">Polla {polla.status === 'active' ? 'activa' : 'finalizada'}</h2>
            <p className="text-sm text-green-700">
              {matchesCount > 0
                ? `${matchesCount} partido${matchesCount !== 1 ? 's' : ''} en el torneo.`
                : 'No hay partidos cargados.'}
            </p>
          </div>
          <RecalculatePointsButton pollaId={polla.id} />
        </div>
      )}

      <PollaSettingsForm key={polla.status} polla={pollaProp} />

    </div>
  );
}
