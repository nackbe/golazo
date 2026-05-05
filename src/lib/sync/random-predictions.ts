import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Genera predicciones aleatorias (0-10) para los miembros de una polla
 * que no hicieron predicción en un partido específico.
 * Solo actúa si la polla tiene auto_random_prediction = true.
 */
export async function generateRandomPredictionsForMatch(
  matchId: string,
  pollaId: string
): Promise<{ generated: number; skipped: number }> {
  const admin = createAdminClient();

  // Verificar que la polla tenga auto_random_prediction activo
  const { data: polla } = await admin
    .from('pollas')
    .select('auto_random_prediction')
    .eq('id', pollaId)
    .single();

  if (!polla?.auto_random_prediction) {
    return { generated: 0, skipped: 0 };
  }

  // Obtener miembros aprobados de la polla
  const { data: members } = await admin
    .from('polla_members')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('status', 'approved');

  if (!members || members.length === 0) {
    return { generated: 0, skipped: 0 };
  }

  // Obtener predicciones existentes para este partido
  const { data: existingPredictions } = await admin
    .from('predictions')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('match_id', matchId);

  const existingUserIds = new Set(existingPredictions?.map((p) => p.user_id) || []);

  // Filtrar miembros sin predicción
  const usersWithoutPrediction = members
    .map((m) => m.user_id)
    .filter((userId) => !existingUserIds.has(userId));

  if (usersWithoutPrediction.length === 0) {
    return { generated: 0, skipped: members.length };
  }

  // Generar predicciones aleatorias (0-10 para cada equipo)
  const predictionsToInsert = usersWithoutPrediction.map((userId) => ({
    polla_id: pollaId,
    match_id: matchId,
    user_id: userId,
    home_goals: Math.floor(Math.random() * 11), // 0-10
    away_goals: Math.floor(Math.random() * 11), // 0-10
    wildcard_used: null,
  }));

  const { error } = await admin.from('predictions').insert(predictionsToInsert);

  if (error) {
    console.error('Error generating random predictions:', error);
    return { generated: 0, skipped: members.length };
  }

  return {
    generated: predictionsToInsert.length,
    skipped: existingUserIds.size,
  };
}
