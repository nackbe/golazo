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

  // Nueva regla: exacto = solo exact_score(3 default), no acumula
  assert(pointsA === 3, 'UserA: marcador exacto = 3 puntos (solo exact_score)', `got ${pointsA}`);
  // 0-0 vs 2-1: predijo empate, gana local → resultado incorrecto, ningún match → 0
  assert(pointsB === 0, 'UserB: predicción incorrecta = 0 puntos', `got ${pointsB}`);

  const totalA = await getMemberPoints(pollaId, userA);
  assert(totalA === 3, 'UserA total_points actualizado = 3', `got ${totalA}`);

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
  assert(pointsA === 3, 'Puntos de UserA siguen siendo 3 después de recalcular 2 veces', `got ${pointsA}`);

  const totalA = await getMemberPoints(pollaId, userA);
  assert(totalA === 3, 'total_points no se duplicó', `got ${totalA}`);
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
  assert(points === 6, 'Exacto con x2 = 6 puntos (exact_score 3 × 2)', `got ${points}`);
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
  // Nueva regla: exacto = solo exact_score(3)
  assert(points === 3, 'Cron flow: puntos calculados correctamente después de FT', `got ${points}`);

  const match = await admin.from('matches').select('points_calculated').eq('id', matchId).single();
  assert(match.data?.points_calculated === true, 'points_calculated = true después del cron flow');
}

async function runScenario5_X3Wildcard(userA: string) {
  section('Escenario 5 — Comodín x3 triplica puntos');

  const tournamentId = await createSmokeTournament();
  const pollaId = await createSmokePolla(tournamentId, userA);
  await addMember(pollaId, userA, 'UserA_X3');

  const matchId = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-09-01T18:00:00Z' });
  await addPrediction(pollaId, userA, matchId, 1, 0, 'x3'); // exacto con x3

  await setMatchResult(matchId, 1, 0);
  await calculateMatchPoints(matchId);

  const points = await getMatchPoints(pollaId, userA, matchId);
  // Nueva regla: exacto = exact_score(3) × 3 = 9
  assert(points === 9, 'Exacto con x3 = 9 puntos (exact_score 3 × 3)', `got ${points}`);
}

async function runScenario6_WildcardOnWrong(userA: string) {
  section('Escenario 6 — Comodín en predicción incorrecta = 0 puntos');

  const tournamentId = await createSmokeTournament();
  const pollaId = await createSmokePolla(tournamentId, userA);
  await addMember(pollaId, userA, 'UserA_WCWrong');

  const matchId = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-09-02T18:00:00Z' });
  // Predice visitante gana (0-2), resultado real es local gana (2-0)
  await addPrediction(pollaId, userA, matchId, 0, 2, 'x2');

  await setMatchResult(matchId, 2, 0);
  await calculateMatchPoints(matchId);

  const points = await getMatchPoints(pollaId, userA, matchId);
  // Strict directional: pred diff=-2, real diff=+2 → goal_diff NO paga (signo distinto).
  // Solo total_goals (0+2=2+0=2) → 1pt × x2 = 2pts.
  assert(points === 2, 'Comodín x2 con dirección invertida: solo total_goals × 2 = 2pts', `got ${points}`);
}

async function runScenario7_CustomPointSystem(userA: string) {
  section('Escenario 7 — Sistema de puntos custom (exact_score=10, goal_difference=0)');

  const tournamentId = await createSmokeTournament();
  // Sistema custom: exact_score vale mucho, goles individuales no cuentan
  const pollaId = await createSmokePolla(tournamentId, userA, {
    point_system: { correct_result: 2, home_goals: 0, away_goals: 0, exact_score: 10, goal_difference: 0, total_goals: 0 },
  });
  await addMember(pollaId, userA, 'UserA_Custom');

  const matchExact = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-10-01T18:00:00Z' });
  const matchCorrect = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-10-02T18:00:00Z' });
  const matchWrong = await createSmokeMatch(tournamentId, { status: 'NS', scheduledAt: '2024-10-03T18:00:00Z' });

  // Nueva regla: exacto = solo exact_score(10), no acumula correct_result
  await addPrediction(pollaId, userA, matchExact, 2, 1);
  // Correcto pero no exacto: predice 1-0 (home win), real 3-0 (home win) → correct_result(2) = 2
  await addPrediction(pollaId, userA, matchCorrect, 1, 0);
  // Incorrecto: predice empate 0-0, real 1-0 → 0
  await addPrediction(pollaId, userA, matchWrong, 0, 0);

  await setMatchResult(matchExact, 2, 1);
  await setMatchResult(matchCorrect, 3, 0);
  await setMatchResult(matchWrong, 1, 0);

  await calculateMatchPoints(matchExact);
  await calculateMatchPoints(matchCorrect);
  await calculateMatchPoints(matchWrong);

  const pExact = await getMatchPoints(pollaId, userA, matchExact);
  const pCorrect = await getMatchPoints(pollaId, userA, matchCorrect);
  const pWrong = await getMatchPoints(pollaId, userA, matchWrong);
  const total = await getMemberPoints(pollaId, userA);

  assert(pExact === 10, 'Custom: exacto 2-1 = 10 pts (solo exact_score)', `got ${pExact}`);
  assert(pCorrect === 2, 'Custom: correcto no exacto = 2 pts (solo correct_result)', `got ${pCorrect}`);
  assert(pWrong === 0, 'Custom: incorrecto = 0 pts', `got ${pWrong}`);
  assert(total === 12, 'Custom: total = 12 pts (10+2+0)', `got ${total}`);
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
    await runScenario5_X3Wildcard(userA);
    await runScenario6_WildcardOnWrong(userA);
    await runScenario7_CustomPointSystem(userA);
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
