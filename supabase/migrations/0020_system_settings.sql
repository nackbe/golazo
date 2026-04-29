-- ============================================
-- Configuración del sistema y rol de admin
-- ============================================

-- 1. Rol de administrador del sistema en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN DEFAULT false;

-- 2. Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_system_settings_category
  ON public.system_settings(category);

-- 4. Permisos
GRANT SELECT ON TABLE public.system_settings TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.system_settings TO service_role;

-- 5. Seed: valores actuales del sistema
INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('rate_limit_load_fixtures', '{"maxCount": 5, "intervalMinutes": 60}', 'Límite de cargas de fixtures por usuario por hora', 'rate_limit'),
  ('rate_limit_sync_fixtures', '{"maxCount": 10, "intervalMinutes": 60}', 'Límite de sincronizaciones de fixtures por usuario por hora', 'rate_limit'),
  ('rate_limit_search_leagues', '{"maxCount": 20, "intervalMinutes": 10}', 'Límite de búsquedas de ligas por IP cada 10 minutos', 'rate_limit'),
  ('rate_limit_get_rounds', '{"maxCount": 10, "intervalMinutes": 60}', 'Límite de consultas de rounds por IP por hora', 'rate_limit'),
  ('rate_limit_recalculate_points', '{"maxCount": 10, "intervalMinutes": 10}', 'Límite de recálculos de puntos por usuario cada 10 minutos', 'rate_limit'),
  ('max_pollas_per_user', '{"value": 10}', 'Máximo de pollas que puede crear un usuario', 'game'),
  ('max_fixtures_load', '{"value": 500}', 'Máximo de partidos a cargar de una sola vez desde la API', 'game'),
  ('cron_sync_interval_minutes', '{"value": 2}', 'Frecuencia del cron en minutos (debe coincidir con cron-job.org)', 'cron'),
  ('cron_fixture_sync_interval_hours', '{"value": 6}', 'Intervalo en horas para sincronización automática de fixtures nuevos en el cron', 'cron'),
  ('api_football_daily_limit', '{"value": 7500}', 'Límite diario de requests a API-Football', 'api')
ON CONFLICT (key) DO NOTHING;
