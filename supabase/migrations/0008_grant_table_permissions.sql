-- Otorgar permisos de tabla a los roles de Supabase
-- Necesario cuando las tablas se crean via SQL (no via dashboard)
-- Sin esto: "permission denied for table X" aunque RLS esté bien

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT                        ON TABLE public.profiles           TO anon;
GRANT SELECT, INSERT, UPDATE        ON TABLE public.profiles           TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.pollas             TO anon;
GRANT SELECT, INSERT, UPDATE        ON TABLE public.pollas             TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.polla_members      TO anon;
GRANT SELECT, INSERT, UPDATE        ON TABLE public.polla_members      TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.predictions        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.predictions       TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.special_predictions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.special_predictions TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.ranking_history    TO anon;
GRANT SELECT, INSERT                ON TABLE public.ranking_history    TO authenticated, service_role;

GRANT SELECT                        ON TABLE public.tournaments        TO anon, authenticated;
GRANT SELECT                        ON TABLE public.teams              TO anon, authenticated;
GRANT SELECT                        ON TABLE public.matches            TO anon, authenticated;
