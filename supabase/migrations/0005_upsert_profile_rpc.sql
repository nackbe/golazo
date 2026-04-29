-- ============================================
-- 0005_upsert_profile_rpc.sql
-- Funcion RPC SECURITY DEFINER para crear/actualizar
-- perfil sin depender de policies INSERT/UPDATE.
-- Bypass RLS por completo pero valida auth.uid().
-- ============================================

CREATE OR REPLACE FUNCTION public.upsert_profile(user_alias TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.profiles (id, alias, avatar_url)
  VALUES (auth.uid(), user_alias, NULL)
  ON CONFLICT (id) DO UPDATE
  SET alias = EXCLUDED.alias,
      avatar_url = EXCLUDED.avatar_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar que el trigger de signup siga existiendo (idempotente)
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
