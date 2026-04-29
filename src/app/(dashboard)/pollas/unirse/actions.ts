'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function joinPolla(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'No estás autenticado.' };
  }

  const code = (formData.get('code') as string)?.trim().toUpperCase();
  if (!code || code.length !== 6) {
    return { error: 'Ingresá un código de 6 caracteres.' };
  }

  // Buscar polla por código — admin client porque el usuario aún no es miembro
  const admin = createAdminClient();
  const { data: pollas, error: pollasError } = await admin
    .from('pollas')
    .select('id, name, auto_approve, admin_id')
    .eq('code', code)
    .single();

  if (pollasError || !pollas) {
    return { error: 'No existe una polla con ese código.' };
  }

  // Verificar si ya es miembro
  const { data: existingMember } = await supabase
    .from('polla_members')
    .select('id, status')
    .eq('polla_id', pollas.id)
    .eq('user_id', user.id)
    .single();

  if (existingMember) {
    if (existingMember.status === 'approved') {
      redirect(`/pollas/${pollas.id}`);
    }
    return { error: 'Ya enviaste una solicitud para unirte a esta polla. Esperá la aprobación del admin.' };
  }

  // Obtener alias del perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('alias')
    .eq('id', user.id)
    .single();

  const memberAlias = profile?.alias || user.email?.split('@')[0] || 'Jugador';
  const status = pollas.auto_approve ? 'approved' : 'pending';

  const { error: insertError } = await supabase.from('polla_members').insert({
    polla_id: pollas.id,
    user_id: user.id,
    alias: memberAlias,
    status,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  if (status === 'approved') {
    redirect(`/pollas/${pollas.id}`);
  }

  return { success: true, message: 'Solicitud enviada. El admin debe aprobarte.' };
}
