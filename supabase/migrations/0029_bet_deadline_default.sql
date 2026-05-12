-- Cambiar el default de bet_deadline_minutes de 60 a 5 minutos
-- Las pollas nuevas usarán 5 min por defecto.
-- Las existentes conservan su valor actual.

ALTER TABLE public.pollas
  ALTER COLUMN bet_deadline_minutes SET DEFAULT 5;
