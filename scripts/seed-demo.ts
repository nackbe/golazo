/**
 * seed-demo.ts — Pobla la DB con una polla demo visual completa.
 *
 * Uso:
 *   npx tsx scripts/seed-demo.ts          → crea la demo
 *   npx tsx scripts/seed-demo.ts --clean  → borra todo lo creado
 *
 * Patrones controlados:
 *   User 0 — "El Oráculo":   6 exactos seguidos → streak_exact_5, luego x3 exacto → perfect_wildcard
 *   User 1 — "La Constante": 10 resultados correctos (no exactos) → streak_result_5
 *   User 2 — "El Maldito":   5 incorrectos → negative_streak_5, luego exacto con x2 → perfect_wildcard
 *   Users 3+ — aleatorio reproducible con wildcards al azar
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { calculateMatchPoints } from '@/lib/sync/calculate-points';
import { awardBadgesFromMatch } from '@/lib/badges';
import * as fs from 'fs';
import * as path from 'path';

const SEED_FILE = path.join(process.cwd(), '.demo-seed-ids.json');
const DEMO_CODE = 'DEMO99';

const admin = createAdminClient();

// ─── utils ───────────────────────────────────────────────────────────────────

function section(t: string) { console.log(`\n── ${t}`); }
function log(t: string) { console.log(`  ${t}`); }

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}

interface Score { home: number; away: number }

function randomPred(real: Score, rng: () => number): Score {
  const r = rng();
  const diff = real.home - real.away;
  if (r < 0.25) {
    return { home: real.home, away: real.away }; // 25% exacto
  }
  if (r < 0.55) {
    // 30% resultado correcto, marcador distinto
    if (diff > 0) return { home: Math.ceil(rng() * 3) + 1, away: 0 };
    if (diff < 0) return { home: 0, away: Math.ceil(rng() * 3) + 1 };
    return { home: Math.ceil(rng() * 2), away: Math.ceil(rng() * 2) };
  }
  // 45% incorrecto
  if (diff > 0) return { home: 0, away: Math.ceil(rng() * 2) };
  if (diff < 0) return { home: Math.ceil(rng() * 2), away: 0 };
  return { home: Math.ceil(rng() * 3), away: 0 };
}

// ─── data ────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: 'Argentina',  country: 'AR', logo: '🇦🇷' },
  { name: 'Brasil',     country: 'BR', logo: '🇧🇷' },
  { name: 'Colombia',   country: 'CO', logo: '🇨🇴' },
  { name: 'Uruguay',    country: 'UY', logo: '🇺🇾' },
  { name: 'México',     country: 'MX', logo: '🇲🇽' },
  { name: 'Chile',      country: 'CL', logo: '🇨🇱' },
];

// 15 partidos, 5 fechas, 3 por fecha
const MATCHES: Array<{ home: number; away: number; result: Score; round: string }> = [
  // Fecha 1
  { home: 0, away: 2, result: { home: 2, away: 1 }, round: 'Fecha 1' }, // ARG 2-1 COL
  { home: 1, away: 3, result: { home: 0, away: 0 }, round: 'Fecha 1' }, // BRA 0-0 URU
  { home: 4, away: 5, result: { home: 3, away: 0 }, round: 'Fecha 1' }, // MEX 3-0 CHI
  // Fecha 2
  { home: 0, away: 3, result: { home: 1, away: 1 }, round: 'Fecha 2' }, // ARG 1-1 URU
  { home: 1, away: 2, result: { home: 2, away: 3 }, round: 'Fecha 2' }, // BRA 2-3 COL
  { home: 4, away: 5, result: { home: 1, away: 0 }, round: 'Fecha 2' }, // MEX 1-0 CHI
  // Fecha 3
  { home: 3, away: 2, result: { home: 0, away: 2 }, round: 'Fecha 3' }, // URU 0-2 COL
  { home: 0, away: 5, result: { home: 4, away: 1 }, round: 'Fecha 3' }, // ARG 4-1 CHI
  { home: 1, away: 4, result: { home: 1, away: 1 }, round: 'Fecha 3' }, // BRA 1-1 MEX
  // Fecha 4
  { home: 0, away: 4, result: { home: 2, away: 0 }, round: 'Fecha 4' }, // ARG 2-0 MEX
  { home: 2, away: 1, result: { home: 1, away: 2 }, round: 'Fecha 4' }, // COL 1-2 BRA
  { home: 5, away: 3, result: { home: 3, away: 3 }, round: 'Fecha 4' }, // CHI 3-3 URU
  // Fecha 5
  { home: 2, away: 0, result: { home: 0, away: 1 }, round: 'Semifinal' }, // COL 0-1 ARG
  { home: 3, away: 4, result: { home: 2, away: 2 }, round: 'Semifinal' }, // URU 2-2 MEX
  { home: 1, away: 5, result: { home: 1, away: 0 }, round: 'Final'     }, // BRA 1-0 CHI
];

// Predicciones controladas para User 1 (resultado correcto, no exacto)
const USER1_CONTROLLED: Score[] = [
  { home: 3, away: 0 }, // ARG gana ✓, no exacto
  { home: 1, away: 1 }, // Empate ✓, no exacto
  { home: 2, away: 0 }, // MEX gana ✓, no exacto
  { home: 2, away: 2 }, // Empate ✓, no exacto
  { home: 0, away: 1 }, // COL gana ✓, no exacto
  { home: 2, away: 0 }, // MEX gana ✓, no exacto
  { home: 0, away: 3 }, // COL gana ✓, no exacto
  { home: 2, away: 0 }, // ARG gana ✓, no exacto
  { home: 2, away: 2 }, // Empate ✓, no exacto
  { home: 1, away: 0 }, // ARG gana ✓, no exacto
];

// ─── cleanup ─────────────────────────────────────────────────────────────────

async function runClean() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('No se encontró .demo-seed-ids.json — nada que limpiar.');
    process.exit(1);
  }
  const { pollaId, tournamentId, matchIds, teamIds } = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  section('Limpiando demo...');
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
  log('✅ Demo eliminado.');
}

// ─── seed ────────────────────────────────────────────────────────────────────

async function runSeed() {
  const rng = seededRng(42);

  // 1. Usuarios
  section('Cargando usuarios...');
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, alias')
    .not('alias', 'is', null)
    .order('created_at', { ascending: true })
    .limit(10);

  if (!profiles || profiles.length < 2) {
    console.error('Se necesitan al menos 2 usuarios con alias en la DB.');
    process.exit(1);
  }
  profiles.forEach((p, i) => log(`[${i}] ${p.alias}`));

  const roles = ['El Oráculo 🔮', 'La Constante 📈', 'El Maldito 💀'];
  profiles.slice(0, 3).forEach((p, i) => log(`    → ${p.alias} jugará como "${roles[i]}"`));

  // 2. Torneo
  section('Creando torneo...');
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .insert({ name: 'DEMO — Copa América Test', season: '9999', country: 'DEMO', type: 'Cup', start_date: '2024-06-01', end_date: '2024-06-15' })
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
  const adminId = profiles[0].id;
  const { data: polla, error: pErr } = await admin
    .from('pollas')
    .insert({
      name: 'DEMO — Copa América Polla',
      code: DEMO_CODE,
      status: 'active',
      tournament_id: tournament.id,
      admin_id: adminId,
      bet_deadline_minutes: 60,
      auto_approve: true,
      admin_plays: true,
      point_system: { correct_result: 1, home_goals: 1, away_goals: 1, exact_score: 3, goal_difference: 1, total_goals: 1 },
      wildcards: [{ type: 'x2', quantity: 3 }, { type: 'x3', quantity: 2 }],
      special_point_system: { champion: 10, finalist: 5, third_place: 3, least_goals_against: 5, worst_team: 4, top_scorer_team: 5 },
      auto_random_prediction: false,
    })
    .select('id')
    .single();
  if (!polla) throw new Error(`No se pudo crear la polla: ${pErr?.message}`);
  log(`Polla: ${polla.id.slice(0, 8)}... (código: ${DEMO_CODE})`);

  // 5. Miembros
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
  log(`${matchIds.length} partidos (Fecha 1 → Final)`);

  // 7. Predicciones
  section('Creando predicciones...');

  for (const [uIdx, profile] of Array.from(profiles.entries())) {
    let wcX2Used = 0;
    let wcX3Used = 0;
    const preds: Array<{ polla_id: string; user_id: string; match_id: string; home_goals: number; away_goals: number; wildcard_used: 'x2' | 'x3' | null }> = [];

    for (let mIdx = 0; mIdx < MATCHES.length; mIdx++) {
      const real = MATCHES[mIdx].result;
      let pred: Score;
      let wildcard: 'x2' | 'x3' | null = null;

      if (uIdx === 0) {
        // ── El Oráculo: 6 exactos, 2 malos, exacto x3, resto random
        if (mIdx < 6) {
          pred = { home: real.home, away: real.away };
        } else if (mIdx === 6 || mIdx === 7) {
          const diff = real.home - real.away;
          pred = diff >= 0
            ? { home: 0, away: real.home + 1 }
            : { home: real.away + 1, away: 0 };
        } else if (mIdx === 8) {
          pred = { home: real.home, away: real.away };
          wildcard = 'x3'; wcX3Used++;
        } else {
          pred = randomPred(real, rng);
        }

      } else if (uIdx === 1) {
        // ── La Constante: 10 resultados correctos (no exactos), resto random
        if (mIdx < 10) {
          pred = USER1_CONTROLLED[mIdx];
        } else {
          pred = randomPred(real, rng);
        }

      } else if (uIdx === 2) {
        // ── El Maldito: 5 incorrectos, exacto x2, resto random
        if (mIdx < 5) {
          const diff = real.home - real.away;
          if (diff > 0) pred = { home: 0, away: real.home + 1 };
          else if (diff < 0) pred = { home: real.away + 1, away: 0 };
          else pred = { home: 3, away: 0 };
        } else if (mIdx === 5) {
          pred = { home: real.home, away: real.away };
          wildcard = 'x2'; wcX2Used++;
        } else {
          pred = randomPred(real, rng);
        }

      } else {
        // ── Aleatorio con wildcards ocasionales
        pred = randomPred(real, rng);
        if (rng() < 0.15) {
          if (wcX3Used < 2 && rng() < 0.3) {
            wildcard = 'x3'; wcX3Used++;
          } else if (wcX2Used < 3) {
            wildcard = 'x2'; wcX2Used++;
          }
        }
      }

      preds.push({
        polla_id: polla.id,
        user_id: profile.id,
        match_id: matchIds[mIdx],
        home_goals: pred.home,
        away_goals: pred.away,
        wildcard_used: wildcard,
      });
    }

    const { error: predErr } = await admin.from('predictions').insert(preds);
    if (predErr) throw new Error(`Error al insertar predicciones de ${profile.alias}: ${predErr.message}`);
    log(`${profile.alias}: ${preds.length} predicciones`);
  }

  // 8. Calcular puntos partido a partido (construye ranking_history)
  section('Calculando puntos...');
  for (let i = 0; i < matchIds.length; i++) {
    await calculateMatchPoints(matchIds[i]);
    process.stdout.write(`\r  Partido ${i + 1}/${matchIds.length}...`);
  }
  console.log(' ✅');

  // 9. Badges
  section('Otorgando badges...');
  for (const profile of profiles) {
    await awardBadgesFromMatch(polla.id, profile.id, {
      exact: false,
      correctResult: false,
      wildcardUsed: null,
      isFinal: true,
    });
  }
  log('Badges calculados para todos los usuarios');

  // 10. Guardar IDs para cleanup
  fs.writeFileSync(SEED_FILE, JSON.stringify({
    pollaId: polla.id,
    tournamentId: tournament.id,
    matchIds,
    teamIds: teams.map(t => t.id),
  }, null, 2));

  // 11. Resumen de puntos
  section('Resumen de puntos finales:');
  const { data: members } = await admin
    .from('polla_members')
    .select('user_id, total_points, profiles(alias)')
    .eq('polla_id', polla.id)
    .eq('status', 'approved')
    .order('total_points', { ascending: false });

  if (members) {
    members.forEach((m, i) => {
      const alias = (m.profiles as any)?.alias ?? '?';
      const medal = ['🥇', '🥈', '🥉'][i] ?? '  ';
      log(`${medal} ${alias}: ${m.total_points} pts`);
    });
  }

  section('✅ Demo lista');
  log(`Polla: "DEMO — Copa América Polla" (código: ${DEMO_CODE})`);
  log(`Abrí la app → buscá la polla en tu lista`);
  log(`Para limpiar: npx tsx scripts/seed-demo.ts --clean`);
}

// ─── main ────────────────────────────────────────────────────────────────────

const isClean = process.argv.includes('--clean');
(isClean ? runClean() : runSeed()).catch(e => {
  console.error('\n💥', e.message);
  process.exit(1);
});
