import { createAdminClient } from '@/lib/supabase/admin';

export const BADGE_DEFINITIONS = {
  streak_result_3: { id: 'streak_result_3', label: '🔥 En racha', description: '3 aciertos seguidos', tier: 'bronze' },
  streak_result_5: { id: 'streak_result_5', label: '🔥🔥 Imparable', description: '5 aciertos seguidos', tier: 'silver' },
  streak_result_10: { id: 'streak_result_10', label: '🔥🔥🔥 Atronador', description: '10 aciertos seguidos', tier: 'gold' },
  streak_exact_2: { id: 'streak_exact_2', label: '🎯 Ojo clínico', description: '2 exactos seguidos', tier: 'bronze' },
  streak_exact_3: { id: 'streak_exact_3', label: '🎯🎯 Nostradamus', description: '3 exactos seguidos', tier: 'silver' },
  streak_exact_5: { id: 'streak_exact_5', label: '🎯🎯🎯 Oráculo', description: '5 exactos seguidos', tier: 'gold' },
  negative_streak_5: { id: 'negative_streak_5', label: '💀 En recuperación', description: '5 fallos seguidos', tier: 'wood' },
  first_prediction: { id: 'first_prediction', label: '🌟 Novato', description: 'Primera predicción hecha', tier: 'wood' },
  perfect_wildcard: { id: 'perfect_wildcard', label: '🃏 Comodín perfecto', description: 'Usaste x2/x3 y acertaste exacto', tier: 'silver' },
  exact_in_final: { id: 'exact_in_final', label: '🎲 Adivino', description: 'Acertaste el exacto en una final', tier: 'gold' },
  never_missed: { id: 'never_missed', label: '🔔 Nunca falta', description: 'Predijiste todos los partidos de la polla', tier: 'gold' },
  lead_once: { id: 'lead_once', label: '🥇 Primer lugar', description: 'Lideraste el ranking al menos una vez', tier: 'silver' },
  poll_champion: { id: 'poll_champion', label: '🏆 Campeón', description: 'Ganaste una polla', tier: 'gold' },
  legend: { id: 'legend', label: '👑 Legend', description: 'Ganaste 3 pollas', tier: 'legend' },
} as const;

export type BadgeId = keyof typeof BADGE_DEFINITIONS;

interface PredictionHistory {
  match_id: string;
  pred_home: number;
  pred_away: number;
  real_home: number;
  real_away: number;
  wildcard_used: string | null;
  round: string | null;
  scheduled_at: string;
}

interface Streaks {
  current_result_streak: number;
  max_result_streak: number;
  current_exact_streak: number;
  max_exact_streak: number;
  current_negative_streak: number;
}

/**
 * Calcula rachas de un jugador en una polla.
 * Lee predictions + matches terminados, ordenados cronológicamente.
 */
export async function calculateAndUpdateStreaks(pollaId: string, userId: string) {
  const admin = createAdminClient();

  const { data: predictions } = await admin
    .from('predictions')
    .select('match_id, home_goals, away_goals, wildcard_used, matches!inner(home_goals, away_goals, scheduled_at, round, status)')
    .eq('polla_id', pollaId)
    .eq('user_id', userId)
    .in('matches.status', ['FT', 'AFT'])
    .order('matches.scheduled_at', { ascending: true });

  const rows: PredictionHistory[] = (predictions || [])
    .map((p: any) => ({
      match_id: p.match_id,
      pred_home: p.home_goals ?? -1,
      pred_away: p.away_goals ?? -1,
      real_home: p.matches?.home_goals ?? -1,
      real_away: p.matches?.away_goals ?? -1,
      wildcard_used: p.wildcard_used,
      round: p.matches?.round ?? null,
      scheduled_at: p.matches?.scheduled_at ?? '',
    }))
    .filter((p) => p.pred_home >= 0 && p.pred_away >= 0 && p.real_home >= 0 && p.real_away >= 0);

  let currentResult = 0;
  let maxResult = 0;
  let currentExact = 0;
  let maxExact = 0;
  let currentNegative = 0;

  for (const p of rows) {
    const exact = p.pred_home === p.real_home && p.pred_away === p.real_away;
    const realDiff = p.real_home - p.real_away;
    const predDiff = p.pred_home - p.pred_away;
    const correctResult = Math.sign(realDiff) === Math.sign(predDiff);

    if (exact) {
      currentExact++;
      maxExact = Math.max(maxExact, currentExact);
    } else {
      currentExact = 0;
    }

    if (correctResult) {
      currentResult++;
      maxResult = Math.max(maxResult, currentResult);
      currentNegative = 0;
    } else {
      currentResult = 0;
      currentNegative++;
    }
  }

  const streaks: Streaks = {
    current_result_streak: currentResult,
    max_result_streak: maxResult,
    current_exact_streak: currentExact,
    max_exact_streak: maxExact,
    current_negative_streak: currentNegative,
  };

  await admin
    .from('player_streaks')
    .upsert(
      { polla_id: pollaId, user_id: userId, ...streaks, updated_at: new Date().toISOString() },
      { onConflict: 'polla_id, user_id' }
    );

  return { streaks, rows };
}

/**
 * Otorga badges basados en rachas y logros recientes.
 * Es idempotente: no duplica badges ya existentes.
 */
export async function awardBadgesFromMatch(
  pollaId: string,
  userId: string,
  context: {
    exact: boolean;
    correctResult: boolean;
    wildcardUsed: string | null;
    isFinal: boolean;
  }
) {
  const admin = createAdminClient();

  const { streaks } = await calculateAndUpdateStreaks(pollaId, userId);

  const badgesToAward: Array<{ badge_id: BadgeId; metadata?: Record<string, unknown> }> = [];

  // Streak badges
  if (streaks.max_result_streak >= 3) badgesToAward.push({ badge_id: 'streak_result_3' });
  if (streaks.max_result_streak >= 5) badgesToAward.push({ badge_id: 'streak_result_5' });
  if (streaks.max_result_streak >= 10) badgesToAward.push({ badge_id: 'streak_result_10' });
  if (streaks.max_exact_streak >= 2) badgesToAward.push({ badge_id: 'streak_exact_2' });
  if (streaks.max_exact_streak >= 3) badgesToAward.push({ badge_id: 'streak_exact_3' });
  if (streaks.max_exact_streak >= 5) badgesToAward.push({ badge_id: 'streak_exact_5' });
  if (streaks.current_negative_streak >= 5) badgesToAward.push({ badge_id: 'negative_streak_5' });

  // Perfect wildcard
  if (context.exact && (context.wildcardUsed === 'x2' || context.wildcardUsed === 'x3')) {
    badgesToAward.push({ badge_id: 'perfect_wildcard' });
  }

  // Exact in final
  if (context.exact && context.isFinal) {
    badgesToAward.push({ badge_id: 'exact_in_final' });
  }

  // First prediction (any prediction in this polla)
  const { count: predCount } = await admin
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('polla_id', pollaId)
    .eq('user_id', userId);
  if ((predCount ?? 0) >= 1) {
    badgesToAward.push({ badge_id: 'first_prediction' });
  }

  // Lead once (check ranking_history)
  const { data: leadCheck } = await admin
    .from('ranking_history')
    .select('id')
    .eq('polla_id', pollaId)
    .eq('user_id', userId)
    .eq('position', 1)
    .limit(1);
  if (leadCheck && leadCheck.length > 0) {
    badgesToAward.push({ badge_id: 'lead_once' });
  }

  // Insert badges idempotently
  for (const b of badgesToAward) {
    await admin
      .from('player_badges')
      .upsert(
        { user_id: userId, badge_id: b.badge_id, polla_id: pollaId, metadata: (b.metadata ?? {}) as any },
        { onConflict: 'user_id, badge_id, polla_id' }
      );
  }

  return { awarded: badgesToAward.length };
}
