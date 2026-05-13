import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy, AlertTriangle, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpecialPredictionsForm } from '@/components/features/dashboard/special-predictions-form';
import { getSpecialPredictions } from './actions';

interface Props {
  params: { id: string };
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  champion: { label: 'Campeón', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  finalist: { label: 'Finalista', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
  third_place: { label: 'Tercer lugar', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  least_goals_against: { label: 'Menos goleado', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  worst_team: { label: 'La peor recocha', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  top_scorer_team: { label: 'Goleador de fase de grupos', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
};

export default async function SpecialPredictionsPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: polla } = await supabase
    .from('pollas')
    .select('*, tournaments(name), special_point_system')
    .eq('id', params.id)
    .single();

  if (!polla) notFound();

  const { data: membership } = await supabase
    .from('polla_members')
    .select('status')
    .eq('polla_id', params.id)
    .eq('user_id', user.id)
    .single();

  const isMember = membership?.status === 'approved';
  const isAdmin = polla.admin_id === user.id;
  if (!isAdmin && !isMember) redirect('/pollas');

  // Obtener equipos del torneo
  const admin = createAdminClient();
  const { data: homeTeams } = await admin
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(id, name, logo_url)')
    .eq('tournament_id', polla.tournament_id);

  const { data: awayTeams } = await admin
    .from('matches')
    .select('away_team:teams!matches_away_team_id_fkey(id, name, logo_url)')
    .eq('tournament_id', polla.tournament_id);

  const teamMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
  for (const row of homeTeams || []) {
    const t = (row as any).home_team;
    if (t?.id && !teamMap.has(t.id)) teamMap.set(t.id, t);
  }
  for (const row of awayTeams || []) {
    const t = (row as any).away_team;
    if (t?.id && !teamMap.has(t.id)) teamMap.set(t.id, t);
  }
  const teams = Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Verificar plazo
  const { data: firstMatch } = await admin
    .from('matches')
    .select('scheduled_at, status')
    .eq('tournament_id', polla.tournament_id)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .single();

  const { data: serverTime } = await supabase.rpc('get_server_time');
  const now = new Date(serverTime as string);
  const firstMatchTime = firstMatch ? new Date(firstMatch.scheduled_at) : null;
  const isClosed = firstMatchTime ? now >= firstMatchTime : false;

  const { predictions: existingPredictions } = await getSpecialPredictions(params.id);
  const alreadyPredicted = (existingPredictions?.length || 0) > 0;

  const points = (polla.special_point_system as Record<string, number> | null) || {
    champion: 10, finalist: 5, third_place: 3,
    least_goals_against: 5, worst_team: 4, top_scorer_team: 5,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/pollas/${params.id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Predicciones especiales</h1>
          {polla.special_point_system && (
            <details className="relative">
              <summary className="list-none cursor-pointer">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
                  ?
                </span>
              </summary>
              <div className="absolute right-0 top-9 z-50 w-64 rounded-xl border bg-card shadow-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Puntos por predicción especial</p>
                <div className="space-y-1">
                  {Object.entries(polla.special_point_system as Record<string, number>)
                    .filter(([key, value]) => key in TYPE_CONFIG && value > 0)
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span>{TYPE_CONFIG[key].label}</span>
                        <span className="font-bold">+{value} pts</span>
                      </div>
                    ))}
                </div>
              </div>
            </details>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {polla.tournaments?.name || 'Torneo'} · Se hacen una sola vez antes del primer partido
        </p>
      </div>

      {isClosed ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <Lock className="h-6 w-6 text-amber-600 flex-shrink-0" />
          <div>
            <h2 className="font-bold text-amber-800">Plazo cerrado</h2>
            <p className="text-sm text-amber-700">
              Las predicciones especiales se cierran antes del primer partido.
              {firstMatchTime && (
                <> El primer partido fue el {firstMatchTime.toLocaleDateString('es-ES', { timeZone: 'America/Bogota' })}.</>
              )}
            </p>
          </div>
        </div>
      ) : null}

      {alreadyPredicted && isClosed ? (
        /* Solo mostrar resumen read-only si ya predijo Y el plazo cerró */
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-green-800">Tus predicciones</h2>
              <p className="text-sm text-green-700">Buena suerte!</p>
            </div>
          </div>

          <div className="grid gap-2">
            {existingPredictions?.map((p: any) => {
              const cfg = TYPE_CONFIG[p.type] || { label: p.type, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };
              return (
                <div key={p.id} className={`flex items-start gap-3 rounded-xl border ${cfg.bg} px-4 py-3`}>
                  <div className={`text-sm font-bold min-w-0 flex-shrink-0 w-[130px] leading-tight ${cfg.color}`}>{cfg.label}</div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {p.team?.logo_url && (
                      <img src={p.team.logo_url} alt="" className="h-6 w-6 object-contain flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm truncate">{p.team?.name || p.player_name || '—'}</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground flex-shrink-0">{points[p.type] ?? 0} pts</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : !isClosed ? (
        /* Mostrar formulario (nuevo o edición) mientras el plazo esté abierto */
        <SpecialPredictionsForm
          pollaId={params.id}
          teams={teams}
          firstMatchDate={firstMatchTime?.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
          points={points}
          existingPredictions={existingPredictions || []}
        />
      ) : teams.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          <div>
            <h2 className="font-bold text-amber-800">No hay equipos cargados</h2>
            <p className="text-sm text-amber-700">
              El admin necesita cargar los partidos del torneo primero.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
