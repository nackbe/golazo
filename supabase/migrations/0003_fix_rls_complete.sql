-- ============================================
-- 0003_fix_rls_complete.sql
-- Arregla policies RLS, error 42P01 en pollas,
-- y onboarding con Google OAuth
-- ============================================

-- ------------------------------------------------------
-- 1. Funciones helper SECURITY DEFINER
--    Evitan errores de RLS anidado (42P01) cuando una
--    policy referencia otra tabla que tambien tiene RLS.
--    SECURITY DEFINER ejecuta con privilegios del owner
--    (postgres), asi que bypass RLS en la subconsulta.
-- ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_polla_member(polla_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.polla_members
    WHERE polla_id = polla_uuid
      AND user_id = auth.uid()
      AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_polla_admin(polla_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.pollas
    WHERE id = polla_uuid AND admin_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------
-- 2. Reescribir policy de SELECT en pollas
--    Usa la funcion helper en vez de subconsulta
--    correlacionada directa sobre polla_members.
-- ------------------------------------------------------

DROP POLICY IF EXISTS "Pollas viewable by members" ON pollas;
CREATE POLICY "Pollas viewable by members" ON pollas
  FOR SELECT USING (
    admin_id = auth.uid()
    OR public.is_polla_member(id)
  );

-- ------------------------------------------------------
-- 3. Agregar policies SELECT faltantes
-- ------------------------------------------------------

-- Polla members: un usuario puede ver sus propias membresias
-- y las membresias de las pollas donde es admin.
DROP POLICY IF EXISTS "Users can view own memberships" ON polla_members;
CREATE POLICY "Users can view own memberships" ON polla_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_admin(polla_id)
  );

-- Special predictions: ver las propias y las de pollas donde participa.
DROP POLICY IF EXISTS "Users can view special predictions" ON special_predictions;
CREATE POLICY "Users can view special predictions" ON special_predictions
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );

-- Ranking history: ver el propio y el de pollas donde participa.
DROP POLICY IF EXISTS "Users can view ranking history" ON ranking_history;
CREATE POLICY "Users can view ranking history" ON ranking_history
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );

-- ------------------------------------------------------
-- 4. Trigger: auto-crear perfil al registrar usuario
--    Esto resuelve definitivamente el "permission denied"
--    en onboarding con Google OAuth.
-- ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, alias, avatar_url)
  VALUES (NEW.id, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------
-- 5. Backfill: crear perfil para usuarios existentes
--    que no tengan uno (por si ya hay logins previos).
-- ------------------------------------------------------

INSERT INTO public.profiles (id, alias, avatar_url)
SELECT id, NULL, NULL FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE profiles.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;
