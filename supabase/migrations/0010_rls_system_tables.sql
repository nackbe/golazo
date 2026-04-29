-- RLS policies para tournaments, teams y matches
-- Estas tablas son datos de sistema (solo lectura para usuarios,
-- escritura solo via admin/service_role o funciones privilegiadas)

-- Activar RLS si no estaba activo
ALTER TABLE IF EXISTS tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS matches     ENABLE ROW LEVEL SECURITY;

-- Limpiar policies previas si existen
DROP POLICY IF EXISTS "Tournaments viewable by all"        ON tournaments;
DROP POLICY IF EXISTS "Authenticated can manage tournaments" ON tournaments;
DROP POLICY IF EXISTS "Teams viewable by all"              ON teams;
DROP POLICY IF EXISTS "Matches viewable by all"            ON matches;

-- Tournaments: todos pueden leer, service_role puede escribir (via admin client)
CREATE POLICY "Tournaments viewable by all"
  ON tournaments FOR SELECT USING (true);

-- Teams: todos pueden leer
CREATE POLICY "Teams viewable by all"
  ON teams FOR SELECT USING (true);

-- Matches: todos pueden leer
CREATE POLICY "Matches viewable by all"
  ON matches FOR SELECT USING (true);
