'use server';

import { createClient } from '@/lib/supabase/server';

export async function savePrediction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const pollaId = formData.get('polla_id') as string;
  const matchId = formData.get('match_id') as string;
  const homeGoals = parseInt(formData.get('home_goals') as string, 10);
  const awayGoals = parseInt(formData.get('away_goals') as string, 10);
  const wildcard = (formData.get('wildcard') as string) || null;

  if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    return { error: 'Marcador inválido.' };
  }

  // Validar membresía
  const { data: membership } = await supabase
    .from('polla_members')
    .select('status')
    .eq('polla_id', pollaId)
    .eq('user_id', user.id)
    .single();

  if (membership?.status !== 'approved') {
    return { error: 'No sos miembro aprobado de esta polla.' };
  }

  // Todo lo demás (deadline, comodines, upsert) se hace atómicamente via RPC
  // para eliminar la race condition de read-then-write en comodines.
  const { data: result, error: rpcError } = await supabase.rpc(
    'save_prediction_atomic',
    {
      p_polla_id: pollaId,
      p_user_id: user.id,
      p_match_id: matchId,
      p_home_goals: homeGoals,
      p_away_goals: awayGoals,
      p_wildcard: wildcard,
    }
  );

  if (rpcError) {
    return { error: rpcError.message };
  }

  // La RPC devuelve un JSONB con 'success' o 'error'
  const payload = result as { success?: boolean; error?: string } | null;
  if (payload?.error) {
    return { error: payload.error };
  }

  if (!payload?.success) {
    return { error: 'Error desconocido al guardar la predicción.' };
  }

  return { success: true };
}
