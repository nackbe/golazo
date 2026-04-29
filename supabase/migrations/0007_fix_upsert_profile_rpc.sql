-- Fix upsert_profile: solo actualiza alias, no sobreescribe avatar_url
CREATE OR REPLACE FUNCTION public.upsert_profile(user_alias TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.profiles (id, alias)
  VALUES (auth.uid(), user_alias)
  ON CONFLICT (id) DO UPDATE
  SET alias = EXCLUDED.alias,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
