/**
 * seed-test-league.ts — Liga de prueba con TODOS los usuarios reales del sistema.
 *
 * Uso:
 *   npx tsx scripts/seed-test-league.ts          → crea la liga de test
 *   npx tsx scripts/seed-test-league.ts --clean  → borra todo lo creado
 *
 * Escenarios diseñados para probar TODAS las combinaciones:
 *   - Exacto único (bonus unique_exact_bonus)
 *   - Exacto con x2 y x3
 *   - Resultado correcto sin exacto
 *   - Fallo total
 *   - Exacto compartido (no único)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { batchCalculateMatchPoints } from '@/lib/sync/calculate-points';
import * as fs from 'fs';
import * as path from 'path';

const SEED_FILE = path.join(process.cwd(), '.test-league-ids.json');
const TEST_CODE = 'TEST99';

const admin = createAdminClient();

function section(t: string) { console.log(`\n── ${t}`); }
function log(t: string) { console.log(`  ${t}`); }

// ─── Equipos ─────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: 'Argentina', country: 'AR' },
  { name: 'Brasil', country: 'BR' },
  { name: 'Colombia', country: 'CO' },
  { name: 'Uruguay', country: 'UY' },
  { name: 'México', country: 'MX' },
  { name: 'Chile', country: 'CL' },
  { name: 'Perú', country: 'PE' },
  { name: 'Ecuador', country: 'EC' },
];

interface Score { home: number; away: number }

// 15 partidos con resultados diseñados
const MATCHES: Array<{ home: number; away: number; result: Score; round: string }> = [
  // Fecha 1
  { home: 0, away: 1, result: { home: 2, away: 1 }, round: 'Fecha 1' }, // ARG 2-1 BRA
  { home: 2, away: 3, result: { home: 0, away: 0 }, round: 'Fecha 1' }, // COL 0-0 URU
  { home: 4, away: 5, result: { home: 3, away: 2 }, round: 'Fecha 1' }, // MEX 3-2 CHI
  // Fecha 2
  { home: 6, away: 7, result: { home: 1, away: 1 }, round: 'Fecha 2' }, // PER 1-1 ECU
  { home: 0, away: 3, result: { home: 2, away: 0 }, round: 'Fecha 2' }, // ARG 2-0 URU
  { home: 1, away: 4, result: { home: 1, away: 3 }, round: 'Fecha 2' }, // BRA 1-3 MEX
  // Fecha 3
  { home: 2, away: 6, result: { home: 0, away: 1 }, round: 'Fecha 3' }, // COL 0-1 PER
  { home: 5, away: 7, result: { home: 2, away: 2 }, round: 'Fecha 3' }, // CHI 2-2 ECU
  { home: 0, away: 2, result: { home: 3, away: 1 }, round: 'Fecha 3' }, // ARG 3-1 COL
  // Fecha 4
  { home: 1, away: 6, result: { home: 0, away: 0 }, round: 'Fecha 4' }, // BRA 0-0 PER
  { home: 3, away: 5, result: { home: 4, away: 0 }, round: 'Fecha 4' }, // URU 4-0 CHI
  { home: 4, away: 7, result: { home: 1, away: 2 }, round: 'Fecha 4' }, // MEX 1-2 ECU
  // Fecha 5
  { home: 0, away: 4, result: { home: 2, away: 1 }, round: 'Fecha 5' }, // ARG 2-1 MEX
  { home: 1, away: 2, result: { home: 0, away: 2 }, round: 'Fecha 5' }, // BRA 0-2 COL
  { home: 6, away: 5, result: { home: 1, away: 0 }, round: 'Final' },   // PER 1-0 CHI
];

// ─── cleanup ─────────────────────────────────────────────────────────────────

async function runClean() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('No se encontró .test-league-ids.json — nada que limpiar.');
    process.exit(1);
  }
  const { pollaId, tournamentId, matchIds, teamIds } = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  section('Limpiando liga de test...');
  await admin.from('player_badges').delete().eq('polla_id', pollaId);
  await admin.from('player_streaks').delete().eq('polla_id', pollaId);
  await admin.from('ranking_history').delete().eq('polla_id', pollaId);
  await admin.from('match_points').delete().eq('polla_id', pollaId);
  await admin.from('predictions').delete().eq('polla_id', pollaId);
  await admin.from('polla_members').delete().eq('polla_id', pollaId);
  await admin.from('pollas').delete().eq('id', pollaId);
  if (matchIds?.length) await admin.from('matches').delete().in('id', matchIds);
  if (teamIds?.length) await admin.from('teams').delete().in('id', teamIds);
  await admin.from('tournaments').delete().eq('id', tournamentId);
  fs.unlinkSync(SEED_FILE);
  log('✅ Liga de test eliminada.');
}

// ─── seed ────────────────────────────────────────────────────────────────────

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

  // 2. Torneo
  section('Creando torneo...');
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .insert({ name: 'TEST — Liga de Prueba', season: '9999', country: 'TEST', type: 'League', start_date: '2024-06-01', end_date: '2024-07-15' })
    .select('id')
    .single();
  if (!tournament) throw new Error(`No se pudo crear el torneo: ${tErr?.message}`);
  log(`Torneo: ${tournament.id.slice(0, 8)}...`);

  // 3. Equipos
  section('Creando equipos...');
  const { data: teams, error: teamErr } = await admin
    .from('teams')
    .insert(TEAMS.map(t => ({ name: t.name, country: t.country })))
    .select('id, name');
  if (!teams) throw new Error(`No se pudieron crear equipos: ${teamErr?.message}`);
  teams.forEach(t => log(t.name));

  // 4. Polla
  section('Creando polla...');
  const { data: polla, error: pErr } = await admin
    .from('pollas')
    .insert({
      name: 'TEST — Liga de Prueba (Todos los usuarios)',
      code: TEST_CODE,
      status: 'active',
      tournament_id: tournament.id,
      admin_id: firstUserId,
      bet_deadline_minutes: 5,
      auto_approve: true,
      admin_plays: true,
      point_system: {
        correct_result: 1,
        home_goals: 1,
        away_goals: 1,
        exact_score: 3,
        goal_difference: 1,
        total_goals: 1,
        unique_exact_bonus: 2, // Si sos el único exacto, multiplica exact_score × 2
      },
      wildcards: [{ type: 'x2', quantity: 3 }, { type: 'x3', quantity: 2 }],
      special_point_system: { champion: 10, finalist: 5, third_place: 3, least_goals_against: 5, worst_team: 4, top_scorer_team: 5 },
      auto_random_prediction: false,
    })
    .select('id')
    .single();
  if (!polla) throw new Error(`No se pudo crear la polla: ${pErr?.message}`);
  log(`Polla: ${polla.id.slice(0, 8)}... (código: ${TEST_CODE})`);

  // 5. Miembros — TODOS los usuarios
  section('Agregando miembros...');
  const { error: membErr } = await admin.from('polla_members').insert(
    profiles.map(p => ({ polla_id: polla.id, user_id: p.id, alias: p.alias!, status: 'approved' as const, total_points: 0 }))
  );
  if (membErr) throw new Error(`Error al agregar miembros: ${membErr.message}`);
  log(`${profiles.length} miembros aprobados`);

  // 6. Partidos
  section('Creando partidos...');
  const baseDate = new Date('2024-06-01T18:00:00Z');
  const matchRows = MATCHES.map((m, i) => ({
    tournament_id: tournament.id,
    home_team_id: teams[m.home].id,
    away_team_id: teams[m.away].id,
    home_goals: m.result.home,
    away_goals: m.result.away,
    status: 'FT',
    points_calculated: false,
    scheduled_at: new Date(baseDate.getTime() + i * 24 * 3600 * 1000).toISOString(),
    round: m.round,
  }));

  const { data: createdMatches, error: matchErr } = await admin
    .from('matches')
    .insert(matchRows)
    .select('id');
  if (!createdMatches) throw new Error(`No se pudieron crear los partidos: ${matchErr?.message}`);
  const matchIds = createdMatches.map(m => m.id);
  log(`${matchIds.length} partidos creados`);

  // 7. Predicciones — escenarios diseñados
  section('Creando predicciones con escenarios...');

  const predictions: Array<any> = [];
  const totalUsers = profiles.length;

  for (let mIdx = 0; mIdx < MATCHES.length; mIdx++) {
    const real = MATCHES[mIdx].result;
    const matchId = matchIds[mIdx];

    for (let uIdx = 0; uIdx < totalUsers; uIdx++) {
      const userId = profiles[uIdx].id;
      let pred: Score;
      let wildcard: 'x2' | 'x3' | null = null;

      // Escenarios por partido
      if (mIdx === 0) {
        // PARTIDO 1: Solo el PRIMER usuario acierta exacto → prueba exacto único + bonus
        if (uIdx === 0) pred = { home: real.home, away: real.away };
        else pred = { home: real.home + 1, away: real.away }; // Todos fallan por 1 gol
      } else if (mIdx === 1) {
        // PARTIDO 2: Todos aciertan exacto → exacto compartido (no hay bonus único)
        pred = { home: real.home, away: real.away };
      } else if (mIdx === 2) {
        // PARTIDO 3: Todos aciertan resultado (empate) pero con marcadores distintos
        pred = { home: Math.floor(Math.random() * 3), away: Math.floor(Math.random() * 3) };
      } else if (mIdx === 3) {
        // PARTIDO 4: Primer usuario con x2 exacto → prueba wildcard x2
        if (uIdx === 0) {
          pred = { home: real.home, away: real.away };
          wildcard = 'x2';
        } else {
          pred = { home: real.home + 2, away: real.away };
        }
      } else if (mIdx === 4) {
        // PARTIDO 5: Segundo usuario con x3 exacto → prueba wildcard x3
        if (uIdx === 1) {
          pred = { home: real.home, away: real.away };
          wildcard = 'x3';
        } else {
          pred = { home: 0, away: 0 };
        }
      } else if (mIdx === 5) {
        // PARTIDO 6: Todos fallan completamente
        pred = { home: real.away + 1, away: real.home + 1 }; // Resultado invertido
      } else if (mIdx === 6) {
        // PARTIDO 7: Mitad acierta exacto, mitad falla
        if (uIdx % 2 === 0) pred = { home: real.home, away: real.away };
        else pred = { home: 9, away: 9 };
      } else if (mIdx === 7) {
        // PARTIDO 8: Solo el último usuario acierta exacto → otro exacto único
        if (uIdx === totalUsers - 1) pred = { home: real.home, away: real.away };
        else pred = { home: real.home + 1, away: real.away + 1 };
      } else if (mIdx === 8) {
        // PARTIDO 9: Todos aciertan resultado correcto (gana local) con marcadores distintos
        pred = { home: Math.max(1, real.home + (uIdx % 3 - 1)), away: real.away };
      } else if (mIdx === 9) {
        // PARTIDO 10: Mix aleatorio reproducible
        const r = (uIdx * 7 + mIdx * 13) % 100;
        if (r < 20) pred = { home: real.home, away: real.away }; // 20% exacto
        else if (r < 50) pred = { home: real.home + 1, away: real.away }; // 30% resultado correcto
        else pred = { home: real.away, away: real.home }; // 50% fallo
      } else {
        // PARTIDOS 11-15: Aleatorios
        const r = Math.random();
        if (r < 0.15) pred = { home: real.home, away: real.away };
        else if (r < 0.45) {
          const diff = real.home - real.away;
          if (diff > 0) pred = { home: Math.ceil(Math.random() * 3) + 1, away: 0 };
          else if (diff < 0) pred = { home: 0, away: Math.ceil(Math.random() * 3) + 1 };
          else pred = { home: Math.ceil(Math.random() * 2), away: Math.ceil(Math.random() * 2) };
        } else {
          if (real.home > real.away) pred = { home: 0, away: Math.ceil(Math.random() * 2) };
          else if (real.home < real.away) pred = { home: Math.ceil(Math.random() * 2), away: 0 };
          else pred = { home: Math.ceil(Math.random() * 3), away: 0 };
        }
      }

      predictions.push({
        polla_id: polla.id,
        user_id: userId,
        match_id: matchId,
        home_goals: pred.home,
        away_goals: pred.away,
        wildcard_used: wildcard,
      });
    }
  }

  const { error: predErr } = await admin.from('predictions').insert(predictions);
  if (predErr) throw new Error(`Error al crear predicciones: ${predErr.message}`);
  log(`${predictions.length} predicciones creadas`);

  // 8. Calcular puntos (procesa todos los partidos FT pendientes de la polla)
  section('Calculando puntos...');
  try {
    const result = await batchCalculateMatchPoints(polla.id);
    if (result.error) {
      log(`Error: ${result.error}`);
    } else {
      log(`✓ ${result.processed ?? 0} partidos procesados`);
    }
  } catch (e: any) {
    log(`✗ Error: ${e.message}`);
  }

  // 9. Guardar IDs para cleanup
  const teamIds = teams.map(t => t.id);
  fs.writeFileSync(SEED_FILE, JSON.stringify({ pollaId: polla.id, tournamentId: tournament.id, matchIds, teamIds }, null, 2));

  section('✅ Liga de test creada');
  log(`Código de invitación: ${TEST_CODE}`);
  log(`Polla ID: ${polla.id}`);
  log(`Usuarios: ${profiles.length}`);
  log(`Partidos: ${matchIds.length}`);
  log(`Predicciones: ${predictions.length}`);
  log(`\nPara limpiar: npx tsx scripts/seed-test-league.ts --clean`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const isClean = process.argv.includes('--clean');
  if (isClean) await runClean();
  else await runSeed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
