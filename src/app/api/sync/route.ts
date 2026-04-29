import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLiveFixtures, getFixturesByIds, getFixtures } from '@/services/api-football';
import { calculateMatchPoints, updateTournamentSpecialResults, calculateSpecialPoints } from '@/lib/sync/calculate-points';
import { getSetting } from '@/lib/settings';

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
    .select('id, status')
    .single() as any;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const results = {
    synced: 0,
    calculated: 0,
    fixtureSyncs: 0,
    errors: [] as string[],
  };

  // ─────────────────────────────────────────
  // 1. Leer estado actual de la BD
  // ─────────────────────────────────────────

  // Partidos que estaban en vivo en el ciclo anterior (para detectar los que terminaron)
  const { data: previousLiveMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, tournament_id')
    .in('status', ['1H', 'HT', '2H', 'ET', 'P']);

  // Partidos NS con fecha pasada (overdue)
  const { data: overdueMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at, tournament_id')
    .eq('status', 'NS')
    .lt('scheduled_at', now);

  // Partidos terminados sin puntos calculados
  const { data: finishedMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at, points_calculated, tournament_id')
    .in('status', ['FT', 'AFT'])
    .eq('points_calculated', false);

  const toCalculate: string[] = (finishedMatches || []).map((m) => m.id);
  const allTournamentIds = new Set<string>();

  // ─────────────────────────────────────────
  // 2. Consultar API-Football: live=all
  // ─────────────────────────────────────────
  // Un solo request trae TODOS los partidos en vivo del mundo.

  let liveApiFixtures: any[] = [];
  try {
    const liveData = await getLiveFixtures(0); // 0 = all leagues
    liveApiFixtures = liveData.response || [];
  } catch (err: any) {
    results.errors.push(`live=all error: ${err.message}`);
  }

  // Mapear los fixtures de la API por api_football_id para lookup rápido
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
    if (!apiFixture) continue; // Ya no está en vivo (lo manejamos en paso 4)

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
  // Si un partido estaba en vivo antes y ya no aparece en live=all,
  // probablemente terminó (FT), se pospuso (PST) o canceló (CANC).

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
  // 6. Calcular puntos de partidos terminados
  // ─────────────────────────────────────────

  const uniqueToCalculate = Array.from(new Set(toCalculate));
  for (const matchId of uniqueToCalculate) {
    try {
      const calcResult = await calculateMatchPoints(matchId);
      if ('processed' in calcResult) {
        results.calculated++;
      }
    } catch (err: any) {
      results.errors.push(`Calculate ${matchId}: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────
  // 7. Calcular predicciones especiales
  // ─────────────────────────────────────────

  for (const tournamentId of Array.from(allTournamentIds)) {
    try {
      await updateTournamentSpecialResults(tournamentId);
    } catch (err: any) {
      results.errors.push(`Special results ${tournamentId}: ${err.message}`);
    }
  }

  const affectedPollas = new Set<string>();
  for (const matchId of uniqueToCalculate) {
    const match = [
      ...(previousLiveMatches || []),
      ...(overdueMatches || []),
      ...(finishedMatches || []),
    ].find((m) => m.id === matchId);
    if (match?.tournament_id) {
      const { data: pollas } = await admin
        .from('pollas')
        .select('id')
        .eq('tournament_id', match.tournament_id)
        .in('status', ['active', 'finished']);
      for (const p of pollas || []) affectedPollas.add(p.id);
    }
  }

  let specialCalculated = 0;
  for (const pollaId of Array.from(affectedPollas)) {
    try {
      const specialResult = await calculateSpecialPoints(pollaId);
      if ('processed' in specialResult && (specialResult.processed ?? 0) > 0) {
        specialCalculated++;
      }
    } catch (err: any) {
      results.errors.push(`Special points ${pollaId}: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────
  // 8. Sincronización automática de fixtures nuevos (cada 6 horas)
  // ─────────────────────────────────────────

  const syncIntervalHours = (await getSetting<{ value: number }>('cron_fixture_sync_interval_hours', { value: 6 }))?.value ?? 6;
  const syncIntervalMs = syncIntervalHours * 60 * 60 * 1000;
  const lastSyncThreshold = new Date(Date.now() - syncIntervalMs).toISOString();

  const { data: tournamentsToSync } = await admin
    .from('tournaments')
    .select('id, api_football_id, season, last_fixture_sync_at')
    .eq('status', 'ongoing')
    .or(`last_fixture_sync_at.is.null,last_fixture_sync_at.lt.${lastSyncThreshold}`);

  // También incluir torneos de pollas activas que no tengan status 'finished'
  const { data: activeTournaments } = await admin
    .from('pollas')
    .select('tournament_id')
    .in('status', ['active', 'open', 'draft'])
    .not('tournament_id', 'is', null);

  const tournamentIdsToSync = new Set<string>();
  for (const t of tournamentsToSync || []) {
    if (t.id) tournamentIdsToSync.add(t.id);
  }
  for (const p of activeTournaments || []) {
    if (p.tournament_id) tournamentIdsToSync.add(p.tournament_id);
  }

  for (const tournamentId of Array.from(tournamentIdsToSync)) {
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id, api_football_id, season')
      .eq('id', tournamentId)
      .single();

    if (!tournament?.api_football_id) continue;

    try {
      const apiData = await getFixtures(
        tournament.api_football_id,
        parseInt(tournament.season, 10) || 2026
      );
      const fixtures = apiData.response || [];

      if (fixtures.length === 0) continue;

      // Consultar partidos existentes para no duplicar
      const { data: existingMatches } = await admin
        .from('matches')
        .select('api_football_id')
        .eq('tournament_id', tournamentId);

      const existingApiIds = new Set(
        (existingMatches || [])
          .map((m) => m.api_football_id)
          .filter((id): id is number => id !== null)
      );

      const newFixtures = fixtures.filter(
        (f: any) => f.fixture?.id && !existingApiIds.has(f.fixture.id)
      );

      if (newFixtures.length === 0) {
        await admin
          .from('tournaments')
          .update({ last_fixture_sync_at: now })
          .eq('id', tournamentId);
        continue;
      }

      // Batch insert de equipos nuevos
      const teamMap = new Map<number, { id: number; name: string; logo: string; code: string }>();
      for (const f of newFixtures) {
        const ht = f.teams?.home;
        const at = f.teams?.away;
        if (ht?.id) teamMap.set(ht.id, ht);
        if (at?.id) teamMap.set(at.id, at);
      }
      const teamsList = Array.from(teamMap.values());

      const teamApiIds = teamsList.map((t) => t.id);
      const { data: existingTeams } = await admin
        .from('teams')
        .select('id, api_football_id')
        .in('api_football_id', teamApiIds);

      const existingTeamMap = new Map<number, string>();
      for (const t of existingTeams || []) {
        if (t.api_football_id) existingTeamMap.set(t.api_football_id, t.id);
      }

      const teamsToInsert = teamsList
        .filter((t) => !existingTeamMap.has(t.id))
        .map((t) => ({
          api_football_id: t.id,
          name: t.name,
          logo_url: t.logo,
          code: t.code,
        }));

      if (teamsToInsert.length > 0) {
        const { data: insertedTeams } = await admin
          .from('teams')
          .insert(teamsToInsert)
          .select('id, api_football_id');
        for (const t of insertedTeams || []) {
          if (t.api_football_id) existingTeamMap.set(t.api_football_id, t.id);
        }
      }

      const matchesToInsert = newFixtures.map((f: any) => {
        const apiStatus = f.fixture?.status?.short;
        const isFinished = apiStatus === 'FT' || apiStatus === 'AFT';
        return {
          tournament_id: tournamentId,
          api_football_id: f.fixture?.id ?? null,
          home_team_id: existingTeamMap.get(f.teams?.home?.id) ?? null,
          away_team_id: existingTeamMap.get(f.teams?.away?.id) ?? null,
          home_goals: isFinished ? f.goals?.home ?? null : null,
          away_goals: isFinished ? f.goals?.away ?? null : null,
          home_penalty_goals: isFinished ? f.score?.penalty?.home ?? null : null,
          away_penalty_goals: isFinished ? f.score?.penalty?.away ?? null : null,
          status: apiStatus || 'NS',
          round: f.league?.round || 'Fase de grupos',
          scheduled_at: f.fixture?.date,
          venue: f.fixture?.venue?.name || null,
        };
      });

      await admin.from('matches').insert(matchesToInsert);

      await admin
        .from('tournaments')
        .update({ last_fixture_sync_at: now })
        .eq('id', tournamentId);

      results.fixtureSyncs += matchesToInsert.length;
    } catch (err: any) {
      results.errors.push(`Fixture sync tournament ${tournamentId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    synced: results.synced,
    calculated: results.calculated,
    fixture_syncs: results.fixtureSyncs,
    special_calculated: specialCalculated,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
