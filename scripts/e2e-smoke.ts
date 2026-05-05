/**
 * E2E Smoke Test — scripts/e2e-smoke.ts
 *
 * Simula la vida completa de una polla sin Playwright ni API-Football.
 * Usa createAdminClient() directamente contra Supabase de producción.
 *
 * Ejecutar con:
 *   npx tsx scripts/e2e-smoke.ts
 *
 * Requiere: .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { calculateMatchPoints } from '../src/lib/sync/calculate-points';

// ─── setup ───────────────────────────────────────────────────────────────────

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
  failures.push(label);
}

function assert(condition: boolean, label: string, detail?: string) {
  condition ? ok(label) : fail(label, detail);
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

// ─── state ───────────────────────────────────────────────────────────────────

const createdPollaIds: string[] = [];
const createdTournamentIds: string[] = [];
const createdMatchIds: string[] = [];
const createdTeamIds: string[] = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getTwoUsers(): Promise<[string, string]> {
  const { data } = await admin.from('profiles').select('id').limit(2);
  if (!data || data.length < 2) {
    throw new Error('Se necesitan al menos 2 perfiles en la DB para correr este smoke test.');
  }
  return [data[0].id, data[1].id];
}

async function createSmokeTournament() {
  const { data } = await admin
    .from('tournaments')
    .insert({ name: '__SMOKE_TOURNAMENT__', season: '2024', start_date: '2024-01-01', end_date: '2024-12-31' })
    .select('id')
    .single();
  if (!data) throw new Error('No se pudo crear torneo de smoke test');
  createdTournamentIds.push(data.id);
  return data.id;
}

async function createSmokePolla(tournamentId: string, adminId: string, overrides?: object) {
  const { data } = await admin
    .from('pollas')
    .insert({
      name: '__SMOKE_POLLA__',
      code: `SMK${Math.floor(Math.random() * 100000)}`,
      tournament_id: tournamentId,
      admin_id: adminId,
      status: 'active',
      admin_plays: true,
      auto_approve: true,
      auto_random_prediction: false,
      point_system: { correct_result: 1, home_goals: 1, away_goals: 1, exact_score: 3, goal_difference: 1, total_goals: 1 },
      wildcards: [{ type: 'x2', quantity: 2 }, { type: 'x3', quantity: 1 }],
      special_point_system: { champion: 10, finalist: 5, third_place: 3, least_goals_against: 5, worst_team: 4, top_scorer_team: 5 },
      ...overrides,
    })
    .select('id')
    .single();
  if (!data) throw new Error('No se pudo crear polla de smoke test');
  createdPollaIds.push(data.id);
  return data.id;
}

async function addMember(pollaId: string, userId: string, alias: string) {
  await admin.from('polla_members').insert({ polla_id: pollaId, user_id: userId, alias, status: 'approved' });
}

async function createSmokeMatch(tournamentId: string, opts: {
  homeGoals?: number | null;
  awayGoals?: number | null;
  status?: string;
  scheduledAt?: string;
  round?: string;
}) {
  const { data: ht } = await admin.from('teams').insert({ name: '__Smoke Home FC__', country: 'Smokeland' }).select('id').single();
  const { data: at } = await admin.from('teams').insert({ name: '__Smoke Away FC__', country: 'Smokeland' }).select('id').single();
  if (!ht || !at) throw new Error('No se pudieron crear equipos de smoke test');
  createdTeamIds.push(ht.id, at.id);

  const { data } = await admin.from('matches').insert({
    tournament_id: tournamentId,
    home_team_id: ht.id,
    away_team_id: at.id,
    home_goals: opts.homeGoals ?? null,
    away_goals: opts.awayGoals ?? null,
    status: opts.status ?? 'NS',
    scheduled_at: opts.scheduledAt ?? new Date().toISOString(),
    round: opts.round ?? 'Group Stage',
  }).select('id').single();
  if (!data) throw new Error('No se pudo crear partido de smoke test');
  createdMatchIds.push(data.id);
  return data.id;
}

async function addPrediction(pollaId: string, userId: string, matchId: string, home: number, away: number, wildcard?: string) {
  await admin.from('predictions').insert({
    polla_id: pollaId, user_id: userId, match_id: matchId,
    home_goals: home, away_goals: away,
    wildcard_used: wildcard ?? null,
  });
}

async function setMatchResult(matchId: string, home: number, away: number, status = 'FT') {
  await admin.from('matches').update({ home_goals: home, away_goals: away, status }).eq('id', matchId);
}

async function getMatchPoints(pollaId: string, userId: string, matchId: string) {
  const { data } = await admin
    .from('match_points').select('points')
    .eq('polla_id', pollaId).eq('user_id', userId).eq('match_id', matchId)
    .single();
  return data?.points ?? null;
}

async function getMemberPoints(pollaId: string, userId: string) {
  const { data } = await admin
    .from('polla_members').select('total_points')
    .eq('polla_id', pollaId).eq('user_id', userId)
    .single();
  return data?.total_points ?? null;
}

async function getStreak(pollaId: string, userId: string) {
  const { data } = await admin
    .from('player_streaks').select('*')
    .eq('polla_id', pollaId).eq('user_id', userId)
    .single();
  return data;
}

async function getRankingHistory(pollaId: string, userId: string) {
  const { data } = await admin
    .from('ranking_history').select('position, total_points')
    .eq('polla_id', pollaId).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).single();
  return data;
}

// ─── cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  for (const pollaId of createdPollaIds) {
    await admin.from('player_badges').delete().eq('polla_id', pollaId);
    await admin.from('player_streaks').delete().eq('polla_id', pollaId);
    await admin.from('ranking_history').delete().eq('polla_id', pollaId);
    await admin.from('match_points').delete().eq('polla_id', pollaId);
    await admin.from('special_predictions').delete().eq('polla_id', pollaId);
    await admin.from('predictions').delete().eq('polla_id', pollaId);
    await admin.from('polla_members').delete().eq('polla_id', pollaId);
    await admin.from('pollas').delete().eq('id', pollaId);
  }
  for (const matchId of createdMatchIds) {
    await admin.from('matches').delete().eq('id', matchId);
  }
  for (const tournamentId of createdTournamentIds) {
    await admin.from('tournament_special_results').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  }
  for (const teamId of createdTeamIds) {
    await admin.from('teams').delete().eq('id', teamId);
  }
}

// ─── tests ───────────────────────────────────────────────────────────────────

async function runScenario1_BasicPoints(userA: string, userB: string) {
  section('Escenario 1 — Puntos básicos (exacto vs incorrecto)');

  const tournamentId = await createSmokeTournament();
  const pollaId = await createSmokePolla(tournamentId, userA);
  await addMember(pollaId, userA, 'UserA');
  await addMember(pollaId, userB, 'UserB');

  const matchId = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-06-01T18:00:00Z' });

  await addPrediction(pollaId, userA, matchId, 2, 1); // exacto
  await addPrediction(pollaId, userB, matchId, 0, 0); // incorrecto (predice empate, es victoria local)

  await setMatchResult(matchId, 2, 1);
  await calculateMatchPoints(matchId);

  const pointsA = await getMatchPoints(pollaId, userA, matchId);
  const pointsB = await getMatchPoints(pollaId, userB, matchId);

  // 2-1: correct_result(1) + home_goals(1) + away_goals(1) + exact_score(3) + goal_difference(1) + total_goals(1) = 8
  assert(pointsA === 8, 'UserA: marcador exacto = 8 puntos', `got ${pointsA}`);
  // 0-0 vs 2-1: away_goals match (0=1? no. home_goals: 0≠2, away_goals: 0≠1) → solo correct_result? No (predijo empate, gana local) → 0
  // Actually: result wrong (predijo draw, real home win) → correct_result=0; home_goals: pred=0, real=2 → 0; away_goals: pred=0, real=1 → 0 → total 0
  assert(pointsB === 0, 'UserB: predicción incorrecta = 0 puntos', `got ${pointsB}`);

  const totalA = await getMemberPoints(pollaId, userA);
  assert(totalA === 8, 'UserA total_points actualizado = 8', `got ${totalA}`);

  const rh = await getRankingHistory(pollaId, userA);
  assert(rh !== null, 'ranking_history registrado para UserA');
  assert(rh?.position === 1, 'UserA es primero en ranking_history', `pos=${rh?.position}`);

  const streak = await getStreak(pollaId, userA);
  assert(streak !== null, 'player_streaks registrado para UserA');
  assert(streak?.current_exact_streak === 1, 'UserA: current_exact_streak = 1', `got ${streak?.current_exact_streak}`);
  assert(streak?.current_result_streak === 1, 'UserA: current_result_streak = 1', `got ${streak?.current_result_streak}`);

  return { pollaId, matchId, tournamentId };
}

async function runScenario2_Idempotency(pollaId: string, matchId: string, userA: string) {
  section('Escenario 2 — Idempotencia (calcular dos veces no duplica puntos)');

  await calculateMatchPoints(matchId);
  await calculateMatchPoints(matchId);

  const pointsA = await getMatchPoints(pollaId, userA, matchId);
  assert(pointsA === 8, 'Puntos de UserA siguen siendo 8 después de recalcular 2 veces', `got ${pointsA}`);

  const totalA = await getMemberPoints(pollaId, userA);
  assert(totalA === 8, 'total_points no se duplicó', `got ${totalA}`);
}

async function runScenario3_Wildcard(userA: string) {
  section('Escenario 3 — Comodín x2 multiplica puntos');

  const tournamentId = await createSmokeTournament();
  const pollaId = await createSmokePolla(tournamentId, userA);
  await addMember(pollaId, userA, 'UserA_WC');

  const matchId = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-07-01T18:00:00Z' });
  await addPrediction(pollaId, userA, matchId, 2, 1, 'x2'); // exacto con comodín x2

  await setMatchResult(matchId, 2, 1);
  await calculateMatchPoints(matchId);

  const points = await getMatchPoints(pollaId, userA, matchId);
  assert(points === 16, 'Exacto con x2 = 16 puntos (8 × 2)', `got ${points}`);
}

async function runScenario4_CronFlow(userA: string) {
  section('Escenario 4 — Flujo cron: partido "desaparece" de live y termina');

  const tournamentId = await createSmokeTournament();
  const pollaId = await createSmokePolla(tournamentId, userA);
  await addMember(pollaId, userA, 'UserA_Cron');

  // Partido simulado "en vivo" (1H) con goals parciales
  const matchId = await createSmokeMatch(tournamentId, {
    status: '1H',
    homeGoals: 1,
    awayGoals: 0,
    scheduledAt: '2024-08-01T18:00:00Z',
  });

  await addPrediction(pollaId, userA, matchId, 2, 1);

  // Simular que el partido "desapareció" del endpoint live=all y terminó 2-1
  await setMatchResult(matchId, 2, 1, 'FT');
  await calculateMatchPoints(matchId);

  const points = await getMatchPoints(pollaId, userA, matchId);
  // resultado correcto (home win = home win), exacto (2-1=2-1) → 8 pts
  assert(points === 8, 'Cron flow: puntos calculados correctamente después de FT', `got ${points}`);

  const match = await admin.from('matches').select('points_calculated').eq('id', matchId).single();
  assert(match.data?.points_calculated === true, 'points_calculated = true después del cron flow');
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏁 Golazo E2E Smoke Test\n');
  console.log('Conectando a Supabase...');

  let userA: string, userB: string;
  try {
    [userA, userB] = await getTwoUsers();
    console.log(`Usuarios: A=${userA.slice(0, 8)}... B=${userB.slice(0, 8)}...`);
  } catch (e: any) {
    console.error(`\n💥 Setup falló: ${e.message}`);
    process.exit(1);
  }

  try {
    const s1 = await runScenario1_BasicPoints(userA, userB);
    await runScenario2_Idempotency(s1.pollaId, s1.matchId, userA);
    await runScenario3_Wildcard(userA);
    await runScenario4_CronFlow(userA);
  } catch (e: any) {
    console.error(`\n💥 Error inesperado: ${e.message}`);
    failed++;
    failures.push(`Error no manejado: ${e.message}`);
  } finally {
    section('Limpiando datos de test...');
    await cleanup();
    console.log('  🧹 Listo.\n');
  }

  console.log('─'.repeat(50));
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  if (failures.length > 0) {
    console.log('\nFallos:');
    failures.forEach((f) => console.log(`  • ${f}`));
  }
  console.log(failed === 0 ? '\n🎉 Todo OK' : '\n💥 Hay fallos');
  process.exit(failed > 0 ? 1 : 0);
}

main();
