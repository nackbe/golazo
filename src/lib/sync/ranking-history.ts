import { createAdminClient } from '@/lib/supabase/admin';

export interface RankingHistoryEntry {
  user_id: string;
  alias: string;
  match_id: string | null;
  position: number;
  total_points: number;
  created_at: string;
}

export interface RankingEvolutionData {
  entries: RankingHistoryEntry[];
  matchLabels: Record<string, string>; // match_id -> label
}

/**
 * Obtiene el historial de ranking para una polla.
 * Incluye alias de los miembros y etiquetas de partidos.
 */
export async function getRankingHistory(pollaId: string): Promise<RankingEvolutionData> {
  const admin = createAdminClient();

  // 1. Traer historial
  const { data: history } = await admin
    .from('ranking_history')
    .select('user_id, match_id, position, total_points, created_at')
    .eq('polla_id', pollaId)
    .order('created_at', { ascending: true });

  // 2. Traer aliases de miembros
  const { data: members } = await admin
    .from('polla_members')
    .select('user_id, alias')
    .eq('polla_id', pollaId)
    .eq('status', 'approved');

  const aliasMap = new Map(members?.map((m) => [m.user_id, m.alias]) ?? []);

  // 3. Traer info de partidos para etiquetas
  const matchIds = Array.from(new Set((history ?? []).map((h) => h.match_id).filter(Boolean) as string[]));
  let matchLabels: Record<string, string> = {};

  if (matchIds.length > 0) {
    const { data: matches } = await admin
      .from('matches')
      .select('id, home_team_id, away_team_id, scheduled_at, teams!matches_home_team_id_fkey(name), away_teams:teams!matches_away_team_id_fkey(name)')
      .in('id', matchIds);

    for (const m of matches ?? []) {
      const home = (m as any).teams?.name ?? '?';
      const away = (m as any).away_teams?.name ?? '?';
      const date = new Date(m.scheduled_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
      matchLabels[m.id] = `${home} vs ${away} (${date})`;
    }
  }

  const entries: RankingHistoryEntry[] =
    history?.map((h) => ({
      user_id: h.user_id,
      alias: aliasMap.get(h.user_id) ?? '???',
      match_id: h.match_id,
      position: h.position,
      total_points: h.total_points,
      created_at: h.created_at,
    })) ?? [];

  return { entries, matchLabels };
}
