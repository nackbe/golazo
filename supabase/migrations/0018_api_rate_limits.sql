-- ============================================
-- Rate limiting y controles de abuso
-- ============================================

-- 1. Tabla de logs de uso de API
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_action
  ON public.api_usage_logs(user_id, action, created_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_identifier_action
  ON public.api_usage_logs(identifier, action, created_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at
  ON public.api_usage_logs(created_at);

-- 2. Permisos (solo service_role inserta)
GRANT SELECT, INSERT ON TABLE public.api_usage_logs TO service_role;

-- 3. Función para verificar rate limit por identificador (user_id o IP)
-- Retorna TRUE si puede ejecutar la acción (no ha excedido el límite)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_count INTEGER,
  p_interval_minutes INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.api_usage_logs
  WHERE identifier = p_identifier
    AND action = p_action
    AND created_at >= NOW() - (p_interval_minutes || ' minutes')::INTERVAL;

  RETURN v_count < p_max_count;
END;
$$;

-- 4. Función para registrar uso de API
CREATE OR REPLACE FUNCTION public.log_api_usage(
  p_identifier TEXT,
  p_action TEXT,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.api_usage_logs (identifier, user_id, action, metadata)
  VALUES (p_identifier, p_user_id, p_action, p_metadata);
END;
$$;
