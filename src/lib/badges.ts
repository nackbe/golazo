import { createAdminClient } from '@/lib/supabase/admin';
import { isMatchTerminal } from '@/lib/match-status';

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

export interface PredictionHistory {
  match_id: string;
  pred_home: number;
  pred_away: number;
  real_home: number;
  real_away: number;
  wildcard_used: string | null;
  round: string | null;
  scheduled_at: string;
}

export interface Streaks {
  current_result_streak: number;
  max_result_streak: number;
  current_exact_streak: number;
  max_exact_streak: number;
  current_negative_streak: number;
}

/**
 * Función pura que calcula rachas a partir de un historial de predicciones.
 */
export function computeStreaks(rows: PredictionHistory[]): Streaks {
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

  return {
    current_result_streak: currentResult,
    max_result_streak: maxResult,
    current_exact_streak: currentExact,
    max_exact_streak: maxExact,
    current_negative_streak: currentNegative,
  };
}

export interface BadgeContext {
  exact: boolean;
  correctResult: boolean;
  wildcardUsed: string | null;
  isFinal: boolean;
}

/**
 * Función pura que determina qué badges corresponden según rachas y contexto.
 */
export function determineBadges(streaks: Streaks, context: BadgeContext): Array<{ badge_id: BadgeId; metadata?: Record<string, unknown> }> {
  const badges: Array<{ badge_id: BadgeId; metadata?: Record<string, unknown> }> = [];

  if (streaks.max_result_streak >= 3) badges.push({ badge_id: 'streak_result_3' });
  if (streaks.max_result_streak >= 5) badges.push({ badge_id: 'streak_result_5' });
  if (streaks.max_result_streak >= 10) badges.push({ badge_id: 'streak_result_10' });
  if (streaks.max_exact_streak >= 2) badges.push({ badge_id: 'streak_exact_2' });
  if (streaks.max_exact_streak >= 3) badges.push({ badge_id: 'streak_exact_3' });
  if (streaks.max_exact_streak >= 5) badges.push({ badge_id: 'streak_exact_5' });
  if (streaks.current_negative_streak >= 5) badges.push({ badge_id: 'negative_streak_5' });

  if (context.exact && (context.wildcardUsed === 'x2' || context.wildcardUsed === 'x3')) {
    badges.push({ badge_id: 'perfect_wildcard' });
  }

  if (context.exact && context.isFinal) {
    badges.push({ badge_id: 'exact_in_final' });
  }

  return badges;
}

/**
 * Calcula rachas de un jugador en una polla.
 * Lee predictions + matches terminados, ordenados cronológicamente.
 */
export async function calculateAndUpdateStreaks(pollaId: string, userId: string) {
  const admin = createAdminClient();

  // Note: avoid filtering/ordering on embedded columns in supabase-js — do it in JS instead
  const { data: predictions } = await admin
    .from('predictions')
    .select('match_id, home_goals, away_goals, wildcard_used, matches!inner(home_goals, away_goals, scheduled_at, round, status)')
    .eq('polla_id', pollaId)
    .eq('user_id', userId);

  const rows: PredictionHistory[] = (predictions || [])
    .map((p: any) => {
      // supabase-js may return the embedded join as object or array depending on FK direction
      const m = Array.isArray(p.matches) ? p.matches[0] : p.matches;
      return {
        match_id: p.match_id,
        pred_home: p.home_goals ?? -1,
        pred_away: p.away_goals ?? -1,
        real_home: m?.home_goals ?? -1,
        real_away: m?.away_goals ?? -1,
        wildcard_used: p.wildcard_used,
        round: m?.round ?? null,
        scheduled_at: m?.scheduled_at ?? '',
        _status: m?.status ?? '',
      };
    })
    .filter((p) =>
      isMatchTerminal(p._status) &&
      p.pred_home >= 0 && p.pred_away >= 0 &&
      p.real_home >= 0 && p.real_away >= 0
    )
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .map(({ _status, ...rest }) => rest);

  const streaks = computeStreaks(rows);

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

  const badgesToAward = determineBadges(streaks, context);

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

/**
 * Batch version: otorga badges para múltiples usuarios de una polla.
 * Mucho más eficiente que llamar awardBadgesFromMatch en loop.
 * Procesa rachas, conteos y leads en batch.
 */
export async function awardBadgesBatch(
  pollaId: string,
  userContexts: Array<{
    userId: string;
    exact: boolean;
    correctResult: boolean;
    wildcardUsed: string | null;
    isFinal: boolean;
  }>
) {
  const admin = createAdminClient();
  if (userContexts.length === 0) return { awarded: 0 };

  const userIds = Array.from(new Set(userContexts.map((c) => c.userId)));

  // 1. Calcular rachas para todos los usuarios en paralelo
  const streaksMap = new Map<string, Streaks>();
  const streakPromises = userIds.map(async (userId) => {
    try {
      const { streaks } = await calculateAndUpdateStreaks(pollaId, userId);
      streaksMap.set(userId, streaks);
    } catch (e) {
      console.error(`Error calculating streaks for ${userId}:`, e);
    }
  });
  await Promise.all(streakPromises);

  // 2. Contar predicciones para todos los usuarios en batch
  const { data: predCounts } = await admin
    .from('predictions')
    .select('user_id', { count: 'exact' })
    .eq('polla_id', pollaId)
    .in('user_id', userIds);

  const hasPrediction = new Set((predCounts || []).map((p: any) => p.user_id));

  // 3. Verificar leads para todos los usuarios en batch
  const { data: leads } = await admin
    .from('ranking_history')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('position', 1)
    .in('user_id', userIds);

  const hasLead = new Set((leads || []).map((l: any) => l.user_id));

  // 4. Determinar badges y acumular
  const badgesToInsert: Array<{
    user_id: string;
    badge_id: BadgeId;
    polla_id: string;
    metadata: any;
  }> = [];

  for (const ctx of userContexts) {
    const streaks = streaksMap.get(ctx.userId);
    if (!streaks) continue;

    const badges = determineBadges(streaks, ctx);

    if (hasPrediction.has(ctx.userId)) {
      badges.push({ badge_id: 'first_prediction' });
    }
    if (hasLead.has(ctx.userId)) {
      badges.push({ badge_id: 'lead_once' });
    }

    for (const b of badges) {
      badgesToInsert.push({
        user_id: ctx.userId,
        badge_id: b.badge_id,
        polla_id: pollaId,
        metadata: b.metadata ?? {},
      });
    }
  }

  // 5. Deduplicar por (user_id, badge_id, polla_id) — PostgreSQL no permite
  // duplicados dentro del mismo array en ON CONFLICT DO UPDATE
  const uniqueBadges = new Map<string, typeof badgesToInsert[0]>();
  for (const b of badgesToInsert) {
    const key = `${b.user_id}:${b.badge_id}:${b.polla_id}`;
    uniqueBadges.set(key, b);
  }
  const deduped = Array.from(uniqueBadges.values());

  // 6. Insertar todos los badges en un solo batch
  if (deduped.length > 0) {
    const { error } = await admin
      .from('player_badges')
      .upsert(deduped, { onConflict: 'user_id, badge_id, polla_id' });
    if (error) {
      console.error('Error batch inserting badges:', error);
    }
  }

  return { awarded: deduped.length };
}
