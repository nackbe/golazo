'use server';

import { createClient } from '@/lib/supabase/server';

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'No estás autenticado. Intenta iniciar sesión de nuevo.' };
  }

  const alias = (formData.get('alias') as string)?.trim();

  if (!alias || alias.length < 2) {
    return { error: 'El alias debe tener al menos 2 caracteres.' };
  }

  // Usar RPC SECURITY DEFINER que bypass RLS pero valida auth.uid() internamente
  const { error } = await supabase.rpc('upsert_profile', {
    user_alias: alias,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
