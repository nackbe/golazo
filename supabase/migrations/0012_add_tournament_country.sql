-- Agregar country a tournaments para mostrar en el buscador
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS country TEXT;

-- Agregar type (League/Cup) para saber qué tipo de torneo es
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('League', 'Cup'));

-- Agregar updated_at si no existe
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger para auto-actualizar updated_at en tournaments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_tournaments_updated_at'
  ) THEN
    CREATE TRIGGER update_tournaments_updated_at
      BEFORE UPDATE ON tournaments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Índice para búsqueda por country
CREATE INDEX IF NOT EXISTS idx_tournaments_country ON tournaments(country);
