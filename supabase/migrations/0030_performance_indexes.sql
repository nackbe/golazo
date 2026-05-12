-- ============================================
-- 0030_performance_indexes.sql
-- Índices críticos para escalar a 1000+ usuarios
-- + Constraint UNIQUE en ranking_history para idempotencia
-- + Tabla cron_locks para distributed locking
-- ============================================

-- 1. Acelera el cron de live sync (busca partidos sin calcular por torneo)
CREATE INDEX IF NOT EXISTS idx_matches_tournament_status_calculated
  ON public.matches(tournament_id, status, points_calculated)
  WHERE points_calculated = false;

-- 2. Acelera batch calculate (predicciones por polla + match)
CREATE INDEX IF NOT EXISTS idx_predictions_polla_match
  ON public.predictions(polla_id, match_id);

-- 3. Acelera recálculo de totales (match_points por polla + user)
CREATE INDEX IF NOT EXISTS idx_match_points_polla_user
  ON public.match_points(polla_id, user_id);

-- 4. Acelera recálculo de especiales (special_predictions por polla + user)
CREATE INDEX IF NOT EXISTS idx_special_predictions_polla_user
  ON public.special_predictions(polla_id, user_id);

-- 5. Acelera fixture list (partidos de torneo ordenados por fecha)
CREATE INDEX IF NOT EXISTS idx_matches_tournament_scheduled
  ON public.matches(tournament_id, scheduled_at DESC);

-- 6. Acelera ranking history queries
CREATE INDEX IF NOT EXISTS idx_ranking_history_polla_match
  ON public.ranking_history(polla_id, match_id);

-- 7. Constraint para prevenir duplicados en ranking_history
-- Nota: puede fallar si ya hay duplicados. Hacer cleanup primero si es necesario.
DO $$
BEGIN
  ALTER TABLE public.ranking_history
    ADD CONSTRAINT unique_ranking_snapshot
    UNIQUE (polla_id, user_id, match_id);
EXCEPTION
  WHEN duplicate_table THEN
    RAISE NOTICE 'Constraint already exists';
  WHEN unique_violation THEN
    RAISE WARNING 'Existing duplicates found in ranking_history. Run cleanup first.';
END $$;

-- 8. Tabla de locks para distributed cron locking
CREATE TABLE IF NOT EXISTS public.cron_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ NOT NULL,
  instance_id TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cron_locks TO service_role;

-- 9. Función RPC para recalcular totales de TODOS los miembros de una polla en una sola query
CREATE OR REPLACE FUNCTION public.recalculate_polla_totals(p_polla_id UUID)
RETURNS TABLE(user_id UUID, total_points INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH match_totals AS (
    SELECT mp.user_id, COALESCE(SUM(mp.points), 0)::INTEGER as total
    FROM public.match_points mp
    WHERE mp.polla_id = p_polla_id
    GROUP BY mp.user_id
  ),
  special_totals AS (
    SELECT sp.user_id, COALESCE(SUM(sp.points), 0)::INTEGER as total
    FROM public.special_predictions sp
    WHERE sp.polla_id = p_polla_id
    GROUP BY sp.user_id
  )
  SELECT
    pm.user_id,
    (COALESCE(mt.total, 0) + COALESCE(st.total, 0))::INTEGER as total_points
  FROM public.polla_members pm
  LEFT JOIN match_totals mt ON mt.user_id = pm.user_id
  LEFT JOIN special_totals st ON st.user_id = pm.user_id
  WHERE pm.polla_id = p_polla_id AND pm.status = 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalculate_polla_totals(UUID) TO service_role;
