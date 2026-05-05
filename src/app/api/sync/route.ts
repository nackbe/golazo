import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLiveFixtures, getFixturesByIds } from '@/services/api-football';
import { batchCalculateMatchPoints, updateTournamentSpecialResults, calculateSpecialPoints } from '@/lib/sync/calculate-points';
import { generateRandomPredictionsForMatch } from '@/lib/sync/random-predictions';

export const runtime = 'edge';
export const maxDuration = 30;

const VALID_STATUS_PROGRESSION = [
  'NS', '1H', 'HT', '2H', 'ET', 'P', 'FT', 'AFT', 'CANC',
];

function statusIndex(status: string): number {
  return VALID_STATUS_PROGRESSION.indexOf(status);
}

function canUpdate(from: string, to: string): boolean {
  if (from === 'CANC' || from === 'FT' || from === 'AFT') return false;
  const fromIdx = statusIndex(from);
  const toIdx = statusIndex(to);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx >= fromIdx;
}

function updateMatchFromFixture(
  admin: ReturnType<typeof createAdminClient>,
  matchId: string,
  fixture: any
): Promise<{ error: any }> {
  const newStatus = fixture.fixture?.status?.short;
  const homeGoals = fixture.goals?.home ?? null;
  const awayGoals = fixture.goals?.away ?? null;
  const homePenaltyGoals = fixture.score?.penalty?.home ?? null;
  const awayPenaltyGoals = fixture.score?.penalty?.away ?? null;

  return admin
    .from('matches')
    .update({
      status: newStatus,
      home_goals: homeGoals,
      away_goals: awayGoals,
      home_penalty_goals: homePenaltyGoals,
      away_penalty_goals: awayPenaltyGoals,
    })
    .eq('id', matchId)
    .then(({ error }) => ({ error })) as any;
}

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return authHeader === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

async function runSync() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const results = {
    synced: 0,
    calculated: 0,
    errors: [] as string[],
  };

  // ─────────────────────────────────────────
  // 1. Leer estado actual de la BD (en paralelo)
  // ─────────────────────────────────────────

  const [previousLiveMatchesRes, overdueMatchesRes] = await Promise.all([
    admin
      .from('matches')
      .select('id, api_football_id, status, tournament_id')
      .in('status', ['1H', 'HT', '2H', 'ET', 'P']),
    admin
      .from('matches')
      .select('id, api_football_id, status, scheduled_at, tournament_id')
      .eq('status', 'NS')
      .lt('scheduled_at', now),
  ]);

  const previousLiveMatches = previousLiveMatchesRes.data;
  const overdueMatches = overdueMatchesRes.data;

  const toCalculate: string[] = [];
  const allTournamentIds = new Set<string>();

  // ─────────────────────────────────────────
  // 2. Consultar API-Football: live=all
  // ─────────────────────────────────────────

  let liveApiFixtures: any[] = [];
  try {
    const liveData = await getLiveFixtures(0);
    liveApiFixtures = liveData.response || [];
  } catch (err: any) {
    results.errors.push(`live=all error: ${err.message}`);
  }

  const liveApiMap = new Map<number, any>();
  for (const f of liveApiFixtures) {
    const apiId = f.fixture?.id;
    if (apiId) liveApiMap.set(apiId, f);
  }

  // ─────────────────────────────────────────
  // 3. Actualizar partidos que siguen en vivo
  // ─────────────────────────────────────────

  for (const match of previousLiveMatches || []) {
    const apiFixture = liveApiMap.get(match.api_football_id as number);
    if (!apiFixture) continue;

    const newStatus = apiFixture.fixture?.status?.short;
    if (!canUpdate(match.status || 'NS', newStatus)) continue;

    const { error: updateError } = await updateMatchFromFixture(admin, match.id, apiFixture);
    if (updateError) {
      results.errors.push(`Update live match ${match.id}: ${updateError.message}`);
    } else {
      results.synced++;
      if (newStatus === 'FT' || newStatus === 'AFT') {
        toCalculate.push(match.id);
      }
      if (match.tournament_id) allTournamentIds.add(match.tournament_id);
    }
  }

  // ─────────────────────────────────────────
  // 4. Detectar partidos que dejaron de estar en vivo
  // ─────────────────────────────────────────

  const disappearedLiveIds = (previousLiveMatches || [])
    .filter((m) => m.api_football_id && !liveApiMap.has(m.api_football_id as number))
    .map((m) => m.api_football_id as number);

  if (disappearedLiveIds.length > 0) {
    try {
      const apiData = await getFixturesByIds(disappearedLiveIds);

      for (const fixture of apiData.response || []) {
        const apiId = fixture.fixture?.id;
        const match = (previousLiveMatches || []).find((m) => m.api_football_id === apiId);
        if (!match) continue;

        const newStatus = fixture.fixture?.status?.short;
        if (!canUpdate(match.status || 'NS', newStatus)) continue;

        const { error: updateError } = await updateMatchFromFixture(admin, match.id, fixture);
        if (updateError) {
          results.errors.push(`Update disappeared match ${match.id}: ${updateError.message}`);
        } else {
          results.synced++;
          if (newStatus === 'FT' || newStatus === 'AFT') {
            toCalculate.push(match.id);
          }
          if (match.tournament_id) allTournamentIds.add(match.tournament_id);
        }
      }
    } catch (err: any) {
      results.errors.push(`Disappeared fixtures error: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────
  // 5. Partidos NS vencidos (overdue)
  // ─────────────────────────────────────────

  const overdueIds = (overdueMatches || [])
    .map((m) => m.api_football_id)
    .filter((id): id is number => id !== null);

  if (overdueIds.length > 0) {
    try {
      const apiData = await getFixturesByIds(overdueIds);

      for (const fixture of apiData.response || []) {
        const apiId = fixture.fixture?.id;
        const match = (overdueMatches || []).find((m) => m.api_football_id === apiId);
        if (!match) continue;

        const newStatus = fixture.fixture?.status?.short;
        if (!canUpdate(match.status || 'NS', newStatus)) continue;

        const { error: updateError } = await updateMatchFromFixture(admin, match.id, fixture);
        if (updateError) {
          results.errors.push(`Update overdue match ${match.id}: ${updateError.message}`);
        } else {
          results.synced++;
          if (newStatus === 'FT' || newStatus === 'AFT') {
            toCalculate.push(match.id);
          }
          if (match.tournament_id) allTournamentIds.add(match.tournament_id);
        }
      }
    } catch (err: any) {
      results.errors.push(`Overdue fixtures error: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────
  // 5b. Generar predicciones aleatorias (en paralelo)
  // ─────────────────────────────────────────

  const randomPredPromises: Promise<unknown>[] = [];
  for (const match of overdueMatches || []) {
    if (!match.tournament_id) continue;

    const { data: pollasWithRandom } = await admin
      .from('pollas')
      .select('id')
      .eq('tournament_id', match.tournament_id)
      .eq('auto_random_prediction', true)
      .in('status', ['active', 'open']);

    for (const polla of pollasWithRandom || []) {
      randomPredPromises.push(
        generateRandomPredictionsForMatch(match.id, polla.id).catch((err: any) => {
          results.errors.push(`Random predictions ${match.id}/${polla.id}: ${err.message}`);
        })
      );
    }
  }
  await Promise.all(randomPredPromises);

  // ─────────────────────────────────────────
  // 6. Calcular puntos de partidos terminados (BATCH por polla)
  // ─────────────────────────────────────────
  // En vez de calculateMatchPoints uno por uno, usamos batchCalculateMatchPoints
  // que procesa TODOS los partidos pendientes de una polla en una sola pasada.

  const affectedPollaIds = new Set<string>();

  // Encontrar pollas afectadas por los torneos con cambios
  for (const tournamentId of Array.from(allTournamentIds)) {
    const { data: pollas } = await admin
      .from('pollas')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('status', ['active', 'finished']);
    for (const p of pollas || []) if (p.id) affectedPollaIds.add(p.id);
  }

  // También buscar pollas que tengan cualquier partido terminado sin calcular
  // (por si quedó alguno de ejecuciones previas)
  const { data: pendingPollas } = await admin
    .from('matches')
    .select('tournament_id')
    .in('status', ['FT', 'AFT'])
    .eq('points_calculated', false);

  const pendingTournamentIds = new Set(
    (pendingPollas || []).map((m) => m.tournament_id).filter(Boolean) as string[]
  );

  for (const tournamentId of Array.from(pendingTournamentIds)) {
    const { data: pollas } = await admin
      .from('pollas')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('status', ['active', 'finished']);
    for (const p of pollas || []) if (p.id) affectedPollaIds.add(p.id);
  }

  const batchPromises: Promise<void>[] = [];
  for (const pollaId of Array.from(affectedPollaIds)) {
    batchPromises.push(
      batchCalculateMatchPoints(pollaId).then((res) => {
        if ('processed' in res && typeof res.processed === 'number') {
          results.calculated += res.processed;
        }
      }).catch((err: any) => {
        results.errors.push(`Batch calculate ${pollaId}: ${err.message}`);
      })
    );
  }
  await Promise.all(batchPromises);

  // ─────────────────────────────────────────
  // 7. Calcular predicciones especiales
  // ─────────────────────────────────────────

  const specialPromises: Promise<void>[] = [];
  for (const tournamentId of Array.from(allTournamentIds)) {
    specialPromises.push(
      updateTournamentSpecialResults(tournamentId).catch((err: any) => {
        results.errors.push(`Special results ${tournamentId}: ${err.message}`);
      })
    );
  }
  await Promise.all(specialPromises);

  let specialCalculated = 0;
  for (const pollaId of Array.from(affectedPollaIds)) {
    try {
      const specialResult = await calculateSpecialPoints(pollaId);
      if ('processed' in specialResult && (specialResult.processed ?? 0) > 0) {
        specialCalculated++;
      }
    } catch (err: any) {
      results.errors.push(`Special points ${pollaId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    synced: results.synced,
    calculated: results.calculated,
    special_calculated: specialCalculated,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
