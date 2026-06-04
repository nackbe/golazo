import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Settings, Hash, Trophy, CalendarDays, Sparkles } from 'lucide-react';
import { CopyInviteLink } from '@/components/features/dashboard/copy-invite-link';
import RankingEvolutionChart from '@/components/features/dashboard/ranking-evolution-chart';
import { StreakIndicator } from '@/components/features/dashboard/streak-indicator';
import { getRankingHistory } from '@/lib/sync/ranking-history';

interface Props {
  params: { id: string };
}

const MEDALS = ['🥇', '🥈', '🥉'];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  open: 'Abierta',
  active: 'Activa',
  finished: 'Finalizada',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  finished: 'bg-amber-100 text-amber-700',
};

export default async function PollaDetailPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Polla + membership en paralelo (necesarios para auth check)
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

  // Resto de queries en paralelo. Admin client porque RLS limita ranking_members visible.
  const admin = createAdminClient();
  const adminPlays = polla.admin_plays ?? true;
  let membersQuery = admin
    .from('polla_members')
    .select('alias, total_points, user_id, profiles(avatar_url)')
    .eq('polla_id', params.id)
    .eq('status', 'approved');
  if (!adminPlays) {
    membersQuery = membersQuery.neq('user_id', polla.admin_id);
  }

  const [membersRes, streaksRes, rankingHistory] = await Promise.all([
    membersQuery.order('total_points', { ascending: false }),
    admin
      .from('player_streaks')
      .select('user_id, current_result_streak, current_exact_streak, current_negative_streak')
      .eq('polla_id', params.id),
    getRankingHistory(params.id),
  ]);
  const members = membersRes.data;
  const streaks = streaksRes.data;
  const streakMap = new Map(streaks?.map((s) => [s.user_id, s]) ?? []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link
          href="/pollas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Mis pollas
        </Link>
        {isAdmin && (
          <Link
            href={`/pollas/${params.id}/configurar`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Settings className="h-4 w-4" />
            Configurar
          </Link>
        )}
      </div>

      {/* Header card */}
      <div className="rounded-2xl bg-primary-dark p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-2 ${STATUS_STYLE[polla.status] ?? 'bg-muted text-muted-foreground'}`}>
              {STATUS_LABEL[polla.status] ?? polla.status}
            </span>
            <h1 className="text-2xl font-black leading-tight break-words">{polla.name}</h1>
            <p className="mt-1 text-sm text-white/60 break-words">{polla.tournaments?.name ?? 'Torneo'}</p>
          </div>
          <div className="flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Trophy className="h-7 w-7 text-white/80" />
          </div>
        </div>

        {/* Código de invitación */}
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
          <Hash className="h-4 w-4 text-white/60 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] text-white/50 uppercase tracking-wide font-semibold">Código de invitación</p>
            <p className="font-mono text-xl font-black tracking-widest">{polla.code}</p>
          </div>
          <CopyInviteLink code={polla.code} />
        </div>

        {/* Links de navegación — fixture es la acción principal, especiales chip secundario */}
        <div className="mt-3 space-y-2">
          <Link
            href={`/pollas/${params.id}/fixture`}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-3 text-sm font-bold text-white hover:bg-white/25 transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            Ver fixture y hacer predicciones
          </Link>
          <Link
            href={`/pollas/${params.id}/predicciones-especiales`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/20 transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            Predicciones especiales del torneo
          </Link>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-bold text-base">Tabla de posiciones</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {members?.length ?? 0} {members?.length === 1 ? 'jugador' : 'jugadores'}
          </p>
        </div>

        {members && members.length > 0 ? (
          <ul className="divide-y divide-border">
            {members.map((m, i) => {
              const isMe = m.user_id === user.id;
              const isTop = i < 3;
              const profileData = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              const avatarUrl = (profileData as { avatar_url: string | null } | null)?.avatar_url ?? null;
              const initials = m.alias.slice(0, 2).toUpperCase();
              return (
                <li
                  key={m.user_id}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors ${isMe ? 'bg-primary/5' : ''} ${i === 0 ? 'bg-amber-50/50' : ''}`}
                >
                  <span className="w-7 text-center text-lg leading-none flex-shrink-0">
                    {isTop ? MEDALS[i] : <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>}
                  </span>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={m.alias} loading="lazy" decoding="async" className="h-9 w-9 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold truncate block text-sm ${isMe ? 'text-primary' : ''}`}>
                      {m.alias}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isMe && (
                        <span className="text-[11px] text-primary/70 font-medium">Vos</span>
                      )}
                      <StreakIndicator streak={streakMap.get(m.user_id)} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xl font-black ${i === 0 ? 'text-amber-500' : ''}`}>
                      {m.total_points ?? 0}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground font-normal">pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Todavía no hay jugadores en esta polla.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Compartí el código <strong className="font-mono">{polla.code}</strong> para que se unan.
            </p>
          </div>
        )}
      </div>

      {/* Evolución del ranking */}
      <RankingEvolutionChart data={rankingHistory} currentUserId={user.id} />

    </div>
  );
}
