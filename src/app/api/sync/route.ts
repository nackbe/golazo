import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMINAL_MATCH_STATUSES, isMatchTerminal } from '@/lib/match-status';
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
  // No actualizar si el match ya terminó (FT/AFT/AET/PEN) o fue cancelado.
  if (from === 'CANC' || isMatchTerminal(from)) return false;
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
  // scheduled_at se actualiza para mantener consistencia (e.g. reagendamientos
  // detectados al consultar live=all). venue también puede cambiar.
  const scheduledAt = fixture.fixture?.date ?? null;
  const venue = fixture.fixture?.venue?.name ?? null;

  const payload: Record<string, any> = {
    status: newStatus,
    home_goals: homeGoals,
    away_goals: awayGoals,
    home_penalty_goals: homePenaltyGoals,
    away_penalty_goals: awayPenaltyGoals,
  };
  if (scheduledAt) payload.scheduled_at = scheduledAt;
  if (venue) payload.venue = venue;

  return (admin.from('matches') as any)
    .update(payload)
    .eq('id', matchId)
    .then(({ error }: { error: any }) => ({ error }));
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

  // Status "fantasma": INT (Interrupted), SUSP (Suspended), BT (Break Time).
  // Si el match se reanuda y termina FT, API-Football lo deja fuera de
  // live=all → el cron debe incluirlos en previousLiveMatches para
  // detectar via 'disappeared' path y consultar getFixturesByIds.
  // Sin esto, el match queda atascado eternamente (bug France-Iraq 2026-06-22).
  const [previousLiveMatchesRes, overdueMatchesRes] = await Promise.all([
    admin
      .from('matches')
      .select('id, api_football_id, status, tournament_id')
      .in('status', ['1H', 'HT', '2H', 'ET', 'P', 'BT', 'INT', 'SUSP']),
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
      if (isMatchTerminal(newStatus)) {
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
          if (isMatchTerminal(newStatus)) {
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
          if (isMatchTerminal(newStatus)) {
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
      .eq('tournament_id', tournamentId);
    for (const p of pollas || []) if (p.id) affectedPollaIds.add(p.id);
  }

  // También buscar pollas que tengan cualquier partido terminado sin calcular
  // (por si quedó alguno de ejecuciones previas)
  const { data: pendingPollas } = await admin
    .from('matches')
    .select('tournament_id')
    .in('status', TERMINAL_MATCH_STATUSES as unknown as string[])
    .eq('points_calculated', false);

  const pendingTournamentIds = new Set(
    (pendingPollas || []).map((m) => m.tournament_id).filter(Boolean) as string[]
  );

  for (const tournamentId of Array.from(pendingTournamentIds)) {
    const { data: pollas } = await admin
      .from('pollas')
      .select('id')
      .eq('tournament_id', tournamentId);
    for (const p of pollas || []) if (p.id) affectedPollaIds.add(p.id);
  }

  // FIX RAÍZ: orphan detection. Si una polla tiene predicciones en un match
  // terminal pero NO tiene match_points para ese par (polla, match), agregar
  // al set. Independiente del flag global → recupera cualquier polla que
  // haya quedado fuera por timeouts o race conditions previos.
  //
  // PostgREST tope ~1000 rows por SELECT (no respeta range hasta 9999).
  // Paginamos para no perder filas (predictions = 3500+, match_points = 3300+).
  async function fetchAllRows<T>(
    builder: () => any,
    pageSize = 1000
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await builder().range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  try {
    const [terminalRows, predRows, mpRows] = await Promise.all([
      fetchAllRows<{ id: string }>(() =>
        admin.from('matches').select('id').in('status', TERMINAL_MATCH_STATUSES as unknown as string[])
      ),
      fetchAllRows<{ polla_id: string; match_id: string }>(() =>
        admin.from('predictions').select('polla_id, match_id')
      ),
      fetchAllRows<{ polla_id: string; match_id: string }>(() =>
        admin.from('match_points').select('polla_id, match_id')
      ),
    ]);

    const terminalIds = new Set(terminalRows.map((m) => m.id));
    const doneKeys = new Set(mpRows.map((r) => `${r.polla_id}|${r.match_id}`));

    for (const p of predRows) {
      if (!terminalIds.has(p.match_id)) continue;
      const key = `${p.polla_id}|${p.match_id}`;
      if (doneKeys.has(key)) continue;
      affectedPollaIds.add(p.polla_id);
    }
  } catch (err: any) {
    results.errors.push(`Orphan detection: ${err.message}`);
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
