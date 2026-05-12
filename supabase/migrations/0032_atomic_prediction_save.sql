-- ============================================
-- 0032_atomic_prediction_save.sql
-- RPC atómica para guardar predicciones con validación de comodines.
-- Elimina la race condition de read-then-write usando advisory lock.
-- ============================================

CREATE OR REPLACE FUNCTION public.save_prediction_atomic(
  p_polla_id UUID,
  p_user_id UUID,
  p_match_id UUID,
  p_home_goals INTEGER,
  p_away_goals INTEGER,
  p_wildcard TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_polla RECORD;
  v_match RECORD;
  v_now TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
  v_total_x2 INT;
  v_total_x3 INT;
  v_used_x2 INT;
  v_used_x3 INT;
BEGIN
  -- 1. Advisory lock por jugador + polla para evitar race condition en comodines
  PERFORM pg_advisory_xact_lock(hashtext('prediction:' || p_polla_id || ':' || p_user_id));

  -- 2. Leer polla y partido
  SELECT bet_deadline_minutes, tournament_id, status, wildcards
  INTO v_polla
  FROM public.pollas
  WHERE id = p_polla_id;

  IF v_polla IS NULL THEN
    RETURN jsonb_build_object('error', 'Polla no encontrada.');
  END IF;

  SELECT scheduled_at, tournament_id
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'Partido no encontrado.');
  END IF;

  -- 3. Validar que el partido pertenezca al torneo de la polla
  IF v_match.tournament_id != v_polla.tournament_id THEN
    RETURN jsonb_build_object('error', 'El partido no pertenece a esta polla.');
  END IF;

  -- 4. Validar deadline
  v_now := NOW();
  v_deadline := v_match.scheduled_at - COALESCE(v_polla.bet_deadline_minutes, 5) * INTERVAL '1 minute';
  IF v_now >= v_deadline THEN
    RETURN jsonb_build_object('error', 'El plazo de apuestas para este partido ya cerró.');
  END IF;

  -- 5. Validar estado de polla
  IF v_polla.status = 'draft' THEN
    RETURN jsonb_build_object('error', 'La polla aún no ha iniciado. El administrador debe activarla desde Configuración.');
  END IF;

  -- 6. Validar comodines disponibles
  IF p_wildcard IS NOT NULL THEN
    -- Parsear wildcards de JSONB array (puede ser NULL → defaults)
    v_total_x2 := COALESCE(
      (SELECT (elem->>'quantity')::int
       FROM jsonb_array_elements(v_polla.wildcards) elem
       WHERE elem->>'type' = 'x2'),
      2
    );
    v_total_x3 := COALESCE(
      (SELECT (elem->>'quantity')::int
       FROM jsonb_array_elements(v_polla.wildcards) elem
       WHERE elem->>'type' = 'x3'),
      1
    );

    SELECT
      COUNT(*) FILTER (WHERE wildcard_used = 'x2' AND match_id != p_match_id),
      COUNT(*) FILTER (WHERE wildcard_used = 'x3' AND match_id != p_match_id)
    INTO v_used_x2, v_used_x3
    FROM public.predictions
    WHERE polla_id = p_polla_id
      AND user_id = p_user_id
      AND wildcard_used IS NOT NULL;

    IF p_wildcard = 'x2' AND v_used_x2 >= v_total_x2 THEN
      RETURN jsonb_build_object('error', 'No tenés comodines x2 disponibles.');
    END IF;
    IF p_wildcard = 'x3' AND v_used_x3 >= v_total_x3 THEN
      RETURN jsonb_build_object('error', 'No tenés comodines x3 disponibles.');
    END IF;
  END IF;

  -- 7. Upsert predicción
  INSERT INTO public.predictions (polla_id, user_id, match_id, home_goals, away_goals, wildcard_used)
  VALUES (p_polla_id, p_user_id, p_match_id, p_home_goals, p_away_goals, p_wildcard)
  ON CONFLICT (user_id, polla_id, match_id)
  DO UPDATE SET
    home_goals = EXCLUDED.home_goals,
    away_goals = EXCLUDED.away_goals,
    wildcard_used = EXCLUDED.wildcard_used,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.save_prediction_atomic(UUID, UUID, UUID, INTEGER, INTEGER, TEXT) TO authenticated;
