import { createAdminClient } from '@/lib/supabase/admin';
import {
  getPointSystem,
  getSpecialPointSystem,
  scoreMatchPrediction,
  calculateTournamentStatsFromMatches,
  type PointSystem,
  type SpecialPointSystem,
} from '@/lib/scoring';
import { awardBadgesFromMatch, awardBadgesBatch } from '@/lib/badges';

/**
 * Registra el estado del ranking después de calcular puntos.
 * Inserta en ranking_history la posición y total_points de cada miembro.
 */
async function recordRankingHistory(pollaId: string, matchId: string | null) {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('polla_members')
    .select('user_id, total_points')
    .eq('polla_id', pollaId)
    .eq('status', 'approved')
    .order('total_points', { ascending: false });

  if (!members || members.length === 0) return;

  const rows = members.map((m, index) => ({
    polla_id: pollaId,
    user_id: m.user_id,
    match_id: matchId,
    position: index + 1,
    total_points: m.total_points || 0,
  }));

  // Borrar snapshot anterior + insertar nuevo = idempotente
  // Esto evita duplicados sin depender de constraints UNIQUE
  const deleteQuery = admin
    .from('ranking_history')
    .delete()
    .eq('polla_id', pollaId);
  if (matchId === null) {
    await deleteQuery.is('match_id', null);
  } else {
    await deleteQuery.eq('match_id', matchId);
  }

  await admin.from('ranking_history').insert(rows);
}

/**
 * Recalcula total_points de TODOS los miembros de una polla en una sola query (batch).
 * Usa la función RPC recalculate_polla_totals para máxima eficiencia.
 * Reemplaza el antiguo recalculateMemberTotalPoints(pollaId, userId) que hacía N+1 queries.
 */
async function recalculateAllMemberTotals(pollaId: string) {
  const admin = createAdminClient();

  // Intentar usar la función RPC (más eficiente: 1 query para todos)
  // Fallback al método legacy si la RPC no existe o falla
  try {
    const { data: result, error } = await (admin as any).rpc('recalculate_polla_totals', {
      p_polla_id: pollaId,
    });

    if (error) throw error;

    // Versión 0031: la RPC hace UPDATE directo en SQL y devuelve true
    if (result === true) {
      return;
    }

    // Versión legacy 0030: la RPC devolvía un array de totales
    if (result && Array.isArray(result) && result.length > 0) {
      const updatePromises = (result as any[]).map((t: any) =>
        admin
          .from('polla_members')
          .update({ total_points: t.total_points as number })
          .eq('polla_id', pollaId)
          .eq('user_id', t.user_id as string)
      );
      await Promise.all(updatePromises);
      return;
    }
  } catch (rpcErr: any) {
    // RPC no existe todavía (migración no aplicada) → fallback a legacy
    console.warn('RPC recalculate_polla_totals not available, falling back to legacy:', rpcErr.message);
  }

  // Fallback legacy: recalcular miembro por miembro
  const { data: members } = await admin
    .from('polla_members')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('status', 'approved');

  if (members) {
    for (const member of members) {
      await recalculateMemberTotalPointsLegacy(pollaId, member.user_id);
    }
  }
}

/**
 * Versión legacy del recálculo (una sola fila).
 * Mantenida como fallback cuando la RPC no está disponible.
 */
async function recalculateMemberTotalPointsLegacy(pollaId: string, userId: string) {
  const admin = createAdminClient();

  // Leer bonus_points (migración 0034) para preservar baselines manuales.
  // Sin esto el fallback sobrescribiría total_points ignorando bonuses.
  const { data: member } = await (admin as any)
    .from('polla_members')
    .select('bonus_points')
    .eq('polla_id', pollaId)
    .eq('user_id', userId)
    .maybeSingle();
  const bonus = (member as any)?.bonus_points ?? 0;

  const { data: matchPoints } = await admin
    .from('match_points')
    .select('points')
    .eq('polla_id', pollaId)
    .eq('user_id', userId);

  const matchTotal = (matchPoints || []).reduce((acc, r) => acc + (r.points || 0), 0);

  const { data: specialPoints } = await admin
    .from('special_predictions')
    .select('points')
    .eq('polla_id', pollaId)
    .eq('user_id', userId);

  const specialTotal = (specialPoints || []).reduce((acc, r) => acc + (r.points || 0), 0);

  const total = bonus + matchTotal + specialTotal;

  await admin
    .from('polla_members')
    .update({ total_points: total })
    .eq('polla_id', pollaId)
    .eq('user_id', userId)
    .eq('status', 'approved');

  return total;
}

/**
 * Legacy: recalcula un solo miembro.
 * Usa el batch internamente (más eficiente) o fallback legacy.
 */
async function recalculateMemberTotalPoints(pollaId: string, userId: string) {
  await recalculateAllMemberTotals(pollaId);
  const admin = createAdminClient();
  const { data } = await admin
    .from('polla_members')
    .select('total_points')
    .eq('polla_id', pollaId)
    .eq('user_id', userId)
    .single();
  return data?.total_points ?? 0;
}

/**
 * Calcula los puntos de un partido para todas las pollas activas que lo contienen.
 * Es idempotente: puede correrse N veces sin duplicar puntos.
 */
export async function calculateMatchPoints(matchId: string) {
  const admin = createAdminClient();

  // 1. Obtener resultado del partido
  const { data: match } = await admin
    .from('matches')
    .select('id, home_goals, away_goals, status, tournament_id, round')
    .eq('id', matchId)
    .single();

  if (!match || (match.status !== 'FT' && match.status !== 'AFT')) {
    return { skipped: true, reason: 'Partido no terminado' };
  }

  if (match.home_goals === null || match.away_goals === null) {
    return { skipped: true, reason: 'Partido sin marcador' };
  }

  const realHome = match.home_goals;
  const realAway = match.away_goals;
  const realDiff = realHome - realAway;
  const realTotal = realHome + realAway;

  // 2. Obtener todas las pollas activas que usan este torneo
  const { data: pollas } = await admin
    .from('pollas')
    .select('id, point_system')
    .eq('tournament_id', match.tournament_id)
    .in('status', ['active', 'finished']);

  if (!pollas || pollas.length === 0) {
    return { skipped: true, reason: 'No hay pollas activas para este torneo' };
  }

  let processed = 0;

  for (const polla of pollas) {
    const ps = getPointSystem(polla.point_system);

    // 3. Obtener predicciones de miembros aprobados para este partido
    const { data: predictions } = await admin
      .from('predictions')
      .select('id, user_id, home_goals, away_goals, wildcard_used')
      .eq('match_id', matchId)
      .eq('polla_id', polla.id);

    if (!predictions || predictions.length === 0) continue;

    // Detectar "marcador único y exacto" para bonus
    const exactPredictions = predictions.filter(
      p => realHome === p.home_goals && realAway === p.away_goals
    );
    const hasUniqueExact = ps.unique_exact_bonus > 0 && exactPredictions.length === 1;
    const uniqueExactUserId = hasUniqueExact ? exactPredictions[0].user_id : null;

    for (const pred of predictions) {
      const isUniqueExactWinner = hasUniqueExact && pred.user_id === uniqueExactUserId;
      const finalPoints = scoreMatchPrediction({
        realHome,
        realAway,
        predHome: pred.home_goals,
        predAway: pred.away_goals,
        ps,
        wildcard: pred.wildcard_used as 'x2' | 'x3' | null,
        uniqueExactMultiplier: isUniqueExactWinner ? ps.unique_exact_bonus : 1,
      });

      // 4. Upsert en match_points (idempotente)
      const { error: upsertError } = await admin
        .from('match_points')
        .upsert(
          {
            polla_id: polla.id,
            user_id: pred.user_id,
            match_id: matchId,
            points: finalPoints,
          },
          { onConflict: 'polla_id, user_id, match_id' }
        );

      if (upsertError) {
        console.error('Error upsert match_points:', upsertError);
        continue;
      }

      // Badges & streaks
      try {
        const exact = realHome === pred.home_goals && realAway === pred.away_goals;
        const correctResult = Math.sign(realHome - realAway) === Math.sign(pred.home_goals - pred.away_goals);
        const isFinal = match.round ? (match.round.toLowerCase() === 'final' || match.round.toLowerCase() === 'grand final') : false;
        await awardBadgesFromMatch(polla.id, pred.user_id, {
          exact,
          correctResult,
          wildcardUsed: pred.wildcard_used,
          isFinal,
        });
      } catch (badgeErr) {
        console.error('Error awarding badges:', badgeErr);
      }

      processed++;
    }

    // 5. Recalcular total_points de TODOS los miembros en batch
    await recalculateAllMemberTotals(polla.id);
    await recordRankingHistory(polla.id, matchId);
  }

  // 6. Marcar partido como calculado
  await admin
    .from('matches')
    .update({ points_calculated: true })
    .eq('id', matchId);

  return { processed };
}

// ─────────────────────────────────────────────────────────────
// PREDICCIONES ESPECIALES — Scoring
// ─────────────────────────────────────────────────────────────

/**
 * Detecta automáticamente champion, finalist y third_place desde partidos terminados.
 * Se llama desde el sync después de actualizar partidos.
 */
export async function updateTournamentSpecialResults(tournamentId: string) {
  const admin = createAdminClient();

  // 1. Buscar partido de final
  const { data: finalMatches } = await admin
    .from('matches')
    .select('id, home_team_id, away_team_id, home_goals, away_goals, status, round')
    .eq('tournament_id', tournamentId)
    .in('status', ['FT', 'AFT'])
    .ilike('round', '%Final%');

  // Filtrar exactamente "Final" (no "Semi Final", "Quarter Final", etc.)
  const finalMatch = (finalMatches || []).find(
    (m) => m.round && (m.round.toLowerCase() === 'final' || m.round.toLowerCase() === 'grand final')
  );

  if (finalMatch && finalMatch.home_goals !== null && finalMatch.away_goals !== null) {
    const winner = finalMatch.home_goals > finalMatch.away_goals
      ? finalMatch.home_team_id
      : finalMatch.away_goals > finalMatch.home_goals
        ? finalMatch.away_team_id
        : null; // Empate en final → penalty (no manejamos penalty shootout en este MVP)

    const loser = winner === finalMatch.home_team_id
      ? finalMatch.away_team_id
      : finalMatch.home_team_id;

    if (winner) {
      await admin
        .from('tournament_special_results')
        .upsert(
          { tournament_id: tournamentId, type: 'champion', team_id: winner },
          { onConflict: 'tournament_id, type' }
        );
    }
    if (loser) {
      await admin
        .from('tournament_special_results')
        .upsert(
          { tournament_id: tournamentId, type: 'finalist', team_id: loser },
          { onConflict: 'tournament_id, type' }
        );
    }
  }

  // 2. Buscar partido de 3er lugar
  const { data: thirdMatches } = await admin
    .from('matches')
    .select('id, home_team_id, away_team_id, home_goals, away_goals, status, round')
    .eq('tournament_id', tournamentId)
    .in('status', ['FT', 'AFT'])
    .or('round.ilike.%3rd%,round.ilike.%Third%,round.ilike.%3er%');

  const thirdMatch = (thirdMatches || [])[0];
  if (thirdMatch && thirdMatch.home_goals !== null && thirdMatch.away_goals !== null) {
    const thirdWinner = thirdMatch.home_goals > thirdMatch.away_goals
      ? thirdMatch.home_team_id
      : thirdMatch.away_goals > thirdMatch.home_goals
        ? thirdMatch.away_team_id
        : null;

    if (thirdWinner) {
      await admin
        .from('tournament_special_results')
        .upsert(
          { tournament_id: tournamentId, type: 'third_place', team_id: thirdWinner },
          { onConflict: 'tournament_id, type' }
        );
    }
  }

  // 3. Calcular stats-based solo si el torneo tiene suficientes partidos terminados
  await calculateTournamentStats(tournamentId);
}

/**
 * Calcula estadísticas del torneo (goles a favor, en contra, diferencia) desde los partidos terminados.
 * Guarda los resultados en tournament_special_results para least_goals_against, worst_team, top_scorer_team.
 */
async function calculateTournamentStats(tournamentId: string) {
  const admin = createAdminClient();

  const { data: matches } = await admin
    .from('matches')
    .select('home_team_id, away_team_id, home_goals, away_goals, status')
    .eq('tournament_id', tournamentId)
    .in('status', ['FT', 'AFT']);

  if (!matches || matches.length < 2) return; // Muy pocos partidos para stats significativas

  const stats = calculateTournamentStatsFromMatches(matches as import('@/lib/scoring').TournamentMatch[]);

  if (stats.least_goals_against) {
    await admin
      .from('tournament_special_results')
      .upsert(
        { tournament_id: tournamentId, type: 'least_goals_against', team_id: stats.least_goals_against },
        { onConflict: 'tournament_id, type' }
      );
  }
  if (stats.worst_team) {
    await admin
      .from('tournament_special_results')
      .upsert(
        { tournament_id: tournamentId, type: 'worst_team', team_id: stats.worst_team },
        { onConflict: 'tournament_id, type' }
      );
  }
  if (stats.top_scorer_team) {
    await admin
      .from('tournament_special_results')
      .upsert(
        { tournament_id: tournamentId, type: 'top_scorer_team', team_id: stats.top_scorer_team },
        { onConflict: 'tournament_id, type' }
      );
  }
}

/**
 * Calcula puntos de TODOS los partidos terminados de una polla en una sola pasada.
 * Mucho más eficiente que llamar calculateMatchPoints en loop.
 */
export type BatchResult =
  | { error: string; skipped?: never; reason?: never; processed?: never; matches?: never }
  | { skipped: true; reason: string; error?: never; processed?: never; matches?: never }
  | { processed: number; matches: number; error?: never; skipped?: never; reason?: never };

export async function batchCalculateMatchPoints(pollaId: string): Promise<BatchResult> {
  const admin = createAdminClient();

  const { data: polla } = await admin
    .from('pollas')
    .select('id, tournament_id, point_system')
    .eq('id', pollaId)
    .single();

  if (!polla) return { error: 'Polla no encontrada' };

  const { data: matches } = await admin
    .from('matches')
    .select('id, home_goals, away_goals, round')
    .eq('tournament_id', polla.tournament_id)
    .in('status', ['FT', 'AFT'])
    .eq('points_calculated', false);

  if (!matches || matches.length === 0) {
    return { skipped: true, reason: 'No hay partidos pendientes de cálculo' };
  }

  const matchIds = matches.map((m) => m.id);

  const { data: predictions } = await admin
    .from('predictions')
    .select('id, user_id, match_id, home_goals, away_goals, wildcard_used')
    .eq('polla_id', pollaId)
    .in('match_id', matchIds);

  const ps = getPointSystem(polla.point_system);

  // Pre-calcular predicciones exactas por match para bonus "único y exacto"
  const exactCountByMatch = new Map<string, { userId: string; predId: string }[]>();
  for (const pred of predictions || []) {
    const match = matches.find((m) => m.id === pred.match_id);
    if (!match || match.home_goals === null || match.away_goals === null) continue;
    if (match.home_goals === pred.home_goals && match.away_goals === pred.away_goals) {
      if (!exactCountByMatch.has(pred.match_id)) exactCountByMatch.set(pred.match_id, []);
      exactCountByMatch.get(pred.match_id)!.push({ userId: pred.user_id, predId: pred.id });
    }
  }
  const uniqueExactBonusByMatch = new Map<string, string>();
  if (ps.unique_exact_bonus > 0) {
    for (const [matchId, exacts] of Array.from(exactCountByMatch.entries())) {
      if (exacts.length === 1) uniqueExactBonusByMatch.set(matchId, exacts[0].userId);
    }
  }

  const matchPointsToUpsert: Array<{
    polla_id: string;
    user_id: string;
    match_id: string;
    points: number;
  }> = [];

  // Acumular contextos para batch de badges
  const badgeContexts: Array<{
    userId: string;
    exact: boolean;
    correctResult: boolean;
    wildcardUsed: string | null;
    isFinal: boolean;
  }> = [];

  for (const pred of predictions || []) {
    const match = matches.find((m) => m.id === pred.match_id);
    if (!match || match.home_goals === null || match.away_goals === null) continue;

    const realHome = match.home_goals;
    const realAway = match.away_goals;
    const bonusUserId = uniqueExactBonusByMatch.get(pred.match_id);
    const isUniqueExactWinner = bonusUserId === pred.user_id;
    const points = scoreMatchPrediction({
      realHome,
      realAway,
      predHome: pred.home_goals,
      predAway: pred.away_goals,
      ps,
      wildcard: pred.wildcard_used as 'x2' | 'x3' | null,
      uniqueExactMultiplier: isUniqueExactWinner ? ps.unique_exact_bonus : 1,
    });

    matchPointsToUpsert.push({
      polla_id: pollaId,
      user_id: pred.user_id,
      match_id: pred.match_id,
      points,
    });

    // Acumular contexto para batch de badges (se procesa al final)
    const badgeExact = realHome === pred.home_goals && realAway === pred.away_goals;
    const badgeCorrectResult = Math.sign(realHome - realAway) === Math.sign(pred.home_goals - pred.away_goals);
    const badgeMatch = matches.find((x) => x.id === pred.match_id);
    const badgeIsFinal = badgeMatch?.round ? (badgeMatch.round.toLowerCase() === 'final' || badgeMatch.round.toLowerCase() === 'grand final') : false;
    badgeContexts.push({
      userId: pred.user_id,
      exact: badgeExact,
      correctResult: badgeCorrectResult,
      wildcardUsed: pred.wildcard_used,
      isFinal: badgeIsFinal,
    });
  }

  if (matchPointsToUpsert.length > 0) {
    const { error } = await admin
      .from('match_points')
      .upsert(matchPointsToUpsert, { onConflict: 'polla_id, user_id, match_id' });
    if (error) console.error('Error upsert batch match_points:', error);
  }

  await admin
    .from('matches')
    .update({ points_calculated: true })
    .in('id', matchIds);

  // Procesar badges en batch (mucho más eficiente que uno por uno)
  if (badgeContexts.length > 0) {
    try {
      await awardBadgesBatch(pollaId, badgeContexts);
    } catch (badgeErr) {
      console.error('Error awarding badges batch:', badgeErr);
    }
  }

  // Recalcular totales de TODOS los miembros en batch (una sola query RPC)
  await recalculateAllMemberTotals(pollaId);

  // Registrar ranking history para CADA partido procesado
  // Esto permite que la gráfica de evolución muestre el avance partido a partido
  for (const match of matches) {
    await recordRankingHistory(pollaId, match.id);
  }

  return { processed: matchPointsToUpsert.length, matches: matches.length };
}

/**
 * Calcula los puntos de predicciones especiales para una polla.
 * Compara special_predictions vs tournament_special_results.
 * Es idempotente: puede correrse N veces sin duplicar puntos.
 */
export async function calculateSpecialPoints(pollaId: string) {
  const admin = createAdminClient();

  // 1. Obtener polla con torneo y sistema de puntos
  const { data: polla } = await admin
    .from('pollas')
    .select('id, tournament_id, special_point_system')
    .eq('id', pollaId)
    .single();

  if (!polla || !polla.tournament_id) {
    return { skipped: true, reason: 'Polla sin torneo' };
  }

  const sps = getSpecialPointSystem(polla.special_point_system);

  // Gate: solo procesar specials cuando el torneo esté terminado.
  // Sin esto el cron recalcula specials cada 2 min con stats parciales —
  // worst_team/top_scorer_team se mueven a medida que llegan FT y el ranking
  // baila. Diseño: specials se evalúan al final, una sola vez.
  const { count: pendingCount } = await admin
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', polla.tournament_id)
    .not('status', 'in', '(FT,AFT,CANC,ABD,AWD,WO)');
  if (pendingCount && pendingCount > 0) {
    return { skipped: true, reason: `Torneo en curso (${pendingCount} partidos pendientes)` };
  }

  // 2. Obtener resultados reales del torneo
  const { data: results } = await admin
    .from('tournament_special_results')
    .select('type, team_id')
    .eq('tournament_id', polla.tournament_id);

  if (!results || results.length === 0) {
    return { skipped: true, reason: 'No hay resultados especiales para este torneo' };
  }

  const resultMap = new Map(results.map((r) => [r.type, r.team_id]));

  // 3. Obtener predicciones de miembros aprobados
  const { data: predictions } = await admin
    .from('special_predictions')
    .select('id, user_id, type, team_id')
    .eq('polla_id', pollaId);

  if (!predictions || predictions.length === 0) {
    return { skipped: true, reason: 'No hay predicciones especiales en esta polla' };
  }

  let processed = 0;

  for (const pred of predictions) {
    const actualTeamId = resultMap.get(pred.type);
    if (!actualTeamId) continue; // No hay resultado real para este tipo todavía

    const points = pred.team_id === actualTeamId ? (sps[pred.type as keyof SpecialPointSystem] || 0) : 0;

    // Actualizar points en special_predictions (idempotente)
    const { error: updateError } = await admin
      .from('special_predictions')
      .update({ points })
      .eq('id', pred.id);

    if (updateError) {
      console.error('Error updating special_predictions points:', updateError);
      continue;
    }

    if (points > 0) processed++;
  }

  // 4. Recalcular total_points de cada miembro
  const { data: members } = await admin
    .from('polla_members')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('status', 'approved');

  if (members) {
    for (const member of members) {
      await recalculateMemberTotalPoints(pollaId, member.user_id);
    }
    await recordRankingHistory(pollaId, null);
  }

  return { processed };
}
