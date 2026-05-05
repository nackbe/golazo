-- Permite que el admin configure si participa en el ranking de su propia polla.
-- Por defecto true (el admin juega como cualquier miembro).
-- Cuando es false, el admin no aparece en el ranking ni se calculan sus puntos.

ALTER TABLE public.pollas ADD COLUMN IF NOT EXISTS admin_plays BOOLEAN DEFAULT TRUE NOT NULL;
