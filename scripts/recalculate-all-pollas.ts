/**
 * Recalculo SLIM de puntos para todas las pollas.
 *
 * Skip badges + ranking_history + special predictions para velocidad.
 * Solo recompute match_points + polla_members.total_points usando nueva regla
 * de scoring. Útil tras cambios en lógica de cálculo de puntos.
 *
 * Uso: npx tsx -r dotenv/config scripts/recalculate-all-pollas.ts dotenv_config_path=.env.local
 */

import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin';
import { getPointSystem, scoreMatchPrediction } from '../src/lib/scoring';

async function recalcPolla(pollaId: string, pollaName: string) {
  const admin = createAdminClient();

  const { data: polla } = await admin
    .from('pollas')
    .select('id, tournament_id, point_system')
    .eq('id', pollaId)
    .single();
  if (!polla || !polla.tournament_id) {
    console.log(`   [${pollaId.slice(0, 8)}] ${pollaName} ... skip (sin torneo)`);
    return;
  }

  const ps = getPointSystem(polla.point_system);

  const { data: matches } = await admin
    .from('matches')
    .select('id, home_goals, away_goals')
    .eq('tournament_id', polla.tournament_id)
    .in('status', ['FT', 'AFT']);

  if (!matches || matches.length === 0) {
    console.log(`   [${pollaId.slice(0, 8)}] ${pollaName} ... skip (sin partidos FT)`);
    return;
  }

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const matchIds = matches.map((m) => m.id);

  const { data: predictions } = await admin
    .from('predictions')
    .select('user_id, match_id, home_goals, away_goals, wildcard_used')
    .eq('polla_id', pollaId)
    .in('match_id', matchIds);

  if (!predictions || predictions.length === 0) {
    console.log(`   [${pollaId.slice(0, 8)}] ${pollaName} ... 0 preds`);
    return;
  }

  // Calcular exactos por match para bonus único
  const exactByMatch = new Map<string, string[]>();
  for (const pred of predictions) {
    const m = matchById.get(pred.match_id);
    if (!m || m.home_goals === null || m.away_goals === null) continue;
    if (m.home_goals === pred.home_goals && m.away_goals === pred.away_goals) {
      if (!exactByMatch.has(pred.match_id)) exactByMatch.set(pred.match_id, []);
      exactByMatch.get(pred.match_id)!.push(pred.user_id);
    }
  }
  const uniqueExactWinner = new Map<string, string>();
  if (ps.unique_exact_bonus > 0) {
    for (const [mid, users] of Array.from(exactByMatch.entries())) {
      if (users.length === 1) uniqueExactWinner.set(mid, users[0]);
    }
  }

  // Construir upserts
  const rows: Array<{ polla_id: string; user_id: string; match_id: string; points: number }> = [];
  for (const pred of predictions) {
    const m = matchById.get(pred.match_id);
    if (!m || m.home_goals === null || m.away_goals === null) continue;
    const isUniqueWinner = uniqueExactWinner.get(pred.match_id) === pred.user_id;
    const points = scoreMatchPrediction({
      realHome: m.home_goals,
      realAway: m.away_goals,
      predHome: pred.home_goals,
      predAway: pred.away_goals,
      ps,
      wildcard: pred.wildcard_used as 'x2' | 'x3' | null,
      uniqueExactMultiplier: isUniqueWinner ? ps.unique_exact_bonus : 1,
    });
    rows.push({ polla_id: pollaId, user_id: pred.user_id, match_id: pred.match_id, points });
  }

  // Upsert batch
  const { error: upErr } = await admin
    .from('match_points')
    .upsert(rows, { onConflict: 'polla_id, user_id, match_id' });
  if (upErr) {
    console.log(`   [${pollaId.slice(0, 8)}] ${pollaName} ... ERROR upsert: ${upErr.message}`);
    return;
  }

  // CRÍTICO: marcar partidos como calculados. Si no se hace, el cron
  // los procesa cada 2 min indefinido → con N pollas y muchos partidos
  // pasa de 30s → 504 Gateway Timeout (bug observado 2026-06-12).
  const matchIdsToMark = Array.from(new Set(rows.map((r) => r.match_id)));
  if (matchIdsToMark.length > 0) {
    await admin.from('matches').update({ points_calculated: true }).in('id', matchIdsToMark);
  }

  // Recalcular total_points por miembro vía RPC (más rápido que loop)
  const { error: rpcErr } = await (admin as any).rpc('recalculate_polla_totals', { p_polla_id: pollaId });
  if (rpcErr) {
    // Fallback manual: sumar match_points + special_predictions por miembro
    const { data: members } = await admin
      .from('polla_members')
      .select('user_id')
      .eq('polla_id', pollaId)
      .eq('status', 'approved');
    for (const mem of members || []) {
      const { data: mpSum } = await admin
        .from('match_points')
        .select('points')
        .eq('polla_id', pollaId)
        .eq('user_id', mem.user_id);
      const { data: spSum } = await admin
        .from('special_predictions')
        .select('points')
        .eq('polla_id', pollaId)
        .eq('user_id', mem.user_id);
      const total =
        (mpSum || []).reduce((s, r) => s + (r.points || 0), 0) +
        (spSum || []).reduce((s, r) => s + (r.points || 0), 0);
      await admin
        .from('polla_members')
        .update({ total_points: total })
        .eq('polla_id', pollaId)
        .eq('user_id', mem.user_id);
    }
  }

  console.log(`   [${pollaId.slice(0, 8)}] ${pollaName} ... OK (${rows.length} preds, ${matches.length} matches)`);
}

async function main() {
  const admin = createAdminClient();

  console.log('Listando pollas con torneo...');
  const { data: pollas } = await admin
    .from('pollas')
    .select('id, name, tournament_id')
    .not('tournament_id', 'is', null);
  console.log(`${pollas?.length ?? 0} pollas.`);

  for (const polla of pollas ?? []) {
    try {
      await recalcPolla(polla.id, polla.name);
    } catch (e: any) {
      console.log(`   [${polla.id.slice(0, 8)}] ${polla.name} ... ERROR ${e.message}`);
    }
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
