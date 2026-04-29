'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getFixturesByIds } from '@/services/api-football';
import { calculateMatchPoints, updateTournamentSpecialResults, calculateSpecialPoints } from '@/lib/sync/calculate-points';
import { revalidatePath } from 'next/cache';

const VALID_STATUS_PROGRESSION = [
  'NS', '1H', 'HT', '2H', 'ET', 'P', 'FT', 'AFT', 'CANC',
];

function statusIndex(status: string) {
  return VALID_STATUS_PROGRESSION.indexOf(status);
}

function canUpdate(from: string, to: string) {
  if (from === 'CANC' || from === 'FT' || from === 'AFT') return false;
  const fromIdx = statusIndex(from);
  const toIdx = statusIndex(to);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx >= fromIdx;
}

export async function refreshFixtureResults(pollaId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Obtener torneo de la polla
  const { data: polla } = await admin
    .from('pollas')
    .select('tournament_id')
    .eq('id', pollaId)
    .single();

  if (!polla?.tournament_id) return { error: 'Polla sin torneo' };

  // Partidos atrasados o en vivo
  const { data: overdueMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at')
    .eq('tournament_id', polla.tournament_id)
    .eq('status', 'NS')
    .lt('scheduled_at', now);

  const { data: liveMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at')
    .eq('tournament_id', polla.tournament_id)
    .in('status', ['1H', 'HT', '2H', 'ET', 'P']);

  const { data: finishedMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at, points_calculated')
    .eq('tournament_id', polla.tournament_id)
    .in('status', ['FT', 'AFT'])
    .eq('points_calculated', false);

  const toSync = [...(overdueMatches || []), ...(liveMatches || [])];
  const toCalculate: string[] = (finishedMatches || []).map((m) => m.id);

  const results = {
    synced: 0,
    calculated: 0,
    errors: [] as string[],
  };

  if (toSync.length > 0) {
    const ids = toSync
      .map((m) => m.api_football_id)
      .filter((id): id is number => id !== null);

    if (ids.length > 0) {
      try {
        const apiData = await getFixturesByIds(ids);

        for (const fixture of apiData.response || []) {
          const match = toSync.find((m) => m.api_football_id === fixture.fixture.id);
          if (!match) continue;

          const newStatus = fixture.fixture.status.short;
          const currentStatus = match.status || 'NS';

          if (!canUpdate(currentStatus, newStatus)) continue;

          const homeGoals = fixture.goals.home;
          const awayGoals = fixture.goals.away;
          const homePenaltyGoals = fixture.score?.penalty?.home ?? null;
          const awayPenaltyGoals = fixture.score?.penalty?.away ?? null;

          const { error: updateError } = await admin
            .from('matches')
            .update({
              status: newStatus,
              home_goals: homeGoals,
              away_goals: awayGoals,
              home_penalty_goals: homePenaltyGoals,
              away_penalty_goals: awayPenaltyGoals,
            })
            .eq('id', match.id);

          if (updateError) {
            results.errors.push(`Update match ${match.id}: ${updateError.message}`);
          } else {
            results.synced++;
            if (newStatus === 'FT' || newStatus === 'AFT') {
              toCalculate.push(match.id);
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`API-Football error: ${err.message}`);
      }
    }
  }

  // Calcular puntos de partidos
  for (const matchId of toCalculate) {
    try {
      const calcResult = await calculateMatchPoints(matchId);
      if ('processed' in calcResult) {
        results.calculated++;
      }
    } catch (err: any) {
      results.errors.push(`Calculate ${matchId}: ${err.message}`);
    }
  }

  // Calcular especiales
  try {
    await updateTournamentSpecialResults(polla.tournament_id);
    const specialResult = await calculateSpecialPoints(pollaId);
    if ('processed' in specialResult) {
      // ok
    }
  } catch (err: any) {
    results.errors.push(`Special: ${err.message}`);
  }

  revalidatePath(`/pollas/${pollaId}/fixture`);

  return {
    success: true,
    synced: results.synced,
    calculated: results.calculated,
    errors: results.errors.length > 0 ? results.errors : undefined,
  };
}
