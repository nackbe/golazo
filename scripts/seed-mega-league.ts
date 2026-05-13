/**
 * seed-mega-league.ts — Liga MEGA de prueba con 30 fechas, TODOS los usuarios,
 * predicciones aleatorias, comodines, predicciones especiales, y ranking history.
 *
 * Uso:
 *   npx tsx scripts/seed-mega-league.ts          → crea la liga MEGA
 *   npx tsx scripts/seed-mega-league.ts --clean  → borra todo lo creado
 *
 * Datos generados:
 *   - 16 equipos
 *   - 30 fechas (15 ida + 15 vuelta round-robin)
 *   - 240 partidos con resultados aleatorios
 *   - Fecha 30: incluye Final y 3er lugar
 *   - Cada usuario predice TODOS los partidos
 *   - Comodines x2/x3 distribuidos aleatoriamente
 *   - Predicciones especiales para cada usuario
 *   - Puntos calculados + ranking history por partido
 *
 * OPTIMIZADO: calcula match_points y ranking_history en memoria e inserta en batch.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { scoreMatchPrediction, getPointSystem, getSpecialPointSystem } from '@/lib/scoring';
import { awardBadgesBatch } from '@/lib/badges';
import * as fs from 'fs';
import * as path from 'path';

const SEED_FILE = path.join(process.cwd(), '.mega-league-ids.json');
const TEST_CODE = 'MEGA99';

const admin = createAdminClient();

function section(t: string) { console.log(`\n── ${t}`); }
function log(t: string) { console.log(`  ${t}`); }

// ─── Configuración ───────────────────────────────────────────────────────────

const NUM_TEAMS = 16;
const NUM_ROUNDS = 30;
const MATCHES_PER_ROUND = NUM_TEAMS / 2;

// Nivel de "habilidad" de cada usuario [probExacto, probResultadoCorrecto, probFallo]
const USER_SKILL_LEVELS: Array<[number, number, number]> = [
  [0.35, 0.40, 0.25],
  [0.30, 0.35, 0.35],
  [0.25, 0.35, 0.40],
  [0.20, 0.35, 0.45],
  [0.18, 0.32, 0.50],
  [0.15, 0.30, 0.55],
  [0.12, 0.28, 0.60],
  [0.10, 0.25, 0.65],
  [0.08, 0.22, 0.70],
];

// ─── Equipos ─────────────────────────────────────────────────────────────────

const TEAM_NAMES = [
  'Real Madrid', 'Barcelona', 'Manchester City', 'Bayern Munich',
  'Liverpool', 'Paris Saint-Germain', 'Inter Milan', 'Borussia Dortmund',
  'Atletico Madrid', 'Arsenal', 'Napoli', 'AC Milan',
  'Juventus', 'Chelsea', 'Ajax', 'Porto',
];
const TEAM_COUNTRIES = [
  'ES', 'ES', 'GB', 'DE', 'GB', 'FR', 'IT', 'DE',
  'ES', 'GB', 'IT', 'IT', 'IT', 'GB', 'NL', 'PT',
];

// ─── Utilidades ──────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function randomGoals(seed: number): number {
  const r = seededRandom(seed);
  if (r < 0.25) return 0;
  if (r < 0.50) return 1;
  if (r < 0.75) return 2;
  if (r < 0.90) return 3;
  if (r < 0.97) return 4;
  return 5;
}

function generateRoundRobin(teamCount: number): Array<Array<[number, number]>> {
  const n = teamCount;
  const rounds: Array<Array<[number, number]>> = [];
  const indices = Array.from({ length: n }, (_, i) => i);

  for (let r = 0; r < n - 1; r++) {
    const matches: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      matches.push([indices[i], indices[n - 1 - i]]);
    }
    rounds.push(matches);
    indices.splice(1, 0, indices.pop()!);
  }

  return rounds;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function runClean() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('No se encontró .mega-league-ids.json — nada que limpiar.');
    process.exit(1);
  }
  const { pollaId, tournamentId, matchIds, teamIds } = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  section('Limpiando MEGA liga...');
  await admin.from('player_badges').delete().eq('polla_id', pollaId);
  await admin.from('player_streaks').delete().eq('polla_id', pollaId);
  await admin.from('ranking_history').delete().eq('polla_id', pollaId);
  await admin.from('match_points').delete().eq('polla_id', pollaId);
  await admin.from('special_predictions').delete().eq('polla_id', pollaId);
  await admin.from('predictions').delete().eq('polla_id', pollaId);
  await admin.from('polla_members').delete().eq('polla_id', pollaId);
  await admin.from('pollas').delete().eq('id', pollaId);
  if (matchIds?.length) await admin.from('matches').delete().in('id', matchIds);
  if (teamIds?.length) await admin.from('teams').delete().in('id', teamIds);
  await admin.from('tournament_special_results').delete().eq('tournament_id', tournamentId);
  await admin.from('tournaments').delete().eq('id', tournamentId);
  fs.unlinkSync(SEED_FILE);
  log('✅ MEGA liga eliminada.');
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function runSeed() {
  // 1. Usuarios reales
  section('Obteniendo usuarios reales...');
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, alias')
    .not('alias', 'is', null)
    .order('created_at', { ascending: true });

  if (!profiles || profiles.length < 2) {
    console.error('Se necesitan al menos 2 usuarios con alias en la DB.');
    process.exit(1);
  }
  log(`${profiles.length} usuarios encontrados:`);
  profiles.forEach((p, i) => log(`  [${i}] ${p.alias}`));

  const firstUserId = profiles[0].id;
  const totalUsers = profiles.length;

  // 2. Torneo
  section('Creando torneo MEGA...');
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .insert({
      name: 'MEGA Liga — 30 Fechas',
      season: '2026',
      country: 'INT',
      type: 'League',
      start_date: '2026-01-15',
      end_date: '2026-10-30',
      status: 'ongoing',
    })
    .select('id')
    .single();
  if (!tournament) throw new Error(`No se pudo crear el torneo: ${tErr?.message}`);
  log(`Torneo: ${tournament.id.slice(0, 8)}...`);

  // 3. Equipos
  section('Creando equipos...');
  const { data: teams, error: teamErr } = await admin
    .from('teams')
    .insert(TEAM_NAMES.map((name, i) => ({ name, country: TEAM_COUNTRIES[i] })))
    .select('id, name');
  if (!teams) throw new Error(`No se pudieron crear equipos: ${teamErr?.message}`);
  teams.forEach(t => log(t.name));

  // 4. Generar fixture round-robin
  section('Generando fixture (30 fechas)...');
  const idaRounds = generateRoundRobin(NUM_TEAMS);
  const vueltaRounds = idaRounds.map(round =>
    round.map(([home, away]) => [away, home] as [number, number])
  );
  const allRounds = [...idaRounds, ...vueltaRounds];

  const baseDate = new Date('2026-01-15T18:00:00Z');
  const matchRows: Array<{
    id?: string;
    tournament_id: string;
    home_team_id: string;
    away_team_id: string;
    home_goals: number;
    away_goals: number;
    status: string;
    points_calculated: boolean;
    scheduled_at: string;
    round: string;
  }> = [];

  for (let roundIdx = 0; roundIdx < NUM_ROUNDS; roundIdx++) {
    const round = allRounds[roundIdx];
    const roundName = `Fecha ${roundIdx + 1}`;
    const dateOffset = roundIdx * 7;

    for (let mIdx = 0; mIdx < round.length; mIdx++) {
      const [homeIdx, awayIdx] = round[mIdx];
      const resultSeed = roundIdx * 1000 + mIdx * 17 + 42;
      const homeGoals = randomGoals(resultSeed);
      const awayGoals = randomGoals(resultSeed + 1);

      let roundLabel = roundName;
      if (roundIdx === NUM_ROUNDS - 1) {
        if (mIdx === round.length - 1) roundLabel = 'Final';
        else if (mIdx === round.length - 2) roundLabel = '3rd Place';
      }

      matchRows.push({
        tournament_id: tournament.id,
        home_team_id: teams[homeIdx].id,
        away_team_id: teams[awayIdx].id,
        home_goals: homeGoals,
        away_goals: awayGoals,
        status: 'FT',
        points_calculated: false,
        scheduled_at: new Date(baseDate.getTime() + dateOffset * 24 * 3600 * 1000 + mIdx * 2 * 3600 * 1000).toISOString(),
        round: roundLabel,
      });
    }
  }

  const { data: createdMatches, error: matchErr } = await admin
    .from('matches')
    .insert(matchRows)
    .select('id, home_team_id, away_team_id, home_goals, away_goals, status, round');
  if (!createdMatches) throw new Error(`No se pudieron crear los partidos: ${matchErr?.message}`);
  log(`${createdMatches.length} partidos creados`);

  // 5. Polla
  section('Creando polla MEGA...');
  const pointSystem = {
    correct_result: 1,
    home_goals: 1,
    away_goals: 1,
    exact_score: 3,
    goal_difference: 1,
    total_goals: 1,
    unique_exact_bonus: 2,
  };

  const { data: polla, error: pErr } = await admin
    .from('pollas')
    .insert({
      name: 'MEGA Liga 30 Fechas (Todos los usuarios)',
      code: TEST_CODE,
      status: 'finished',
      tournament_id: tournament.id,
      admin_id: firstUserId,
      bet_deadline_minutes: 5,
      auto_approve: true,
      admin_plays: true,
      point_system: pointSystem,
      wildcards: [{ type: 'x2', quantity: 3 }, { type: 'x3', quantity: 2 }],
      special_point_system: { champion: 10, finalist: 5, third_place: 3, least_goals_against: 5, worst_team: 4, top_scorer_team: 5 },
      auto_random_prediction: false,
    })
    .select('id')
    .single();
  if (!polla) throw new Error(`No se pudo crear la polla: ${pErr?.message}`);
  log(`Polla: ${polla.id.slice(0, 8)}... (código: ${TEST_CODE})`);

  // 6. Miembros
  section('Agregando miembros...');
  const { error: membErr } = await admin.from('polla_members').insert(
    profiles.map(p => ({ polla_id: polla.id, user_id: p.id, alias: p.alias!, status: 'approved' as const, total_points: 0 }))
  );
  if (membErr) throw new Error(`Error al agregar miembros: ${membErr.message}`);
  log(`${profiles.length} miembros aprobados`);

  // 7. Generar predicciones + calcular puntos EN MEMORIA
  section('Generando predicciones y calculando puntos en memoria...');

  const ps = getPointSystem(pointSystem);
  const predictions: Array<any> = [];
  const matchPoints: Array<any> = [];
  const badgeContexts: Array<{
    userId: string;
    exact: boolean;
    correctResult: boolean;
    wildcardUsed: string | null;
    isFinal: boolean;
  }> = [];

  // Totales acumulados por usuario para ranking history
  const userTotalPoints: Record<string, number> = {};
  for (const p of profiles) userTotalPoints[p.id] = 0;

  // Ranking history snapshots: uno por partido × usuario
  const rankingHistoryRows: Array<any> = [];

  // Contadores de comodines por usuario
  const wildcardsUsed: Array<{ x2: number; x3: number }> = profiles.map(() => ({ x2: 0, x3: 0 }));
  const MAX_X2 = 3;
  const MAX_X3 = 2;

  for (let mIdx = 0; mIdx < createdMatches.length; mIdx++) {
    const match = createdMatches[mIdx];
    const realHome = match.home_goals ?? 0;
    const realAway = match.away_goals ?? 0;
    const realDiff = realHome - realAway;
    const isFinal = match.round ? (match.round.toLowerCase() === 'final' || match.round.toLowerCase() === 'grand final') : false;

    // Calcular exact predictions para bonus único
    const exactUserIds: string[] = [];
    const predsForMatch: Array<{ userId: string; predHome: number; predAway: number; wildcard: string | null }> = [];

    for (let uIdx = 0; uIdx < totalUsers; uIdx++) {
      const userId = profiles[uIdx].id;
      const skill = USER_SKILL_LEVELS[uIdx % USER_SKILL_LEVELS.length];
      const seed = mIdx * 997 + uIdx * 31 + 123;
      const r = seededRandom(seed);

      let predHome: number;
      let predAway: number;

      if (r < skill[0]) {
        predHome = realHome;
        predAway = realAway;
      } else if (r < skill[0] + skill[1]) {
        if (realDiff > 0) {
          predHome = clamp(realHome + Math.round((seededRandom(seed + 2) - 0.5) * 2), 1, 5);
          predAway = clamp(predHome - 1, 0, 4);
        } else if (realDiff < 0) {
          predAway = clamp(realAway + Math.round((seededRandom(seed + 2) - 0.5) * 2), 1, 5);
          predHome = clamp(predAway - 1, 0, 4);
        } else {
          predHome = clamp(realHome + Math.round((seededRandom(seed + 2) - 0.5) * 2), 0, 3);
          predAway = predHome;
        }
      } else {
        if (realDiff > 0) {
          predHome = clamp(Math.round(seededRandom(seed + 3) * 2), 0, 2);
          predAway = clamp(predHome + 1 + Math.round(seededRandom(seed + 4) * 2), 1, 4);
        } else if (realDiff < 0) {
          predAway = clamp(Math.round(seededRandom(seed + 3) * 2), 0, 2);
          predHome = clamp(predAway + 1 + Math.round(seededRandom(seed + 4) * 2), 1, 4);
        } else {
          predHome = clamp(Math.round(seededRandom(seed + 3) * 3), 0, 3);
          predAway = clamp(predHome + 1 + Math.round(seededRandom(seed + 4) * 2), 0, 4);
        }
      }

      // Comodín
      let wildcard: 'x2' | 'x3' | null = null;
      const wcR = seededRandom(seed + 99);
      if (wcR < 0.03 && wildcardsUsed[uIdx].x3 < MAX_X3) {
        wildcard = 'x3';
        wildcardsUsed[uIdx].x3++;
      } else if (wcR < 0.08 && wildcardsUsed[uIdx].x2 < MAX_X2) {
        wildcard = 'x2';
        wildcardsUsed[uIdx].x2++;
      }

      predictions.push({
        polla_id: polla.id,
        user_id: userId,
        match_id: match.id,
        home_goals: predHome,
        away_goals: predAway,
        wildcard_used: wildcard,
      });

      predsForMatch.push({ userId, predHome, predAway, wildcard });

      if (predHome === realHome && predAway === realAway) {
        exactUserIds.push(userId);
      }
    }

    // Calcular puntos para cada predicción de este partido
    const hasUniqueExact = ps.unique_exact_bonus > 0 && exactUserIds.length === 1;
    const uniqueExactUserId = hasUniqueExact ? exactUserIds[0] : null;

    for (const pred of predsForMatch) {
      let points = scoreMatchPrediction({
        realHome,
        realAway,
        predHome: pred.predHome,
        predAway: pred.predAway,
        ps,
        wildcard: pred.wildcard,
      });

      if (hasUniqueExact && pred.userId === uniqueExactUserId) {
        points += ps.exact_score * (ps.unique_exact_bonus - 1);
      }

      matchPoints.push({
        polla_id: polla.id,
        user_id: pred.userId,
        match_id: match.id,
        points,
      });

      userTotalPoints[pred.userId] += points;

      // Badge context
      const exact = realHome === pred.predHome && realAway === pred.predAway;
      const correctResult = Math.sign(realHome - realAway) === Math.sign(pred.predHome - pred.predAway);
      badgeContexts.push({
        userId: pred.userId,
        exact,
        correctResult,
        wildcardUsed: pred.wildcard,
        isFinal,
      });
    }

    // Guardar snapshot de ranking después de este partido
    // Ordenar usuarios por puntos acumulados
    const sortedUsers = [...profiles].sort((a, b) => userTotalPoints[b.id] - userTotalPoints[a.id]);
    for (let pos = 0; pos < sortedUsers.length; pos++) {
      rankingHistoryRows.push({
        polla_id: polla.id,
        user_id: sortedUsers[pos].id,
        match_id: match.id,
        position: pos + 1,
        total_points: userTotalPoints[sortedUsers[pos].id],
      });
    }
  }

  // Insertar predicciones
  const { error: predErr } = await admin.from('predictions').insert(predictions);
  if (predErr) throw new Error(`Error al crear predicciones: ${predErr.message}`);
  log(`${predictions.length} predicciones creadas`);

  // Insertar match_points en batch
  if (matchPoints.length > 0) {
    const { error: mpErr } = await admin.from('match_points').insert(matchPoints);
    if (mpErr) throw new Error(`Error al crear match_points: ${mpErr.message}`);
    log(`${matchPoints.length} match_points creados`);
  }

  // Insertar ranking_history en batch
  if (rankingHistoryRows.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < rankingHistoryRows.length; i += BATCH_SIZE) {
      const batch = rankingHistoryRows.slice(i, i + BATCH_SIZE);
      const { error: rhErr } = await admin.from('ranking_history').insert(batch);
      if (rhErr) throw new Error(`Error al crear ranking_history: ${rhErr.message}`);
    }
    log(`${rankingHistoryRows.length} snapshots de ranking creados`);
  }

  // Marcar partidos como calculados
  await admin.from('matches').update({ points_calculated: true }).eq('tournament_id', tournament.id);

  // Badges en batch
  if (badgeContexts.length > 0) {
    try {
      await awardBadgesBatch(polla.id, badgeContexts);
      log(`${badgeContexts.length} contextos de badges procesados`);
    } catch (e: any) {
      log(`Error en badges: ${e.message}`);
    }
  }

  // Recalcular totales finales
  section('Recalculando totales finales...');
  const { createAdminClient: createAdmin } = await import('@/lib/supabase/admin');
  const adminClient = createAdmin();
  try {
    await (adminClient as any).rpc('recalculate_polla_totals', { p_polla_id: polla.id });
    log('✓ Totales recalculados');
  } catch (e: any) {
    log(`Error RPC: ${e.message}`);
  }

  // 8. Predicciones especiales
  section('Generando predicciones especiales...');

  // Crear tournament_special_results
  const finalMatch = createdMatches.find(m => m.round === 'Final');
  const thirdMatch = createdMatches.find(m => m.round === '3rd Place');

  const championId = finalMatch && (finalMatch.home_goals ?? 0) > (finalMatch.away_goals ?? 0)
    ? finalMatch.home_team_id
    : finalMatch && (finalMatch.away_goals ?? 0) > (finalMatch.home_goals ?? 0)
      ? finalMatch.away_team_id
      : null;

  const finalistId = championId === finalMatch?.home_team_id
    ? finalMatch?.away_team_id
    : finalMatch?.home_team_id;

  const thirdPlaceId = thirdMatch && (thirdMatch.home_goals ?? 0) > (thirdMatch.away_goals ?? 0)
    ? thirdMatch.home_team_id
    : thirdMatch && (thirdMatch.away_goals ?? 0) > (thirdMatch.home_goals ?? 0)
      ? thirdMatch.away_team_id
      : null;

  // Stats del torneo
  const stats = calculateTournamentStatsFromMatches(createdMatches);

  const specialResults = [];
  if (championId) specialResults.push({ tournament_id: tournament.id, type: 'champion', team_id: championId });
  if (finalistId) specialResults.push({ tournament_id: tournament.id, type: 'finalist', team_id: finalistId });
  if (thirdPlaceId) specialResults.push({ tournament_id: tournament.id, type: 'third_place', team_id: thirdPlaceId });
  if (stats.least_goals_against) specialResults.push({ tournament_id: tournament.id, type: 'least_goals_against', team_id: stats.least_goals_against });
  if (stats.worst_team) specialResults.push({ tournament_id: tournament.id, type: 'worst_team', team_id: stats.worst_team });
  if (stats.top_scorer_team) specialResults.push({ tournament_id: tournament.id, type: 'top_scorer_team', team_id: stats.top_scorer_team });

  if (specialResults.length > 0) {
    const { error: tsrErr } = await admin.from('tournament_special_results').insert(specialResults);
    if (tsrErr) throw new Error(`Error al crear tournament_special_results: ${tsrErr.message}`);
    log(`${specialResults.length} resultados especiales del torneo creados`);
  }

  const specialResultMap = new Map(specialResults.map(r => [r.type, r.team_id]));
  const specialTypes = ['champion', 'finalist', 'third_place', 'least_goals_against', 'worst_team', 'top_scorer_team'] as const;
  const specialPredictions: Array<any> = [];

  for (let uIdx = 0; uIdx < totalUsers; uIdx++) {
    const userId = profiles[uIdx].id;
    for (const type of specialTypes) {
      const actualTeamId = specialResultMap.get(type);
      if (!actualTeamId) continue;
      const hitChance = 0.3 + (1 - uIdx / totalUsers) * 0.5;
      const seed = uIdx * 100 + specialTypes.indexOf(type) * 7 + 999;
      const hit = seededRandom(seed) < hitChance;
      const teamId = hit ? actualTeamId : teams[Math.floor(seededRandom(seed + 1) * teams.length)].id;

      specialPredictions.push({
        polla_id: polla.id,
        user_id: userId,
        type,
        team_id: teamId,
      });
    }
  }

  const { error: spErr } = await admin.from('special_predictions').insert(specialPredictions);
  if (spErr) throw new Error(`Error al crear predicciones especiales: ${spErr.message}`);
  log(`${specialPredictions.length} predicciones especiales creadas`);

  // Calcular puntos especiales
  section('Calculando puntos de predicciones especiales...');
  const sps = getSpecialPointSystem({ champion: 10, finalist: 5, third_place: 3, least_goals_against: 5, worst_team: 4, top_scorer_team: 5 });
  let specialPointsProcessed = 0;
  for (const pred of specialPredictions) {
    const actualTeamId = specialResultMap.get(pred.type);
    if (!actualTeamId) continue;
    const points = pred.team_id === actualTeamId ? (sps[pred.type as keyof typeof sps] || 0) : 0;
    await admin.from('special_predictions').update({ points }).eq('id', pred.id);
    if (points > 0) specialPointsProcessed++;
  }
  log(`${specialPointsProcessed} predicciones especiales acertadas`);

  // Recalcular totales con especiales
  try {
    await (adminClient as any).rpc('recalculate_polla_totals', { p_polla_id: polla.id });
    log('✓ Totales recalculados con especiales');
  } catch (e: any) {
    log(`Error RPC: ${e.message}`);
  }

  // 9. Guardar IDs para cleanup
  const matchIds = createdMatches.map(m => m.id);
  const teamIds = teams.map(t => t.id);
  fs.writeFileSync(SEED_FILE, JSON.stringify({ pollaId: polla.id, tournamentId: tournament.id, matchIds, teamIds }, null, 2));

  // 10. Resumen del ranking
  section('Ranking final');
  const { data: finalRanking } = await admin
    .from('polla_members')
    .select('alias, total_points')
    .eq('polla_id', polla.id)
    .eq('status', 'approved')
    .order('total_points', { ascending: false });

  if (finalRanking) {
    finalRanking.forEach((m, i) => {
      log(`${i + 1}. ${m.alias}: ${m.total_points} pts`);
    });
  }

  section('✅ MEGA liga creada');
  log(`Código de invitación: ${TEST_CODE}`);
  log(`Polla ID: ${polla.id}`);
  log(`Usuarios: ${profiles.length}`);
  log(`Partidos: ${matchIds.length}`);
  log(`Predicciones: ${predictions.length}`);
  log(`Predicciones especiales: ${specialPredictions.length}`);
  log(`Snapshots de ranking: ${rankingHistoryRows.length}`);
  log(`\nPara limpiar: npx tsx scripts/seed-mega-league.ts --clean`);
}

// ─── calculateTournamentStatsFromMatches inline para el script ───────────────

function calculateTournamentStatsFromMatches(matches: Array<any>) {
  const teamStats: Record<string, { goalsFor: number; goalsAgainst: number; points: number }> = {};

  for (const m of matches) {
    if (m.status !== 'FT' && m.status !== 'AFT') continue;
    if (m.home_goals === null || m.away_goals === null) continue;

    const ht = m.home_team_id;
    const at = m.away_team_id;
    if (!ht || !at) continue;

    if (!teamStats[ht]) teamStats[ht] = { goalsFor: 0, goalsAgainst: 0, points: 0 };
    if (!teamStats[at]) teamStats[at] = { goalsFor: 0, goalsAgainst: 0, points: 0 };

    teamStats[ht].goalsFor += m.home_goals;
    teamStats[ht].goalsAgainst += m.away_goals;
    teamStats[at].goalsFor += m.away_goals;
    teamStats[at].goalsAgainst += m.home_goals;

    if (m.home_goals > m.away_goals) teamStats[ht].points += 3;
    else if (m.home_goals < m.away_goals) teamStats[at].points += 3;
    else {
      teamStats[ht].points += 1;
      teamStats[at].points += 1;
    }
  }

  let leastGoalsAgainst: { teamId: string; value: number } | null = null;
  let worstTeam: { teamId: string; value: number } | null = null;
  let topScorer: { teamId: string; value: number } | null = null;

  for (const [teamId, stats] of Object.entries(teamStats)) {
    if (!leastGoalsAgainst || stats.goalsAgainst < leastGoalsAgainst.value) {
      leastGoalsAgainst = { teamId, value: stats.goalsAgainst };
    }
    if (!worstTeam || stats.points < worstTeam.value) {
      worstTeam = { teamId, value: stats.points };
    }
    if (!topScorer || stats.goalsFor > topScorer.value) {
      topScorer = { teamId, value: stats.goalsFor };
    }
  }

  return {
    least_goals_against: leastGoalsAgainst?.teamId ?? null,
    worst_team: worstTeam?.teamId ?? null,
    top_scorer_team: topScorer?.teamId ?? null,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isClean = process.argv.includes('--clean');
  if (isClean) await runClean();
  else await runSeed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
