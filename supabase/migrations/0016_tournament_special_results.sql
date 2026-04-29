-- Tabla para guardar resultados reales de predicciones especiales por torneo
-- Se llena automáticamente por el sync (final/3rd place) o manualmente por el admin
CREATE TABLE IF NOT EXISTS public.tournament_special_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('champion','finalist','third_place','least_goals_against','worst_team','top_scorer_team')),
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, type)
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_tournament_special_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tournament_special_results_updated_at ON public.tournament_special_results;
CREATE TRIGGER update_tournament_special_results_updated_at
  BEFORE UPDATE ON public.tournament_special_results
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_special_results_updated_at();

-- Permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tournament_special_results TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_special_results TO service_role;

-- RLS
ALTER TABLE public.tournament_special_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_special_results_select_public"
  ON public.tournament_special_results
  FOR SELECT
  TO anon, authenticated
  USING (true);
