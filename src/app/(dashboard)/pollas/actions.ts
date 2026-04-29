'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function deletePolla(pollaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) {
    return { error: 'No tenés permisos para borrar esta polla.' };
  }

  const admin = createAdminClient();

  // Limpiar datos relacionados manualmente (por si CASCADE falla por RLS)
  await admin.from('predictions').delete().eq('polla_id', pollaId);
  await admin.from('special_predictions').delete().eq('polla_id', pollaId);
  await admin.from('match_points').delete().eq('polla_id', pollaId);
  await admin.from('ranking_history').delete().eq('polla_id', pollaId);
  await admin.from('polla_members').delete().eq('polla_id', pollaId);

  const { error } = await admin.from('pollas').delete().eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath('/pollas');
  return { success: true };
}
