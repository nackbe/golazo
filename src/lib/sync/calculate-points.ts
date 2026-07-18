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
import { TERMINAL_MATCH_STATUSES } from '@/lib/match-status';

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

  // Resolver ganador de un partido de eliminatoria considerando penales.
  // home_goals/away_goals guardan marcador a 90 min (por design: predicciones
  // se validan contra 90'). Cuando status='PEN' hay empate en 90' → desempate
  // por penales en home_penalty_goals/away_penalty_goals. Sin esta lógica,
  // una final por penales dejaba winner=null → nunca se asignaba champion/finalist.
  function decideKnockoutWinner(m: {
    home_team_id: string | null;
    away_team_id: string | null;
    home_goals: number | null;
    away_goals: number | null;
    home_penalty_goals: number | null;
    away_penalty_goals: number | null;
    status: string | null;
  }): { winner: string | null; loser: string | null } {
    const hg = m.home_goals, ag = m.away_goals;
    if (hg === null || ag === null) return { winner: null, loser: null };
    if (hg > ag) return { winner: m.home_team_id, loser: m.away_team_id };
    if (ag > hg) return { winner: m.away_team_id, loser: m.home_team_id };
    // Empate 90'. Solo desempata si status=PEN + penales presentes.
    if (m.status === 'PEN' && m.home_penalty_goals != null && m.away_penalty_goals != null) {
      if (m.home_penalty_goals > m.away_penalty_goals) return { winner: m.home_team_id, loser: m.away_team_id };
      if (m.away_penalty_goals > m.home_penalty_goals) return { winner: m.away_team_id, loser: m.home_team_id };
    }
    return { winner: null, loser: null };
  }

  // 1. Buscar partido de final
  const { data: finalMatches } = await admin
    .from('matches')
    .select('id, home_team_id, away_team_id, home_goals, away_goals, home_penalty_goals, away_penalty_goals, status, round')
    .eq('tournament_id', tournamentId)
    .in('status', TERMINAL_MATCH_STATUSES as unknown as string[])
    .ilike('round', '%Final%');

  // Filtrar exactamente "Final" (no "Semi Final", "Quarter Final", etc.)
  const finalMatch = (finalMatches || []).find(
    (m) => m.round && (m.round.toLowerCase() === 'final' || m.round.toLowerCase() === 'grand final')
  );

  if (finalMatch) {
    const { winner, loser } = decideKnockoutWinner(finalMatch);

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
    .select('id, home_team_id, away_team_id, home_goals, away_goals, home_penalty_goals, away_penalty_goals, status, round')
    .eq('tournament_id', tournamentId)
    .in('status', TERMINAL_MATCH_STATUSES as unknown as string[])
    .or('round.ilike.%3rd%,round.ilike.%Third%,round.ilike.%3er%');

  const thirdMatch = (thirdMatches || [])[0];
  if (thirdMatch) {
    const { winner: thirdWinner } = decideKnockoutWinner(thirdMatch);

    if (thirdWinner) {
      await admin
        .from('tournament_special_results')
        .upsert(
          { tournament_id: tournamentId, type: 'third_place', team_id: thirdWinner },
          { onConflict: 'tournament_id, type' }
        );
    }
  }

  // Stats-based (top_scorer_team, worst_team, least_goals_against) NO se
  // persisten en tournament_special_results: se calculan on-the-fly desde
  // los partidos de fase de grupos en calculateSpecialPoints, y devuelven
  // arrays de ganadores para soportar empates (múltiples equipos con el
  // mismo valor extremo). Ese schema tiene UNIQUE(tournament_id, type) →
  // no cabe multi-row, por eso el cómputo se mueve al validador.
}

/**
 * Devuelve stats derivadas de partidos de FASE DE GRUPOS únicamente.
 * Empates → múltiples ganadores por tipo (arrays).
 *
 * Solo grupos por diseño: los premios "goleador", "menos goleado" y "peor
 * equipo" se congelan al terminar la fase de grupos y no cambian por lo que
 * pase en eliminatorias. Sumando eliminatorias las estadísticas se ensucian
 * (equipos que juegan más partidos tienen ventaja acumulativa).
 */
async function fetchGroupStageStats(tournamentId: string) {
  const admin = createAdminClient();
  const { data: matches } = await admin
    .from('matches')
    .select('home_team_id, away_team_id, home_goals, away_goals, status')
    .eq('tournament_id', tournamentId)
    .ilike('round', 'Group Stage%')
    .in('status', TERMINAL_MATCH_STATUSES as unknown as string[]);

  return calculateTournamentStatsFromMatches(
    (matches || []) as import('@/lib/scoring').TournamentMatch[]
  );
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

  // ESTRATEGIA Z: usar match_points como flag per-polla.
  // El flag matches.points_calculated es global → race entre pollas
  // (bug 2026-06-18 KR2GGY/Uzb-Col). Quitar el filtro sin más reprocesaba
  // TODO cada cron → 504 timeout + ranking_history horizontal porque
  // recordRankingHistory recibía el total ya consolidado de N matches.
  //
  // Solución: solo procesar matches que esta polla NO tenga aún en
  // match_points. Cada polla actúa sobre su propia "huella" → cero race
  // entre pollas, cero reprocesamiento, snapshots correctos.
  const { data: allFtMatches } = await admin
    .from('matches')
    .select('id, home_goals, away_goals, round, scheduled_at, points_calculated')
    .eq('tournament_id', polla.tournament_id)
    .in('status', TERMINAL_MATCH_STATUSES as unknown as string[])
    .order('scheduled_at', { ascending: true });

  if (!allFtMatches || allFtMatches.length === 0) {
    return { skipped: true, reason: 'No hay partidos terminados en este torneo' };
  }

  // Paginar: PostgREST tope ~1000 rows. Pollas grandes (1620 preds en
  // CNWFT9) eran truncadas → predMatchIds set incompleto → orphans
  // permanentes. Mismo problema con match_points por polla en pollas
  // antiguas con muchas filas.
  async function fetchAllMatchIds(table: 'match_points' | 'predictions'): Promise<Set<string>> {
    const out = new Set<string>();
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await admin
        .from(table)
        .select('match_id')
        .eq('polla_id', pollaId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) out.add(r.match_id);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  const [alreadyDone, predMatchIds] = await Promise.all([
    fetchAllMatchIds('match_points'),
    fetchAllMatchIds('predictions'),
  ]);

  // Solo procesar matches que:
  //  (a) ya están terminados (allFtMatches);
  //  (b) [nuevo] esta polla NO los tenga ya en match_points, O el flag
  //      global points_calculated=false (goles corregidos, hay que
  //      recomputar aunque ya haya match_points);
  //  (c) la polla TIENE al menos 1 predicción en ese match.
  //
  // El caso (b)-forzado cubre: cuando corregimos manualmente
  // home_goals/away_goals de un match y flipeamos calc=false (bug
  // Belgium-Senegal 2026-07-01 — API-Football goals incluía ET),
  // TODAS las pollas con predicciones deben recomputar puntos con el
  // marcador nuevo. UPSERT idempotente sobrescribe con valores nuevos.
  const matches = allFtMatches.filter(
    (m) =>
      predMatchIds.has(m.id) &&
      (!alreadyDone.has(m.id) || (m as any).points_calculated === false)
  );

  if (matches.length === 0) {
    return {
      skipped: true,
      reason: 'Polla sin matches nuevos con predicciones',
    };
  }

  const matchIds = matches.map((m) => m.id);
  const ps = getPointSystem(polla.point_system);

  const { data: predictions } = await admin
    .from('predictions')
    .select('id, user_id, match_id, home_goals, away_goals, wildcard_used')
    .eq('polla_id', pollaId)
    .in('match_id', matchIds);

  // Procesar match a match en orden cronológico:
  // - upsert match_points del match actual
  // - recalc totales (refleja todos los match_points hasta este momento)
  // - recordRankingHistory (snapshot incremental correcto, no horizontal)
  const badgeContexts: Array<{
    userId: string;
    exact: boolean;
    correctResult: boolean;
    wildcardUsed: string | null;
    isFinal: boolean;
  }> = [];
  let totalRowsUpserted = 0;

  for (const match of matches) {
    if (match.home_goals === null || match.away_goals === null) {
      // Match FT sin marcador (extraño); marcamos flag y seguimos
      await admin.from('matches').update({ points_calculated: true }).eq('id', match.id);
      continue;
    }

    const matchPreds = (predictions || []).filter((p) => p.match_id === match.id);
    const realHome = match.home_goals;
    const realAway = match.away_goals;

    // unique exact bonus dentro de este match
    const exactPreds = matchPreds.filter(
      (p) => p.home_goals === realHome && p.away_goals === realAway
    );
    const uniqueWinnerId =
      ps.unique_exact_bonus > 0 && exactPreds.length === 1 ? exactPreds[0].user_id : null;

    if (matchPreds.length > 0) {
      const rows = matchPreds.map((pred) => {
        const points = scoreMatchPrediction({
          realHome,
          realAway,
          predHome: pred.home_goals,
          predAway: pred.away_goals,
          ps,
          wildcard: pred.wildcard_used as 'x2' | 'x3' | null,
          uniqueExactMultiplier:
            pred.user_id === uniqueWinnerId ? ps.unique_exact_bonus : 1,
        });

        // Acumular contexto de badges para procesar al final
        const isExact = pred.home_goals === realHome && pred.away_goals === realAway;
        const isCorrectResult =
          Math.sign(realHome - realAway) === Math.sign(pred.home_goals - pred.away_goals);
        const isFinal = match.round
          ? match.round.toLowerCase() === 'final' || match.round.toLowerCase() === 'grand final'
          : false;
        badgeContexts.push({
          userId: pred.user_id,
          exact: isExact,
          correctResult: isCorrectResult,
          wildcardUsed: pred.wildcard_used,
          isFinal,
        });

        return {
          polla_id: pollaId,
          user_id: pred.user_id,
          match_id: match.id,
          points,
        };
      });

      const { error: upErr } = await admin
        .from('match_points')
        .upsert(rows, { onConflict: 'polla_id, user_id, match_id' });
      if (upErr) {
        console.error('Error upsert match_points para match', match.id, upErr);
      } else {
        totalRowsUpserted += rows.length;
      }

      // Recalc + history INCREMENTAL — snapshot tras este match
      await recalculateAllMemberTotals(pollaId);
      await recordRankingHistory(pollaId, match.id);
    }

    // Marcar el match como procesado (flag global, igual idempotente)
    await admin.from('matches').update({ points_calculated: true }).eq('id', match.id);
  }

  // Badges al final (batch)
  if (badgeContexts.length > 0) {
    try {
      await awardBadgesBatch(pollaId, badgeContexts);
    } catch (badgeErr) {
      console.error('Error awarding badges batch:', badgeErr);
    }
  }

  return { processed: totalRowsUpserted, matches: matches.length };
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
    .not('status', 'in', '(FT,AFT,AET,PEN,CANC,ABD,AWD,WO)');
  if (pendingCount && pendingCount > 0) {
    return { skipped: true, reason: `Torneo en curso (${pendingCount} partidos pendientes)` };
  }

  // 2. Cargar ganadores reales.
  //   - champion/finalist/third_place: 1 equipo por tipo → viene de
  //     tournament_special_results (upserteado por updateTournamentSpecialResults).
  //   - top_scorer_team/worst_team/least_goals_against: N equipos por tipo
  //     (empates) → se calculan on-the-fly SOLO sobre partidos de fase de
  //     grupos. Predicción acierta si el team_id predicho está en el set.
  const [{ data: results }, groupStats] = await Promise.all([
    admin
      .from('tournament_special_results')
      .select('type, team_id')
      .eq('tournament_id', polla.tournament_id),
    fetchGroupStageStats(polla.tournament_id),
  ]);

  // Set de ganadores por tipo (para O(1) lookup).
  const winnersByType = new Map<string, Set<string>>();
  for (const r of results || []) {
    if (!r.team_id) continue;
    if (!winnersByType.has(r.type)) winnersByType.set(r.type, new Set());
    winnersByType.get(r.type)!.add(r.team_id);
  }
  winnersByType.set('top_scorer_team', new Set(groupStats.top_scorer_team));
  winnersByType.set('worst_team', new Set(groupStats.worst_team));
  winnersByType.set('least_goals_against', new Set(groupStats.least_goals_against));

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
    const winners = winnersByType.get(pred.type);
    if (!winners || winners.size === 0) continue; // sin resultado aún

    const isHit = pred.team_id ? winners.has(pred.team_id) : false;
    const points = isHit ? (sps[pred.type as keyof SpecialPointSystem] || 0) : 0;

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
