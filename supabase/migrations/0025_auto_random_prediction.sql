-- Permite que el admin configure predicciones automáticas para jugadores que olvidan predecir.
-- Cuando está activo, el sistema asigna un marcador aleatorio (0-10) a cada equipo
-- para los miembros que no hicieron predicción antes del cierre del partido.

ALTER TABLE public.pollas ADD COLUMN IF NOT EXISTS auto_random_prediction BOOLEAN DEFAULT FALSE NOT NULL;
