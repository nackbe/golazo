-- Agregar columnas para penales en matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_penalty_goals INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS away_penalty_goals INT DEFAULT NULL;

-- Permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.matches TO service_role;
GRANT SELECT ON TABLE public.matches TO anon, authenticated;
