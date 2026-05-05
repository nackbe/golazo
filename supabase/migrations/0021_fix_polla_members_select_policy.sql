-- Corrige la policy SELECT de polla_members.
-- El bug: "Users can view own memberships" solo permite ver la fila propia
-- o si sos admin, lo que hace que los miembros no puedan ver el ranking.
-- Fix: cualquier miembro aprobado de una polla puede ver TODOS los miembros de esa polla.

DROP POLICY IF EXISTS "Users can view own memberships" ON public.polla_members;

CREATE POLICY "Members can view all members of their pollas"
  ON public.polla_members FOR SELECT USING (
    public.is_polla_member(polla_id)
    OR public.is_polla_admin(polla_id)
  );
