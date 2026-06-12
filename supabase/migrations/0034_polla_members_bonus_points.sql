-- Migration 0034 — Baseline bonus points per polla member
--
-- Use case: cuando un admin necesita inyectar puntos iniciales para una polla
-- (por ej. para recuperar manualmente ranking perdido tras un cascade DELETE),
-- los necesitamos sumados al total y preservados a través de futuros recalcs.
--
-- Sin esta columna, set manual de polla_members.total_points se sobreescribe
-- la próxima vez que el cron llama a recalculate_polla_totals.

-- 1. Columna nueva
ALTER TABLE public.polla_members
  ADD COLUMN IF NOT EXISTS bonus_points INTEGER NOT NULL DEFAULT 0;

-- 2. Actualizar RPC: total_points = bonus_points + sum(match_points) + sum(special_predictions)
DROP FUNCTION IF EXISTS public.recalculate_polla_totals(UUID);

CREATE OR REPLACE FUNCTION public.recalculate_polla_totals(p_polla_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.polla_members pm
  SET total_points = COALESCE(pm.bonus_points, 0)
                     + COALESCE((
                         SELECT SUM(mp.points)
                         FROM public.match_points mp
                         WHERE mp.polla_id = pm.polla_id
                           AND mp.user_id = pm.user_id
                       ), 0)
                     + COALESCE((
                         SELECT SUM(sp.points)
                         FROM public.special_predictions sp
                         WHERE sp.polla_id = pm.polla_id
                           AND sp.user_id = pm.user_id
                       ), 0)
  WHERE pm.polla_id = p_polla_id
    AND pm.status = 'approved';
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_polla_totals(UUID) TO authenticated, service_role;
