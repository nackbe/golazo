-- Agregar sistema de puntos configurable para predicciones especiales
ALTER TABLE public.pollas ADD COLUMN IF NOT EXISTS special_point_system JSONB DEFAULT NULL;

-- Actualizar tipos válidos de special_predictions para incluir nuevas categorías
ALTER TABLE public.special_predictions DROP CONSTRAINT IF EXISTS special_predictions_type_check;
ALTER TABLE public.special_predictions ADD CONSTRAINT special_predictions_type_check
  CHECK (type IN ('champion','finalist','third_place','least_goals_against','worst_team','top_scorer_team'));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.special_predictions TO authenticated, service_role;
