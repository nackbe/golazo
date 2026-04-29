-- ============================================
-- Optimizaciones del cron: seguimiento de sync
-- ============================================

-- 1. Agregar timestamp de última sincronización de fixtures por torneo
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS last_fixture_sync_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_last_fixture_sync
  ON public.tournaments(last_fixture_sync_at)
  WHERE last_fixture_sync_at IS NOT NULL;

-- 2. Permisos
GRANT SELECT, UPDATE ON TABLE public.tournaments TO service_role;
