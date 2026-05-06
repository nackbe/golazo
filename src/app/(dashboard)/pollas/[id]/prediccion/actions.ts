'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Validar que el partido exista y pertenezca al torneo de la polla
  const { data: matchPolla } = await supabase
    .from('matches')
    .select('id, scheduled_at, tournament_id')
    .eq('id', matchId)
    .single();

  if (!matchPolla) return { error: 'Partido no encontrado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, bet_deadline_minutes, tournament_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla) return { error: 'Polla no encontrada.' };
  if (polla.status === 'draft') {
    return { error: 'La polla aún no ha iniciado. El administrador debe activarla desde Configuración.' };
  }
  if (matchPolla.tournament_id !== polla.tournament_id) {
    return { error: 'El partido no pertenece a esta polla.' };
  }

  // Validar deadline con hora del servidor (PostgreSQL)
  const admin = createAdminClient();
  const { data: nowData } = await admin.rpc('get_server_time');
  const serverNow = new Date(nowData || new Date().toISOString());
  const deadline = new Date(matchPolla.scheduled_at);
  deadline.setMinutes(deadline.getMinutes() - (polla.bet_deadline_minutes || 60));

  if (serverNow >= deadline) {
    return { error: 'El plazo de apuestas para este partido ya cerró.' };
  }

  // Validar comodines disponibles
  if (wildcard) {
    const { data: playerWildcards } = await admin
      .from('predictions')
      .select('wildcard_used, match_id')
      .eq('polla_id', pollaId)
      .eq('user_id', user.id)
      .not('wildcard_used', 'is', null);

    const { data: pollaWildcards } = await admin
      .from('pollas')
      .select('wildcards')
      .eq('id', pollaId)
      .single();

    const totalX2 = (pollaWildcards?.wildcards as any)?.find((w: any) => w.type === 'x2')?.quantity ?? 2;
    const totalX3 = (pollaWildcards?.wildcards as any)?.find((w: any) => w.type === 'x3')?.quantity ?? 1;

    const usedX2 = (playerWildcards || []).filter((w) => w.wildcard_used === 'x2' && w.match_id !== matchId).length;
    const usedX3 = (playerWildcards || []).filter((w) => w.wildcard_used === 'x3' && w.match_id !== matchId).length;

    if (wildcard === 'x2' && usedX2 >= totalX2) {
      return { error: 'No tenés comodines x2 disponibles.' };
    }
    if (wildcard === 'x3' && usedX3 >= totalX3) {
      return { error: 'No tenés comodines x3 disponibles.' };
    }
  }

  // Upsert predicción
  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        polla_id: pollaId,
        user_id: user.id,
        match_id: matchId,
        home_goals: homeGoals,
        away_goals: awayGoals,
        wildcard_used: wildcard as 'x2' | 'x3' | null,
      },
      { onConflict: 'user_id, polla_id, match_id' }
    );

  if (error) return { error: error.message };

  return { success: true };
}
