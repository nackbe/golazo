import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFixtures } from '@/services/api-football';
import { getSetting } from '@/lib/settings';
import { isMatchTerminal } from '@/lib/match-status';

export const runtime = 'edge';
export const maxDuration = 30;

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return authHeader === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runFixtureSync();
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runFixtureSync();
}

async function runFixtureSync() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const results = {
    fixtureSyncs: 0,
    tournamentsChecked: 0,
    errors: [] as string[],
  };

  const syncIntervalHours = (await getSetting<{ value: number }>('cron_fixture_sync_interval_hours', { value: 6 }))?.value ?? 6;
  const syncIntervalMs = syncIntervalHours * 60 * 60 * 1000;
  const lastSyncThreshold = new Date(Date.now() - syncIntervalMs).toISOString();

  const { data: tournamentsToSync } = await admin
    .from('tournaments')
    .select('id, api_football_id, season, last_fixture_sync_at')
    .eq('status', 'ongoing')
    .or(`last_fixture_sync_at.is.null,last_fixture_sync_at.lt.${lastSyncThreshold}`);

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

  results.tournamentsChecked = tournamentIdsToSync.size;

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

      if (fixtures.length === 0) {
        await admin
          .from('tournaments')
          .update({ last_fixture_sync_at: now })
          .eq('id', tournamentId);
        continue;
      }

      const { data: existingMatches } = await admin
        .from('matches')
        .select('id, api_football_id, status, scheduled_at')
        .eq('tournament_id', tournamentId);

      const existingByApiId = new Map(
        (existingMatches || [])
          .filter((m): m is typeof m & { api_football_id: number } => m.api_football_id !== null)
          .map((m) => [m.api_football_id, m])
      );

      const newFixtures = fixtures.filter(
        (f: any) => f.fixture?.id && !existingByApiId.has(f.fixture.id)
      );

      // CRÍTICO: detectar partidos NS cuya fecha cambió (reagendamiento de API-Football).
      // Sin esto, el deadline de apuesta se calcula contra la hora vieja y los jugadores
      // podrían predecir cuando el partido ya empezó.
      const TERMINAL_STATUSES = new Set(['FT', 'AFT', 'CANC', 'ABD', 'AWD', 'WO']);
      const fixturesToReschedule = fixtures.filter((f: any) => {
        if (!f.fixture?.id || !f.fixture?.date) return false;
        const existing = existingByApiId.get(f.fixture.id);
        if (!existing) return false;
        if (TERMINAL_STATUSES.has(existing.status || '')) return false;
        return f.fixture.date !== existing.scheduled_at;
      });

      // Aplicar updates de scheduled_at (no espera que sea masivo, suele ser pocos por sync)
      for (const f of fixturesToReschedule) {
        const existing = existingByApiId.get(f.fixture.id)!;
        await admin
          .from('matches')
          .update({ scheduled_at: f.fixture.date, venue: f.fixture?.venue?.name || null })
          .eq('id', existing.id);
      }
      results.fixtureSyncs += fixturesToReschedule.length;

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
        const isFinished = isMatchTerminal(apiStatus);
        // score.fulltime = marcador a 90 min (usado para scoring).
        // f.goals incluye ET para AET → usar fulltime cuando esté.
        const ftHome = f.score?.fulltime?.home;
        const ftAway = f.score?.fulltime?.away;
        return {
          tournament_id: tournamentId,
          api_football_id: f.fixture?.id ?? null,
          home_team_id: existingTeamMap.get(f.teams?.home?.id) ?? null,
          away_team_id: existingTeamMap.get(f.teams?.away?.id) ?? null,
          home_goals: isFinished ? (ftHome ?? f.goals?.home ?? null) : null,
          away_goals: isFinished ? (ftAway ?? f.goals?.away ?? null) : null,
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
    fixture_syncs: results.fixtureSyncs,
    tournaments_checked: results.tournamentsChecked,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
