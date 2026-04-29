-- ============================================
-- 0011_fase1_core_game.sql
-- Fase 1: Core del juego
-- match_points, points_calculated en matches,
-- RLS, policies, GRANTs
-- ============================================

-- 1. Agregar points_calculated a matches
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS points_calculated BOOLEAN DEFAULT false;

-- 2. Tabla match_points (puntos por partido por jugador)
CREATE TABLE IF NOT EXISTS public.match_points (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  polla_id UUID REFERENCES public.pollas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(polla_id, user_id, match_id)
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_match_points_polla_user ON public.match_points(polla_id, user_id);
CREATE INDEX IF NOT EXISTS idx_match_points_match ON public.match_points(match_id);
CREATE INDEX IF NOT EXISTS idx_match_points_user ON public.match_points(user_id);

-- 4. RLS en match_points
ALTER TABLE public.match_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_points FORCE ROW LEVEL SECURITY;

-- SELECT: miembros de la polla pueden ver los puntos
CREATE POLICY "Match points viewable by polla members"
  ON public.match_points FOR SELECT
  USING (
    public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );

-- INSERT/UPDATE/DELETE: solo admin/service_role (operaciones de sistema)
-- El cliente normal no toca esta tabla directamente; el sync la escribe via admin client.
CREATE POLICY "Match points writable by admin"
  ON public.match_points FOR ALL
  USING (public.is_polla_admin(polla_id));

-- 5. GRANTs
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_points TO authenticated, service_role;
GRANT SELECT ON public.match_points TO anon;

GRANT UPDATE ON public.matches TO authenticated, service_role;

-- 6. Función para obtener hora del servidor (usada en validación de deadlines)
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Policy anti-trampa en predictions
-- Un jugador solo puede ver predicciones de OTROS cuando el partido ya empezó
DROP POLICY IF EXISTS "Users can view predictions after match started" ON public.predictions;
CREATE POLICY "Users can view predictions after match started"
  ON public.predictions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = predictions.match_id
      AND m.scheduled_at <= NOW()
    )
  );

-- 8. Actualizar matches para que points_calculated tenga índice
CREATE INDEX IF NOT EXISTS idx_matches_points_calculated ON public.matches(points_calculated)
WHERE points_calculated = false;
