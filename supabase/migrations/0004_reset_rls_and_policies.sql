-- ============================================
-- 0004_reset_rls_and_policies.sql
-- Limpieza total de RLS + policies y recreación
-- desde cero. Ejecutar esto si sigue fallando
-- con "permission denied".
-- ============================================

-- ------------------------------------------------------
-- 1. Desactivar RLS en todas las tablas
-- ------------------------------------------------------
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pollas DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS polla_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS special_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ranking_history DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------
-- 2. Borrar TODAS las policies existentes (las nuestras
--    y cualquiera que Supabase haya creado por defecto)
-- ------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON profiles;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON profiles;
DROP POLICY IF EXISTS "Enable all for users based on user_id" ON profiles;

DROP POLICY IF EXISTS "Pollas viewable by members" ON pollas;
DROP POLICY IF EXISTS "Admin can update polla" ON pollas;
DROP POLICY IF EXISTS "Users can create pollas" ON pollas;
DROP POLICY IF EXISTS "Enable read access for all users" ON pollas;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON pollas;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON pollas;

DROP POLICY IF EXISTS "Users can join pollas" ON polla_members;
DROP POLICY IF EXISTS "Users can view own memberships" ON polla_members;
DROP POLICY IF EXISTS "Enable read access for all users" ON polla_members;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON polla_members;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON polla_members;

DROP POLICY IF EXISTS "Users can manage own predictions" ON predictions;
DROP POLICY IF EXISTS "Users can view predictions after match started" ON predictions;
DROP POLICY IF EXISTS "Users can insert predictions" ON predictions;
DROP POLICY IF EXISTS "Enable read access for all users" ON predictions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON predictions;

DROP POLICY IF EXISTS "Users can insert special predictions" ON special_predictions;
DROP POLICY IF EXISTS "Users can view special predictions" ON special_predictions;
DROP POLICY IF EXISTS "Enable read access for all users" ON special_predictions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON special_predictions;

DROP POLICY IF EXISTS "System can insert ranking history" ON ranking_history;
DROP POLICY IF EXISTS "Users can view ranking history" ON ranking_history;
DROP POLICY IF EXISTS "Enable read access for all users" ON ranking_history;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON ranking_history;

-- ------------------------------------------------------
-- 3. Reactivar RLS
-- ------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pollas ENABLE ROW LEVEL SECURITY;
ALTER TABLE polla_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_history ENABLE ROW LEVEL SECURITY;

-- Forzar que RLS aplique incluso al table owner (buena práctica)
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE pollas FORCE ROW LEVEL SECURITY;
ALTER TABLE polla_members FORCE ROW LEVEL SECURITY;
ALTER TABLE predictions FORCE ROW LEVEL SECURITY;
ALTER TABLE special_predictions FORCE ROW LEVEL SECURITY;
ALTER TABLE ranking_history FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------
-- 4. Funciones helper SECURITY DEFINER
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
-- 5. Profiles: policies
-- ------------------------------------------------------
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ------------------------------------------------------
-- 6. Pollas: policies
-- ------------------------------------------------------
CREATE POLICY "Pollas viewable by members"
  ON pollas FOR SELECT USING (
    admin_id = auth.uid()
    OR public.is_polla_member(id)
  );

CREATE POLICY "Users can create pollas"
  ON pollas FOR INSERT WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admin can update polla"
  ON pollas FOR UPDATE USING (admin_id = auth.uid());

-- ------------------------------------------------------
-- 7. Polla members: policies
-- ------------------------------------------------------
CREATE POLICY "Users can view own memberships"
  ON polla_members FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_admin(polla_id)
  );

CREATE POLICY "Users can join pollas"
  ON polla_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------
-- 8. Predictions: policies
-- ------------------------------------------------------
CREATE POLICY "Users can view own predictions"
  ON predictions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view predictions after match started"
  ON predictions FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m WHERE m.id = predictions.match_id AND m.status != 'NS'
    )
  );

CREATE POLICY "Users can insert predictions"
  ON predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own predictions"
  ON predictions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own predictions"
  ON predictions FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------
-- 9. Special predictions: policies
-- ------------------------------------------------------
CREATE POLICY "Users can view special predictions"
  ON special_predictions FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );

CREATE POLICY "Users can insert special predictions"
  ON special_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own special predictions"
  ON special_predictions FOR UPDATE USING (user_id = auth.uid());

-- ------------------------------------------------------
-- 10. Ranking history: policies
-- ------------------------------------------------------
CREATE POLICY "Users can view ranking history"
  ON ranking_history FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );

CREATE POLICY "System can insert ranking history"
  ON ranking_history FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------
-- 11. Trigger: auto-crear perfil al registrar usuario
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
-- 12. Backfill: crear perfil para usuarios existentes sin uno
-- ------------------------------------------------------
INSERT INTO public.profiles (id, alias, avatar_url)
SELECT id, NULL, NULL FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE profiles.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;
