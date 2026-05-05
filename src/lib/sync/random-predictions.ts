import { createAdminClient } from '@/lib/supabase/admin';

export interface RandomPrediction {
  polla_id: string;
  match_id: string;
  user_id: string;
  home_goals: number;
  away_goals: number;
  wildcard_used: null;
}

/**
 * Función pura: filtra usuarios que aún no tienen predicción.
 */
export function filterUsersWithoutPrediction(
  members: Array<{ user_id: string }>,
  existingUserIds: Set<string>
): string[] {
  return members.map((m) => m.user_id).filter((userId) => !existingUserIds.has(userId));
}

/**
 * Función pura: construye predicciones aleatorias (0-10) para una lista de userIds.
 * Acepta un generador de números aleatorios opcional para testear.
 */
export function buildRandomPredictions(
  userIds: string[],
  pollaId: string,
  matchId: string,
  rng: () => number = Math.random
): RandomPrediction[] {
  return userIds.map((userId) => ({
    polla_id: pollaId,
    match_id: matchId,
    user_id: userId,
    home_goals: Math.floor(rng() * 11),
    away_goals: Math.floor(rng() * 11),
    wildcard_used: null,
  }));
}

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

  const { data: polla } = await admin
    .from('pollas')
    .select('auto_random_prediction')
    .eq('id', pollaId)
    .single();

  if (!polla?.auto_random_prediction) {
    return { generated: 0, skipped: 0 };
  }

  const { data: members } = await admin
    .from('polla_members')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('status', 'approved');

  if (!members || members.length === 0) {
    return { generated: 0, skipped: 0 };
  }

  const { data: existingPredictions } = await admin
    .from('predictions')
    .select('user_id')
    .eq('polla_id', pollaId)
    .eq('match_id', matchId);

  const existingUserIds = new Set(existingPredictions?.map((p) => p.user_id) || []);
  const usersWithoutPrediction = filterUsersWithoutPrediction(members, existingUserIds);

  if (usersWithoutPrediction.length === 0) {
    return { generated: 0, skipped: members.length };
  }

  const predictionsToInsert = buildRandomPredictions(usersWithoutPrediction, pollaId, matchId);

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
