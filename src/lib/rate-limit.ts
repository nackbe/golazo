import { createAdminClient } from '@/lib/supabase/admin';
import { getRateLimitConfig, getSetting } from '@/lib/settings';

export type ApiAction =
  | 'load_fixtures'
  | 'sync_fixtures'
  | 'search_leagues'
  | 'get_rounds'
  | 'recalculate_points';

/**
 * Verifica si un identificador puede ejecutar una acción sin exceder el rate limit.
 * Lee la configuración desde system_settings (con fallback a defaults).
 * Retorna { allowed: true } si puede proceder, o { allowed: false, retryAfterMinutes } si no.
 */
export async function checkRateLimit(
  identifier: string,
  action: ApiAction
): Promise<{ allowed: boolean; retryAfterMinutes?: number; currentCount: number }> {
  const admin = createAdminClient();
  const config = await getRateLimitConfig(action);

  const { data, error } = await admin.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_action: action,
    p_max_count: config.maxCount,
    p_interval_minutes: config.intervalMinutes,
  });

  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, currentCount: 0 };
  }

  const allowed = data === true;

  if (!allowed) {
    const { data: oldest } = await admin
      .from('api_usage_logs')
      .select('created_at')
      .eq('identifier', identifier)
      .eq('action', action)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    let retryAfterMinutes = config.intervalMinutes;
    if (oldest?.created_at) {
      const oldestDate = new Date(oldest.created_at);
      const expiresAt = new Date(oldestDate.getTime() + config.intervalMinutes * 60_000);
      const now = new Date();
      retryAfterMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000));
    }

    return { allowed: false, retryAfterMinutes, currentCount: config.maxCount };
  }

  return { allowed: true, currentCount: 0 };
}

/**
 * Registra un uso de API en el log.
 */
export async function logApiUsage(
  identifier: string,
  action: ApiAction,
  userId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc('log_api_usage', {
    p_identifier: identifier,
    p_action: action,
    p_user_id: userId || null,
    p_metadata: metadata || null,
  });
}

/**
 * Extrae la IP del request para usar como identificador en API routes.
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  return `ip_${ip}`;
}
