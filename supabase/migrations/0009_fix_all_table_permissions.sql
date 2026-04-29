-- Grants completos para todas las tablas del proyecto
-- tournaments, teams y matches también necesitan INSERT para la creación de pollas

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- profiles
GRANT SELECT                         ON TABLE public.profiles           TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.profiles           TO authenticated, service_role;

-- tournaments (necesita INSERT cuando no hay torneo por defecto)
GRANT SELECT                         ON TABLE public.tournaments        TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.tournaments        TO authenticated, service_role;

-- teams
GRANT SELECT                         ON TABLE public.teams              TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.teams              TO authenticated, service_role;

-- matches
GRANT SELECT                         ON TABLE public.matches            TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.matches            TO authenticated, service_role;

-- pollas
GRANT SELECT                         ON TABLE public.pollas             TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.pollas             TO authenticated, service_role;

-- polla_members
GRANT SELECT                         ON TABLE public.polla_members      TO anon;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.polla_members      TO authenticated, service_role;

-- predictions
GRANT SELECT                         ON TABLE public.predictions        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.predictions        TO authenticated, service_role;

-- special_predictions
GRANT SELECT                         ON TABLE public.special_predictions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.special_predictions TO authenticated, service_role;

-- ranking_history
GRANT SELECT                         ON TABLE public.ranking_history    TO anon;
GRANT SELECT, INSERT                 ON TABLE public.ranking_history    TO authenticated, service_role;
