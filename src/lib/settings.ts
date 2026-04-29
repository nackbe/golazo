import { createAdminClient } from '@/lib/supabase/admin';

let cachedSettings: Record<string, any> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto de cache

/**
 * Lee un setting del sistema desde la base de datos.
 * Usa cache en memoria para no pegarle a la BD en cada request.
 */
export async function getSetting<T = any>(
  key: string,
  defaultValue?: T
): Promise<T | undefined> {
  const settings = await getAllSettings();
  const value = settings[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Lee todos los settings del sistema. Cachea por 1 minuto.
 */
export async function getAllSettings(): Promise<Record<string, any>> {
  if (cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('system_settings')
    .select('key, value');

  if (error) {
    console.error('Error leyendo system_settings:', error);
    return cachedSettings || {};
  }

  const settings: Record<string, any> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  cachedSettings = settings;
  cachedAt = Date.now();
  return settings;
}

/**
 * Invalida el cache de settings. Llamar después de guardar un setting.
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cachedAt = 0;
}

/**
 * Guarda (o actualiza) un setting del sistema.
 * Solo usable por admin.
 */
export async function saveSetting(
  key: string,
  value: any,
  userId?: string,
  description?: string,
  category?: string
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('system_settings')
    .upsert(
      {
        key,
        value,
        description,
        category: category || 'general',
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    return { error: error.message };
  }

  invalidateSettingsCache();
  return {};
}

// ── Helpers tipados para settings comunes ──

export async function getRateLimitConfig(
  action: 'load_fixtures' | 'sync_fixtures' | 'search_leagues' | 'get_rounds' | 'recalculate_points'
): Promise<{ maxCount: number; intervalMinutes: number }> {
  const defaults: Record<string, { maxCount: number; intervalMinutes: number }> = {
    load_fixtures: { maxCount: 5, intervalMinutes: 60 },
    sync_fixtures: { maxCount: 10, intervalMinutes: 60 },
    search_leagues: { maxCount: 20, intervalMinutes: 10 },
    get_rounds: { maxCount: 10, intervalMinutes: 60 },
    recalculate_points: { maxCount: 10, intervalMinutes: 10 },
  };

  const config = await getSetting<{ maxCount: number; intervalMinutes: number }>(
    `rate_limit_${action}`,
    defaults[action]
  );
  return config || defaults[action];
}

export async function getMaxPollasPerUser(): Promise<number> {
  const config = await getSetting<{ value: number }>('max_pollas_per_user', { value: 10 });
  return config?.value ?? 10;
}

export async function getMaxFixturesLoad(): Promise<number> {
  const config = await getSetting<{ value: number }>('max_fixtures_load', { value: 500 });
  return config?.value ?? 500;
}
