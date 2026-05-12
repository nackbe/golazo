-- ============================================
-- 0028_rls_cleanup.sql
-- Activa RLS en tablas faltantes para silenciar
-- alerta de Supabase. CERO cambios funcionales.
--
-- Seguridad: solo tablas que no afectan el flujo
-- de usuarios. Las tablas críticas de negocio NO se tocan.
-- ============================================

-- 1. api_usage_logs
--    La app NUNCA accede directamente a esta tabla.
--    Solo se usa via funciones RPC SECURITY DEFINER:
--      - check_rate_limit()
--      - log_api_usage()
--    SECURITY DEFINER ejecuta como postgres, bypass RLS.
--    Activar RLS aquí no cambia NADA del funcionamiento.
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- 2. system_settings
--    Lectura: lib/settings.ts usa createAdminClient() (service_role).
--    Escritura: lib/settings.ts usa createAdminClient() (service_role).
--    GRANTs ya restringen INSERT/UPDATE/DELETE a service_role.
--    Activar RLS + policy SELECT publica mantiene el mismo comportamiento.
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_select_public"
  ON public.system_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Nota: no se activa FORCE RLS en ninguna tabla.
-- service_role necesita bypass RLS para las operaciones de admin y cron.
