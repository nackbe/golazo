-- ============================================
-- 0031_rpc_recalculate_totals.sql
-- RPC optimizado: recalcula totales de TODOS los miembros
-- en una sola transacción SQL (sin N+1 updates desde el cliente).
-- Reemplaza la versión legacy de 0030 que solo hacía RETURN QUERY.
-- ============================================

-- PostgreSQL no permite CREATE OR REPLACE si cambia el tipo de retorno
DROP FUNCTION IF EXISTS public.recalculate_polla_totals(UUID);

CREATE OR REPLACE FUNCTION public.recalculate_polla_totals(p_polla_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Calcular totales de match_points + special_predictions
  -- 2. Actualizar polla_members en una sola query
  WITH match_totals AS (
    SELECT mp.user_id, COALESCE(SUM(mp.points), 0) as total
    FROM public.match_points mp
    WHERE mp.polla_id = p_polla_id
    GROUP BY mp.user_id
  ),
  special_totals AS (
    SELECT sp.user_id, COALESCE(SUM(sp.points), 0) as total
    FROM public.special_predictions sp
    WHERE sp.polla_id = p_polla_id
    GROUP BY sp.user_id
  ),
  computed AS (
    SELECT
      pm.user_id,
      (COALESCE(mt.total, 0) + COALESCE(st.total, 0))::INTEGER as total_points
    FROM public.polla_members pm
    LEFT JOIN match_totals mt ON mt.user_id = pm.user_id
    LEFT JOIN special_totals st ON st.user_id = pm.user_id
    WHERE pm.polla_id = p_polla_id
      AND pm.status = 'approved'
  )
  UPDATE public.polla_members pm
  SET total_points = c.total_points
  FROM computed c
  WHERE pm.polla_id = p_polla_id
    AND pm.user_id = c.user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalculate_polla_totals(UUID) TO service_role;
