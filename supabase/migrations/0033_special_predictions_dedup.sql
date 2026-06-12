-- Migration 0033 — Fix special_predictions data integrity
--
-- Bug observado en producción: la polla CNWFT9 tenía usuarios con 12 ó 18
-- filas en special_predictions cuando deberían ser máximo 6 (una por tipo).
-- Causa: la action `saveSpecialPredictions` hace DELETE + INSERT como user,
-- pero RLS de special_predictions no tiene policy DELETE → el delete falla
-- silencioso y el insert duplica filas.
--
-- Fix en 3 capas:
--   1. Limpiar duplicados existentes (conservar la fila más reciente por
--      (polla_id, user_id, type)).
--   2. UNIQUE constraint (polla_id, user_id, type) para que futuras
--      ocurrencias del bug fallen con ON CONFLICT en lugar de duplicar.
--   3. Policy RLS DELETE para que la action funcione como dueño.

-- ============================================================
-- 1. Dedup: conservar el id máximo por (polla_id, user_id, type)
-- ============================================================
DELETE FROM public.special_predictions sp1
USING public.special_predictions sp2
WHERE sp1.polla_id = sp2.polla_id
  AND sp1.user_id = sp2.user_id
  AND sp1.type = sp2.type
  AND sp1.id < sp2.id;

-- ============================================================
-- 2. UNIQUE constraint
-- ============================================================
ALTER TABLE public.special_predictions
  ADD CONSTRAINT special_predictions_unique_user_type
  UNIQUE (polla_id, user_id, type);

-- ============================================================
-- 3. RLS policy DELETE — el dueño puede borrar sus filas
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own special predictions" ON public.special_predictions;
CREATE POLICY "Users can delete own special predictions"
  ON public.special_predictions FOR DELETE USING (user_id = auth.uid());
