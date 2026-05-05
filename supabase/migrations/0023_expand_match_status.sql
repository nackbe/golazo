-- El CHECK original solo tenía 9 statuses de API-Football.
-- La Libertadores y otros torneos usan PST, TBD, ABD, AWD, WO, SUSP, INT, AET, BT, etc.
-- El upsert fallaba silenciosamente al encontrar cualquiera de ellos.
-- Solución: reemplazar el CHECK con uno que cubra todos los statuses conocidos de API-Football.

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN (
    'NS',   -- Not Started
    'TBD',  -- Time To Be Defined
    'PST',  -- Postponed
    '1H',   -- First Half
    'HT',   -- Half Time
    '2H',   -- Second Half
    'ET',   -- Extra Time
    'BT',   -- Break Time (Extra Time)
    'P',    -- Penalty In Progress
    'SUSP', -- Suspended
    'INT',  -- Interrupted
    'FT',   -- Full Time
    'AET',  -- After Extra Time
    'PEN',  -- After Penalties
    'AFT',  -- After Extra Time (legacy alias)
    'CANC', -- Cancelled
    'ABD',  -- Abandoned
    'AWD',  -- Technical Loss
    'WO',   -- Walkover
    'LIVE'  -- Live (generic)
  ));
