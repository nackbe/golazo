'use server';

import { createClient } from '@/lib/supabase/server';
import { saveSetting, invalidateSettingsCache } from '@/lib/settings';

export async function updateSystemSetting(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_system_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_system_admin) {
    return { error: 'No tenés permisos de administrador.' };
  }

  const key = formData.get('key') as string;
  const valueStr = formData.get('value') as string;
  const description = formData.get('description') as string;
  const category = formData.get('category') as string;

  if (!key || !valueStr) {
    return { error: 'Key y value son requeridos.' };
  }

  try {
    const value = JSON.parse(valueStr);
    const result = await saveSetting(key, value, user.id, description, category);
    if (result.error) return { error: result.error };
    invalidateSettingsCache();
    return { success: true };
  } catch (e: any) {
    return { error: `JSON inválido: ${e.message}` };
  }
}
