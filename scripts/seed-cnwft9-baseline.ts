/**
 * One-shot: setear baseline de puntos para polla CNWFT9 (La polla más Analitica).
 * Predicciones del Mundial se perdieron por el bug del DELETE cascade.
 * Esta es la última foto del ranking antes del incidente.
 *
 * Uso: npx tsx -r dotenv/config scripts/seed-cnwft9-baseline.ts dotenv_config_path=.env.local
 *
 * Requiere migración 0034 aplicada (columna bonus_points + RPC).
 * Si no está aplicada el script falla con "column does not exist".
 */

import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin';

const POLLA_CODE = 'CNWFT9';

// Por alias. Match case-insensitive.
const BASELINE: Record<string, number> = {
  'JuanPCO': 6,
  'Bryan': 5,
  'Juan José': 5,
  'Pipe': 5,
  'Alejo': 5,
  'La M': 4,
  'Laamartinezca': 4,
  'Juan Andres': 4,
  'Santi C': 4,
  'Pablo': 4,
  'Duvan': 4,
  'Valen Y': 4,
  'Key': 3,
  'JohnPalacios': 3,
  'Santiago Valencia': 3,
  'Aleja Uribe': 3,
  '5th': 3,
  'Robert': 3,
  'Karen Velásquez': 3,
  'Jonh Heredia': 2,
  'Jpduque': 2,
  'Julián Orozco': 4,
};

async function main() {
  const admin = createAdminClient();
  const { data: polla } = await admin
    .from('pollas')
    .select('id,name,code')
    .eq('code', POLLA_CODE)
    .single();
  if (!polla) {
    console.error('Polla', POLLA_CODE, 'no encontrada');
    process.exit(1);
  }
  console.log('Polla:', polla.name, polla.id);

  const { data: members } = await admin
    .from('polla_members')
    .select('user_id,alias,total_points')
    .eq('polla_id', polla.id)
    .eq('status', 'approved');

  console.log(`Members aprobados: ${members?.length ?? 0}`);
  const baselineMap = new Map(
    Object.entries(BASELINE).map(([k, v]) => [k.toLowerCase().trim(), v])
  );

  // Zero out specials.points para esta polla. Decisión de diseño:
  // los specials solo deben sumar al FINAL del torneo. Hasta entonces quedan
  // congelados en 0 — las predicciones siguen guardadas pero sin puntos.
  const { error: zeroErr } = await admin
    .from('special_predictions')
    .update({ points: 0 })
    .eq('polla_id', polla.id);
  if (zeroErr) {
    console.error('Error zero-ing specials:', zeroErr.message);
    process.exit(1);
  }
  console.log('Specials zerados (se evalúan al fin del torneo).');

  const updates: Array<{ user_id: string; alias: string; bonus: number; target: number }> = [];
  const missing: string[] = [];

  for (const m of members ?? []) {
    const key = m.alias.toLowerCase().trim();
    if (!baselineMap.has(key)) {
      missing.push(m.alias);
      continue;
    }
    const target = baselineMap.get(key)!;
    // Specials = 0 ahora, no hay que descontar. bonus = target exacto.
    updates.push({ user_id: m.user_id, alias: m.alias, target, bonus: target });
  }

  if (missing.length > 0) {
    console.log('⚠️ Miembros sin baseline (quedan en 0):', missing);
  }

  // Detectar si la columna bonus_points existe (migración 0034 aplicada).
  // Si está: usar bonus_points (persiste a través de recalcs).
  // Si no: fallback a total_points directo (frágil, se sobreescribe en próximo recalc).
  const probe = await (admin as any)
    .from('polla_members')
    .select('bonus_points' as any)
    .eq('polla_id', polla.id)
    .limit(1);
  const hasBonus = !probe.error;

  if (!hasBonus) {
    console.log('⚠️ Columna bonus_points NO existe (migración 0034 pendiente).');
    console.log('   Aplicando fallback: setear total_points directo.');
    console.log('   IMPORTANTE: estos valores se sobreescriben en el próximo recalc.');
    console.log('   Aplicá 0034 antes del primer partido FT del Mundial.\n');
  }

  console.log(`Aplicando puntos a ${updates.length} miembros:`);
  let errors = 0;
  for (const u of updates) {
    const payload = hasBonus
      ? { bonus_points: u.bonus }
      : { total_points: u.bonus };
    const { error } = await (admin as any)
      .from('polla_members')
      .update(payload)
      .eq('polla_id', polla.id)
      .eq('user_id', u.user_id);
    if (error) {
      console.error(`  ❌ ${u.alias} (${u.bonus}): ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${u.alias} → target=${u.target} (bonus=${u.bonus})`);
    }
  }

  if (errors > 0) {
    console.log(`\n${errors} errores. Abortando.`);
    process.exit(1);
  }

  if (hasBonus) {
    console.log('\nRecalculando totales (bonus + match_points + specials)...');
    const { data, error: rpcErr } = await (admin as any).rpc('recalculate_polla_totals', {
      p_polla_id: polla.id,
    });
    if (rpcErr) {
      console.error('RPC error:', rpcErr.message);
      process.exit(1);
    }
    console.log('RPC OK:', data);
  } else {
    console.log('\nTotales seteados directos. Sin RPC (fallback temporal).');
  }

  // Verificar
  const { data: after } = await admin
    .from('polla_members')
    .select('alias,total_points,bonus_points' as any)
    .eq('polla_id', polla.id)
    .eq('status', 'approved')
    .order('total_points', { ascending: false } as any);
  console.log('\nRanking actualizado:');
  for (const r of (after as any[]) ?? []) {
    console.log(`  ${r.total_points.toString().padStart(3)} pts  ${r.alias}  (bonus=${r.bonus_points})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
