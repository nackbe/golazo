import { createAdminClient } from '@/lib/supabase/admin';

let createdPollaIds: string[] = [];
let createdTournamentIds: string[] = [];
let createdMatchIds: string[] = [];

/**
 * Crea una polla de test mínima con un torneo y un admin.
 * Registra IDs para limpieza posterior.
 */
export async function createTestPolla(overrides?: { name?: string; point_system?: object }) {
  const admin = createAdminClient();

  // Crear torneo de test
  const { data: tournament } = await admin
    .from('tournaments')
    .insert({
      name: '__TEST_TOURNAMENT__',
      season: '2024',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
    })
    .select('id')
    .single();

  if (!tournament) throw new Error('Failed to create test tournament');
  createdTournamentIds.push(tournament.id);

  // Buscar un user_id de test (el primer admin que encontremos, o crear uno)
  const { data: existingUser } = await admin.from('profiles').select('id').limit(1).single();

  if (!existingUser) throw new Error('No profiles found in DB. Need at least one user.');

  const { data: polla } = await admin
    .from('pollas')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      name: overrides?.name || '__TEST_POLL__',
      code: `TEST${Math.floor(Math.random() * 100000)}`,
      tournament_id: tournament.id,
      admin_id: existingUser.id,
      status: 'active' as const,
      point_system: (overrides?.point_system || {
        correct_result: 1, home_goals: 1, away_goals: 1,
        exact_score: 3, goal_difference: 1, total_goals: 1,
      }) as any,
      wildcards: [{ type: 'x2', quantity: 2 }, { type: 'x3', quantity: 1 }] as any,
      special_point_system: {
        champion: 10, finalist: 5, third_place: 3,
        least_goals_against: 5, worst_team: 4, top_scorer_team: 5,
      } as any,
      auto_random_prediction: false,
      admin_plays: true,
      auto_approve: true,
    })
    .select('id, admin_id')
    .single();

  if (!polla) throw new Error('Failed to create test polla');
  createdPollaIds.push(polla.id);

  // Insertar al admin como miembro aprobado
  await admin.from('polla_members').insert({
    polla_id: polla.id,
    user_id: polla.admin_id,
    alias: 'TestAdmin',
    status: 'approved',
  });

  return { pollaId: polla.id, userId: polla.admin_id, tournamentId: tournament.id };
}

/**
 * Crea partidos de test directamente en la tabla matches.
 * Bypassa API-Football por completo.
 */
export async function createTestMatches(
  tournamentId: string,
  matches: Array<{
    home_goals?: number | null;
    away_goals?: number | null;
    status?: string;
    scheduled_at?: string;
    round?: string;
  }>
) {
  const admin = createAdminClient();

  // Crear equipos de test
  const { data: homeTeam } = await admin.from('teams').insert({ name: 'Test Home FC', country: 'Testlandia' }).select('id').single();
  const { data: awayTeam } = await admin.from('teams').insert({ name: 'Test Away FC', country: 'Testlandia' }).select('id').single();

  if (!homeTeam || !awayTeam) throw new Error('Failed to create test teams');

  const rows = matches.map((m) => ({
    tournament_id: tournamentId,
    home_team_id: homeTeam.id,
    away_team_id: awayTeam.id,
    home_goals: m.home_goals ?? null,
    away_goals: m.away_goals ?? null,
    status: m.status ?? 'NS',
    scheduled_at: m.scheduled_at ?? new Date().toISOString(),
    round: m.round ?? 'Group Stage',
  }));

  const { data, error } = await admin.from('matches').insert(rows).select('id');
  if (error) throw new Error(`Failed to insert test matches: ${error.message}`);

  const ids = data?.map((d) => d.id) || [];
  createdMatchIds.push(...ids);
  return { matchIds: ids, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id };
}

/**
 * Inserta predicciones de test para un usuario en partidos específicos.
 */
export async function createTestPredictions(
  pollaId: string,
  userId: string,
  predictions: Array<{ match_id: string; home_goals: number; away_goals: number; wildcard_used?: 'x2' | 'x3' | null }>
) {
  const admin = createAdminClient();

  const rows = predictions.map((p) => ({
    polla_id: pollaId,
    user_id: userId,
    match_id: p.match_id,
    home_goals: p.home_goals,
    away_goals: p.away_goals,
    wildcard_used: p.wildcard_used ?? null,
  }));

  const { error } = await admin.from('predictions').insert(rows);
  if (error) throw new Error(`Failed to insert test predictions: ${error.message}`);
}

/**
 * Limpia TODOS los datos de test creados por este factory.
 * Se debe llamar en afterAll o afterEach.
 */
export async function cleanupAllTestData() {
  const admin = createAdminClient();

  for (const pollaId of createdPollaIds) {
    await admin.from('predictions').delete().eq('polla_id', pollaId);
    await admin.from('match_points').delete().eq('polla_id', pollaId);
    await admin.from('ranking_history').delete().eq('polla_id', pollaId);
    await admin.from('player_streaks').delete().eq('polla_id', pollaId);
    await admin.from('player_badges').delete().eq('polla_id', pollaId);
    await admin.from('special_predictions').delete().eq('polla_id', pollaId);
    await admin.from('polla_members').delete().eq('polla_id', pollaId);
    await admin.from('pollas').delete().eq('id', pollaId);
  }

  for (const matchId of createdMatchIds) {
    await admin.from('matches').delete().eq('id', matchId);
  }

  for (const tournamentId of createdTournamentIds) {
    await admin.from('matches').delete().eq('tournament_id', tournamentId);
    await admin.from('tournament_special_results').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  }

  // Limpiar equipos de test (por nombre)
  await admin.from('teams').delete().ilike('name', '%Test%');

  createdPollaIds = [];
  createdMatchIds = [];
  createdTournamentIds = [];
}
