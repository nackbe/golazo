'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getMaxPollasPerUser } from '@/lib/settings';

function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createPolla(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'No estás autenticado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name || name.length < 2) return { error: 'El nombre debe tener al menos 2 caracteres.' };

  // Admin client bypasses RLS — tournaments son datos de sistema
  const admin = createAdminClient();

  // Límite de pollas por usuario (lee desde system_settings)
  const maxPollas = await getMaxPollasPerUser();
  const { count: pollasCount } = await admin
    .from('pollas')
    .select('*', { count: 'exact' })
    .eq('admin_id', user.id);

  if (pollasCount && pollasCount >= maxPollas) {
    return { error: `Límite alcanzado: no podés crear más de ${maxPollas} pollas.` };
  }

  // Torneo por defecto: FIFA World Cup 2026 (api_football_id=1, season=2026)
  const DEFAULT_API_ID = 1;
  const DEFAULT_SEASON = '2026';

  const { data: existingTournament } = await admin
    .from('tournaments')
    .select('id')
    .eq('api_football_id', DEFAULT_API_ID)
    .eq('season', DEFAULT_SEASON)
    .maybeSingle();

  let tournamentId = existingTournament?.id;

  if (!tournamentId) {
    const { data: newTournament, error: tError } = await admin
      .from('tournaments')
      .insert({
        name: 'FIFA World Cup',
        season: DEFAULT_SEASON,
        api_football_id: DEFAULT_API_ID,
        country: 'World',
        type: 'Cup',
        start_date: '2026-06-11',
        end_date: '2026-07-19',
        status: 'upcoming',
      })
      .select('id')
      .single();

    if (tError || !newTournament) {
      return { error: tError?.message || 'No se pudo crear el torneo por defecto.' };
    }
    tournamentId = newTournament.id;
  }

  // Generar código único (usando admin para leer sin RLS)
  let code = generateCode();
  for (let i = 0; i < 10; i++) {
    const { data: existing } = await admin
      .from('pollas')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!existing) break;
    code = generateCode();
  }

  // Crear polla como el usuario autenticado (respeta RLS de INSERT)
  const { data: polla, error: pollaError } = await supabase
    .from('pollas')
    .insert({ name, code, tournament_id: tournamentId, admin_id: user.id, status: 'draft' })
    .select('id')
    .single();

  if (pollaError || !polla) {
    return { error: pollaError?.message || 'Error al crear la polla.' };
  }

  // Agregar al admin como miembro aprobado
  const { data: profile } = await supabase
    .from('profiles')
    .select('alias')
    .eq('id', user.id)
    .maybeSingle();

  await supabase.from('polla_members').insert({
    polla_id: polla.id,
    user_id: user.id,
    alias: profile?.alias || user.email?.split('@')[0] || 'Admin',
    status: 'approved',
  });

  redirect(`/pollas/${polla.id}/configurar`);
}
