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

  // Traer historial + miembros + primera predicción de la polla en paralelo.
  // El cutoff filtra entradas de matches anteriores al primer pronóstico
  // (relevante para pollas que se unen a un torneo ya empezado: evita mostrar
  // ranking en partidos donde nadie de la polla podía predecir aún).
  const [historyRes, membersRes, firstPredRes] = await Promise.all([
    admin
      .from('ranking_history')
      .select('user_id, match_id, position, total_points, created_at')
      .eq('polla_id', pollaId)
      .order('created_at', { ascending: true }),
    admin
      .from('polla_members')
      .select('user_id, alias')
      .eq('polla_id', pollaId)
      .eq('status', 'approved'),
    admin
      .from('predictions')
      .select('created_at')
      .eq('polla_id', pollaId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const history = historyRes.data;
  const members = membersRes.data;
  const firstPredictionAt = firstPredRes.data?.created_at;

  const aliasMap = new Map(members?.map((m) => [m.user_id, m.alias]) ?? []);

  // Si no hubo predicciones todavía, devolver vacío.
  if (!firstPredictionAt) {
    return { entries: [], matchLabels: {} };
  }

  // Filtrar entradas previas al primer pronóstico de la polla.
  const filteredHistory = (history ?? []).filter(
    (h) => new Date(h.created_at) >= new Date(firstPredictionAt)
  );

  // Traer info de partidos para etiquetas (solo de las entradas que sobreviven al filtro)
  const matchIds = Array.from(new Set(filteredHistory.map((h) => h.match_id).filter(Boolean) as string[]));
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

  const entries: RankingHistoryEntry[] = filteredHistory.map((h) => ({
    user_id: h.user_id,
    alias: aliasMap.get(h.user_id) ?? '???',
    match_id: h.match_id,
    position: h.position,
    total_points: h.total_points,
    created_at: h.created_at,
  }));

  return { entries, matchLabels };
}
