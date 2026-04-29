-- Fix: service_role necesita DELETE para poder borrar pollas y datos relacionados
-- desde server actions (deletePolla, loadFixtures, etc.)

GRANT DELETE ON TABLE public.pollas             TO service_role;
GRANT DELETE ON TABLE public.polla_members      TO service_role;
GRANT DELETE ON TABLE public.match_points       TO service_role;
GRANT DELETE ON TABLE public.ranking_history    TO service_role;
