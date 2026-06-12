'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function getSpecialPredictions(pollaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data } = await supabase
    .from('special_predictions')
    .select('*, team:teams(name, logo_url)')
    .eq('polla_id', pollaId)
    .eq('user_id', user.id);

  return { predictions: data || [] };
}

export async function saveSpecialPredictions(pollaId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  // Verificar membresía
  const { data: membership } = await supabase
    .from('polla_members')
    .select('status')
    .eq('polla_id', pollaId)
    .eq('user_id', user.id)
    .single();

  if (membership?.status !== 'approved') {
    return { error: 'No sos miembro aprobado de esta polla.' };
  }

  // Obtener polla y torneo para validar deadline
  const { data: polla } = await supabase
    .from('pollas')
    .select('tournament_id')
    .eq('id', pollaId)
    .single();

  if (!polla) return { error: 'Polla no encontrada.' };

  // Validar: solo antes del primer partido
  const admin = createAdminClient();
  const { data: firstMatch } = await admin
    .from('matches')
    .select('scheduled_at')
    .eq('tournament_id', polla.tournament_id)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .single();

  if (firstMatch) {
    const { data: serverTime } = await supabase.rpc('get_server_time');
    const now = new Date(serverTime as string);
    const matchTime = new Date(firstMatch.scheduled_at);
    if (now >= matchTime) {
      return { error: 'El plazo para predicciones especiales ya cerró. Se cierra antes del primer partido.' };
    }
  }

  // Procesar datos del formulario
  const champion = formData.get('champion') as string;
  const finalist = formData.get('finalist') as string;
  const thirdPlace = formData.get('third_place') as string;
  const leastGoalsAgainst = formData.get('least_goals_against') as string;
  const worstTeam = formData.get('worst_team') as string;
  const topScorerTeam = formData.get('top_scorer_team') as string;

  const predictionsToInsert = [];

  if (champion) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'champion',
      team_id: champion,
    });
  }

  if (finalist) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'finalist',
      team_id: finalist,
    });
  }

  if (thirdPlace) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'third_place',
      team_id: thirdPlace,
    });
  }

  if (leastGoalsAgainst) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'least_goals_against',
      team_id: leastGoalsAgainst,
    });
  }

  if (worstTeam) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'worst_team',
      team_id: worstTeam,
    });
  }

  if (topScorerTeam) {
    predictionsToInsert.push({
      polla_id: pollaId,
      user_id: user.id,
      type: 'top_scorer_team',
      team_id: topScorerTeam,
    });
  }

  if (predictionsToInsert.length === 0) {
    return { error: 'Tenés que completar al menos una predicción.' };
  }

  // Borrar predicciones anteriores del usuario para esta polla (permite editar).
  // Usamos admin client porque RLS de special_predictions no tiene policy DELETE
  // y el delete del usuario fallaba silencioso → insert duplicaba filas
  // (bug observado en polla CNWFT9, 156 duplicados).
  const { error: delError } = await admin
    .from('special_predictions')
    .delete()
    .eq('polla_id', pollaId)
    .eq('user_id', user.id);
  if (delError) return { error: delError.message };

  const { error } = await supabase.from('special_predictions').insert(predictionsToInsert);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}`);
  return { success: true };
}
