-- Cambiar UNIQUE de api_football_id solo → (api_football_id, season)
-- Esto permite tener múltiples temporadas de la misma liga

-- 1. Eliminar el índice UNIQUE existente (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'tournaments_api_football_id_key'
  ) THEN
    ALTER TABLE tournaments DROP CONSTRAINT tournaments_api_football_id_key;
  END IF;
END $$;

-- 2. Crear nuevo índice UNIQUE combinado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'tournaments_api_football_id_season_key'
  ) THEN
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_api_football_id_season_key 
      UNIQUE (api_football_id, season);
  END IF;
END $$;
