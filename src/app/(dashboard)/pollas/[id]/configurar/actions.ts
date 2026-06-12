'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { batchCalculateMatchPoints } from '@/lib/sync/calculate-points';
import { getMaxFixturesLoad } from '@/lib/settings';
import { checkRateLimit, logApiUsage } from '@/lib/rate-limit';
import { normalizeMatchStatus } from '@/lib/match-status';

const LOCKED_STATUSES = ['active', 'finished'];

export async function updateGeneralSettings(pollaId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  const isLocked = LOCKED_STATUSES.includes(polla.status);

  const name = (formData.get('name') as string)?.trim();
  const auto_approve = formData.get('auto_approve') === 'true';
  const admin_plays = formData.get('admin_plays') !== 'false';
  const auto_random_prediction = formData.get('auto_random_prediction') === 'true';
  let status = formData.get('status') as string;
  const bet_deadline_minutes = parseInt(formData.get('bet_deadline_minutes') as string, 10);

  if (!name || name.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres.' };
  if (!['draft', 'open', 'active', 'finished'].includes(status)) return { error: 'Estado inválido.' };
  if (isNaN(bet_deadline_minutes) || bet_deadline_minutes < 0) return { error: 'Minutos de cierre inválidos.' };

  if (isLocked && (status === 'draft' || status === 'open')) {
    status = polla.status;
  }

  const { error } = await supabase
    .from('pollas')
    .update({ name, auto_approve, admin_plays, auto_random_prediction, status, bet_deadline_minutes })
    .eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}`);
  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

export async function updatePointSystem(pollaId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  if (LOCKED_STATUSES.includes(polla.status)) {
    return { error: 'No se puede modificar el sistema de puntos una vez iniciada la polla.' };
  }

  const ps = {
    correct_result: clamp(formData, 'ps_correct_result', 0, 100),
    home_goals: clamp(formData, 'ps_home_goals', 0, 100),
    away_goals: clamp(formData, 'ps_away_goals', 0, 100),
    exact_score: clamp(formData, 'ps_exact_score', 0, 100),
    goal_difference: clamp(formData, 'ps_goal_difference', 0, 100),
    total_goals: clamp(formData, 'ps_total_goals', 0, 100),
    unique_exact_bonus: clamp(formData, 'ps_unique_exact_bonus', 0, 10),
  };

  const sps = {
    champion: clamp(formData, 'ps_champion', 0, 100),
    finalist: clamp(formData, 'ps_finalist', 0, 100),
    third_place: clamp(formData, 'ps_third_place', 0, 100),
    least_goals_against: clamp(formData, 'ps_least_goals_against', 0, 100),
    worst_team: clamp(formData, 'ps_worst_team', 0, 100),
    top_scorer_team: clamp(formData, 'ps_top_scorer_team', 0, 100),
  };

  const { error } = await supabase
    .from('pollas')
    .update({ point_system: ps, special_point_system: sps })
    .eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

export async function updateWildcards(pollaId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  if (LOCKED_STATUSES.includes(polla.status)) {
    return { error: 'No se puede modificar los comodines una vez iniciada la polla.' };
  }

  const wildcards = [
    { type: 'x2', quantity: clamp(formData, 'wc_x2', 0, 100) },
    { type: 'x3', quantity: clamp(formData, 'wc_x3', 0, 100) },
  ];

  const { error } = await supabase
    .from('pollas')
    .update({ wildcards })
    .eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

/** @deprecated Use block-specific actions instead */
export async function updatePollaSettings(pollaId: string, formData: FormData) {
  return updateGeneralSettings(pollaId, formData);
}

function clamp(fd: FormData, key: string, min: number, max: number): number {
  const v = parseInt(fd.get(key) as string, 10);
  if (isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export async function approveMember(pollaId: string, memberId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('polla_members')
    .update({ status: 'approved' })
    .eq('id', memberId)
    .eq('polla_id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}/configurar`);
  revalidatePath(`/pollas/${pollaId}`);
  return { success: true };
}

export async function rejectMember(pollaId: string, memberId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('polla_members')
    .delete()
    .eq('id', memberId)
    .eq('polla_id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

export async function getPendingMembers(pollaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  const { data: pendingMembers } = await supabase
    .from('polla_members')
    .select('id, alias, created_at')
    .eq('polla_id', pollaId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return { members: pendingMembers || [] };
}

export async function updatePollaTournament(pollaId: string, tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };
  if (polla.status === 'active' || polla.status === 'finished') {
    return { error: 'No se puede cambiar el torneo una vez iniciada la polla.' };
  }

  const { error } = await supabase
    .from('pollas')
    .update({ tournament_id: tournamentId })
    .eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

export async function selectTournament(formData: FormData) {
  'use server';

  const pollaId = formData.get('polla_id') as string;
  const apiFootballId = parseInt(formData.get('api_football_id') as string, 10);
  const name = formData.get('name') as string;
  const country = formData.get('country') as string;
  const rawType = formData.get('type') as string;
  const type = rawType === 'League' || rawType === 'Cup' ? rawType : null;
  const logoUrl = formData.get('logo_url') as string;
  const season = formData.get('season') as string;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id, status')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };
  if (polla.status === 'active' || polla.status === 'finished') {
    return { error: 'No se puede cambiar el torneo una vez iniciada la polla.' };
  }

  const admin = createAdminClient();

  // Obtener torneo anterior para borrar sus partidos si cambia
  const { data: oldPolla } = await supabase
    .from('pollas')
    .select('tournament_id')
    .eq('id', pollaId)
    .single();

  // Upsert torneo (buscar por api_football_id + season combinado)
  const { data: existing } = await admin
    .from('tournaments')
    .select('id')
    .eq('api_football_id', apiFootballId)
    .eq('season', season)
    .maybeSingle();

  let tournamentId: string;

  if (existing?.id) {
    const { data: updated } = await admin
      .from('tournaments')
      .update({ name, country, type, logo_url: logoUrl || null })
      .eq('id', existing.id)
      .select('id')
      .single();
    tournamentId = updated!.id;
  } else {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6);

    const { data: inserted } = await admin
      .from('tournaments')
      .insert({
        name,
        season,
        api_football_id: apiFootballId,
        logo_url: logoUrl || null,
        country,
        type,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'upcoming',
      })
      .select('id')
      .single();
    tournamentId = inserted!.id;
  }

  // NUNCA borrar matches del torneo viejo: los torneos son compartidos por
  // múltiples pollas y predictions.match_id tiene ON DELETE CASCADE.
  // Borrar matches aquí cascadea predictions/match_points de pollas ajenas.
  // (Bug observado 2026-06-12: una polla cambió de torneo y borró matches +
  // predictions de las 7 pollas que compartían World Cup.)
  // Los matches huérfanos del torneo viejo quedan sin afectar nada — el polla
  // ya no los referencia porque tournament_id cambió.

  await supabase.from('pollas').update({ tournament_id: tournamentId }).eq('id', pollaId);

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

/**
 * Carga los partidos del torneo asociado a la polla.
 * No cambia el estado de la polla. Retorna cuántos partidos se cargaron.
 */
export async function loadFixtures(pollaId: string, selectedRounds?: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  // Rate limiting
  const rateCheck = await checkRateLimit(user.id, 'load_fixtures');
  if (!rateCheck.allowed) {
    return { error: `Límite alcanzado. Podés volver a cargar partidos en ${rateCheck.retryAfterMinutes} minutos.` };
  }

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, admin_id, status, tournament_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };
  if (!polla.tournament_id) return { error: 'No hay torneo seleccionado.' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, api_football_id, season')
    .eq('id', polla.tournament_id)
    .single();

  if (!tournament) return { error: 'No se encontró el torneo.' };

  let fixtures: any[] = [];
  let isMock = false;
  let apiError: string | null = null;

  if (tournament.api_football_id) {
    try {
      const { getFixtures } = await import('@/services/api-football');
      const apiData = await getFixtures(
        tournament.api_football_id,
        parseInt(tournament.season, 10) || 2026
      );
      fixtures = apiData.response || [];

      if (apiData.errors?.plan) {
        apiError = 'Plan gratuito: no se pueden traer fixtures de esta temporada. Se usarán partidos de prueba.';
      }
    } catch (err: any) {
      console.error('Error importando fixtures:', err);
      apiError = err.message || 'Error al consultar API-Football.';
    }
  }

  if (fixtures.length === 0) {
    fixtures = generateMockFixtures(tournament.id);
    isMock = true;
  }

  // Filtrar por rounds seleccionados (si se proporcionan)
  if (selectedRounds && selectedRounds.length > 0 && !isMock) {
    fixtures = fixtures.filter((f) => selectedRounds.includes(f.league?.round));
  }

  // Limitar para no sobrecargar la DB (con batch inserts esto es muy rápido)
  const MAX_FIXTURES = await getMaxFixturesLoad();
  const wasTruncated = fixtures.length > MAX_FIXTURES;
  fixtures = fixtures.slice(0, MAX_FIXTURES);

  if (isMock) {
    await admin.from('matches').insert(fixtures);
    revalidatePath(`/pollas/${pollaId}/configurar`);
    return {
      success: true,
      fixturesImported: fixtures.length,
      isMock,
      warning: apiError,
    };
  }

  // === BATCH PROCESSING para datos reales ===
  const teamMap = new Map<number, { id: number; name: string; logo: string; code: string }>();
  for (const f of fixtures) {
    const ht = f.teams?.home;
    const at = f.teams?.away;
    if (ht?.id) teamMap.set(ht.id, ht);
    if (at?.id) teamMap.set(at.id, at);
  }
  const teamsList = Array.from(teamMap.values());

  const teamApiIds = teamsList.map((t) => t.id);
  const { data: existingTeams } = await admin
    .from('teams')
    .select('id, api_football_id')
    .in('api_football_id', teamApiIds);

  const existingMap = new Map<number, string>();
  for (const t of existingTeams || []) {
    if (t.api_football_id) existingMap.set(t.api_football_id, t.id);
  }

  const teamsToInsert = teamsList
    .filter((t) => !existingMap.has(t.id))
    .map((t) => ({
      api_football_id: t.id,
      name: t.name,
      logo_url: t.logo,
      code: t.code,
    }));

  if (teamsToInsert.length > 0) {
    const { data: insertedTeams } = await admin
      .from('teams')
      .insert(teamsToInsert)
      .select('id, api_football_id');
    for (const t of insertedTeams || []) {
      if (t.api_football_id) existingMap.set(t.api_football_id, t.id);
    }
  }

  const TERMINAL = new Set(['FT', 'AFT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO']);
  const matchesToUpsert = fixtures.map((f) => {
    const rawStatus = f.fixture?.status?.short;
    const status = normalizeMatchStatus(rawStatus);
    const isFinished = TERMINAL.has(status);
    return {
      tournament_id: tournament.id,
      api_football_id: f.fixture?.id ?? null,
      home_team_id: existingMap.get(f.teams?.home?.id) ?? null,
      away_team_id: existingMap.get(f.teams?.away?.id) ?? null,
      home_goals: isFinished ? f.goals?.home ?? null : null,
      away_goals: isFinished ? f.goals?.away ?? null : null,
      home_penalty_goals: isFinished ? f.score?.penalty?.home ?? null : null,
      away_penalty_goals: isFinished ? f.score?.penalty?.away ?? null : null,
      status,
      round: f.league?.round || 'Fase de grupos',
      scheduled_at: f.fixture?.date,
      venue: f.fixture?.venue?.name || null,
    };
  });

  const { error: upsertError } = await admin
    .from('matches')
    .upsert(matchesToUpsert, { onConflict: 'api_football_id' });

  if (upsertError) return { error: `Error al guardar partidos: ${upsertError.message}` };

  await logApiUsage(user.id, 'load_fixtures', user.id, {
    tournament_id: tournament.id,
    api_football_id: tournament.api_football_id,
    fixtures_count: matchesToUpsert.length,
  });

  // Calcular puntos automáticamente para partidos terminados recién cargados
  try {
    await batchCalculateMatchPoints(pollaId);
  } catch (e: any) {
    console.error('Error auto-calculando puntos después de loadFixtures:', e);
  }

  revalidatePath(`/pollas/${pollaId}/configurar`);
  return {
    success: true,
    fixturesImported: matchesToUpsert.length,
    isMock,
    warning: apiError,
    wasTruncated,
  };
}

/**
 * Sincroniza partidos nuevos sin borrar los existentes.
 * Útil para torneos donde los fixtures se van definiendo progresivamente
 * (ej: Mundial — aparecen octavos después de la fase de grupos).
 */
export async function syncFixtures(pollaId: string, selectedRounds?: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  // Rate limiting
  const rateCheck = await checkRateLimit(user.id, 'sync_fixtures');
  if (!rateCheck.allowed) {
    return { error: `Límite alcanzado. Podés sincronizar de nuevo en ${rateCheck.retryAfterMinutes} minutos.` };
  }

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, admin_id, status, tournament_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };
  if (!polla.tournament_id) return { error: 'No hay torneo seleccionado.' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, api_football_id, season')
    .eq('id', polla.tournament_id)
    .single();

  if (!tournament) return { error: 'No se encontró el torneo.' };

  let fixtures: any[] = [];
  let apiError: string | null = null;

  if (tournament.api_football_id) {
    try {
      const { getFixtures } = await import('@/services/api-football');
      const apiData = await getFixtures(
        tournament.api_football_id,
        parseInt(tournament.season, 10) || 2026
      );
      fixtures = apiData.response || [];

      if (apiData.errors?.plan) {
        apiError = 'Plan gratuito: no se pueden traer fixtures de esta temporada.';
      }
    } catch (err: any) {
      console.error('Error importando fixtures:', err);
      apiError = err.message || 'Error al consultar API-Football.';
    }
  }

  if (fixtures.length === 0) {
    return { error: apiError || 'No se encontraron partidos en API-Football para sincronizar.' };
  }

  // NOTA: syncFixtures NO filtra por rounds (comportamiento idéntico al cron).
  // El botón manual sincroniza TODOS los fixtures del torneo, sin importar la fase.
  // Esto evita que partidos de nuevas fases (ej: octavos tras fase de grupos) se ignoren.

  // Consultar partidos existentes del torneo (id + api_football_id + status + scheduled_at)
  const { data: existingMatches } = await admin
    .from('matches')
    .select('id, api_football_id, status, scheduled_at')
    .eq('tournament_id', tournament.id);

  const existingByApiId = new Map(
    (existingMatches || [])
      .filter((m): m is typeof m & { api_football_id: number } => m.api_football_id !== null)
      .map((m) => [m.api_football_id, m])
  );

  // Separar: nuevos vs. existentes con cambios (resultado, status o scheduled_at)
  const TERMINAL_STATUSES = new Set(['FT', 'AFT', 'CANC', 'ABD', 'AWD', 'WO']);
  const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'P', 'BT']);

  const newFixtures = fixtures.filter((f) => f.fixture?.id && !existingByApiId.has(f.fixture.id));
  const fixturesToUpdate = fixtures.filter((f) => {
    if (!f.fixture?.id) return false;
    const existing = existingByApiId.get(f.fixture.id);
    if (!existing) return false;
    const alreadyFinal = TERMINAL_STATUSES.has(existing.status || '');
    if (alreadyFinal) return false;
    const apiStatus = f.fixture?.status?.short;
    const newDate = f.fixture?.date;
    // CRÍTICO: actualizar si la fecha cambió (reagendamiento), aunque siga en NS.
    // Sin esto, los deadlines de apuesta se calculan contra la hora vieja y
    // los jugadores podrían predecir cuando el partido ya empezó.
    const dateChanged = !!newDate && newDate !== existing.scheduled_at;
    return (
      dateChanged ||
      TERMINAL_STATUSES.has(apiStatus || '') ||
      LIVE_STATUSES.has(apiStatus || '')
    );
  });

  // === Insertar nuevos fixtures ===
  let fixturesInserted = 0;
  if (newFixtures.length > 0) {
    const teamMap = new Map<number, { id: number; name: string; logo: string; code: string }>();
    for (const f of newFixtures) {
      const ht = f.teams?.home;
      const at = f.teams?.away;
      if (ht?.id) teamMap.set(ht.id, ht);
      if (at?.id) teamMap.set(at.id, at);
    }

    const teamApiIds = Array.from(teamMap.keys());
    const { data: existingTeams } = await admin
      .from('teams')
      .select('id, api_football_id')
      .in('api_football_id', teamApiIds);

    const existingTeamMap = new Map<number, string>();
    for (const t of existingTeams || []) {
      if (t.api_football_id) existingTeamMap.set(t.api_football_id, t.id);
    }

    const teamsToInsert = Array.from(teamMap.values())
      .filter((t) => !existingTeamMap.has(t.id))
      .map((t) => ({ api_football_id: t.id, name: t.name, logo_url: t.logo, code: t.code }));

    if (teamsToInsert.length > 0) {
      const { data: insertedTeams } = await admin.from('teams').insert(teamsToInsert).select('id, api_football_id');
      for (const t of insertedTeams || []) {
        if (t.api_football_id) existingTeamMap.set(t.api_football_id, t.id);
      }
    }

    const matchesToInsert = newFixtures.map((f) => {
      const status = normalizeMatchStatus(f.fixture?.status?.short);
      const isFinished = TERMINAL_STATUSES.has(status);
      return {
        tournament_id: tournament.id,
        api_football_id: f.fixture?.id ?? null,
        home_team_id: existingTeamMap.get(f.teams?.home?.id) ?? null,
        away_team_id: existingTeamMap.get(f.teams?.away?.id) ?? null,
        home_goals: isFinished ? f.goals?.home ?? null : null,
        away_goals: isFinished ? f.goals?.away ?? null : null,
        home_penalty_goals: isFinished ? f.score?.penalty?.home ?? null : null,
        away_penalty_goals: isFinished ? f.score?.penalty?.away ?? null : null,
        status,
        round: f.league?.round || 'Fase de grupos',
        scheduled_at: f.fixture?.date,
        venue: f.fixture?.venue?.name || null,
      };
    });

    await admin.from('matches').insert(matchesToInsert);
    fixturesInserted = matchesToInsert.length;
  }

  // === Actualizar resultados + fecha de partidos existentes ===
  let fixturesUpdated = 0;
  for (const f of fixturesToUpdate) {
    const existing = existingByApiId.get(f.fixture.id)!;
    const apiStatus = f.fixture?.status?.short;
    const isFinished = TERMINAL_STATUSES.has(apiStatus || '');
    const updatePayload: Record<string, any> = {
      status: apiStatus,
      home_goals: isFinished ? f.goals?.home ?? null : null,
      away_goals: isFinished ? f.goals?.away ?? null : null,
      home_penalty_goals: isFinished ? f.score?.penalty?.home ?? null : null,
      away_penalty_goals: isFinished ? f.score?.penalty?.away ?? null : null,
    };
    // Actualizar scheduled_at SOLO si cambió (evita writes inútiles)
    if (f.fixture?.date && f.fixture.date !== existing.scheduled_at) {
      updatePayload.scheduled_at = f.fixture.date;
    }
    if (f.fixture?.venue?.name) {
      updatePayload.venue = f.fixture.venue.name;
    }
    if (f.league?.round) {
      updatePayload.round = f.league.round;
    }
    await (admin.from('matches') as any).update(updatePayload).eq('id', existing.id);
    fixturesUpdated++;
  }

  if (fixturesInserted === 0 && fixturesUpdated === 0) {
    return {
      success: true,
      fixturesImported: 0,
      message: 'No hay partidos nuevos ni resultados pendientes. Todo está al día.',
    };
  }

  await logApiUsage(user.id, 'sync_fixtures', user.id, {
    tournament_id: tournament.id,
    api_football_id: tournament.api_football_id,
    inserted: fixturesInserted,
    updated: fixturesUpdated,
  });

  // Calcular puntos para partidos recién terminados
  try {
    await batchCalculateMatchPoints(pollaId);
  } catch (e: any) {
    console.error('Error auto-calculando puntos después de syncFixtures:', e);
  }

  const parts = [];
  if (fixturesInserted > 0) parts.push(`${fixturesInserted} partido${fixturesInserted !== 1 ? 's' : ''} nuevos`);
  if (fixturesUpdated > 0) parts.push(`${fixturesUpdated} resultado${fixturesUpdated !== 1 ? 's' : ''} actualizados`);

  revalidatePath(`/pollas/${pollaId}/configurar`);
  revalidatePath(`/pollas/${pollaId}/fixture`);
  return {
    success: true,
    fixturesImported: fixturesInserted + fixturesUpdated,
    message: `Sincronización completa: ${parts.join(', ')}.`,
    warning: apiError,
  };
}

export async function activatePollaAction(formData: FormData) {
  'use server';
  const pollaId = formData.get('polla_id') as string;
  const result = await activatePolla(pollaId);
  if (result.error) {
    throw new Error(result.error);
  }
}

export async function activatePolla(pollaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, admin_id, status, tournament_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };
  if (polla.status === 'active' || polla.status === 'finished') {
    return { error: 'La polla ya está activa o finalizada.' };
  }
  if (!polla.tournament_id) return { error: 'No hay torneo seleccionado.' };

  // Verificar que haya partidos cargados
  const { count } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', polla.tournament_id);

  if (!count || count === 0) {
    return { error: 'Primero tenés que cargar los partidos del torneo.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('pollas')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', pollaId);

  if (error) return { error: error.message };

  revalidatePath(`/pollas/${pollaId}`);
  revalidatePath(`/pollas/${pollaId}/configurar`);
  return { success: true };
}

export async function recalculatePoints(pollaId: string): Promise<
  | { error: string }
  | { skipped: true; reason: string }
  | { processed: number; matches: number }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const rateCheck = await checkRateLimit(user.id, 'recalculate_points');
  if (!rateCheck.allowed) {
    return { error: `Límite alcanzado. Podés recalcular de nuevo en ${rateCheck.retryAfterMinutes} minutos.` };
  }

  const { data: polla } = await supabase
    .from('pollas')
    .select('admin_id')
    .eq('id', pollaId)
    .single();

  if (!polla || polla.admin_id !== user.id) return { error: 'No tenés permisos.' };

  try {
    const result = await batchCalculateMatchPoints(pollaId);
    if ('error' in result) return { error: result.error || 'Error desconocido' };
    await logApiUsage(user.id, 'recalculate_points', user.id, { polla_id: pollaId });
    revalidatePath(`/pollas/${pollaId}`);
    revalidatePath(`/pollas/${pollaId}/configurar`);
    return result;
  } catch (e: any) {
    return { error: e.message || 'Error al recalcular puntos' };
  }
}

function generateMockFixtures(tournamentId: string): any[] {
  const now = new Date();
  const teams = [
    'Argentina', 'Brasil', 'Francia', 'Alemania', 'España', 'Portugal',
    'Inglaterra', 'Países Bajos', 'Italia', 'Uruguay', 'Croacia', 'Bélgica',
    'México', 'Estados Unidos', 'Japón', 'Corea del Sur',
  ];

  const matches: any[] = [];
  let matchDate = new Date(now);
  matchDate.setDate(matchDate.getDate() + 1);

  for (let i = 0; i < teams.length; i += 2) {
    if (i + 1 >= teams.length) break;
    matches.push({
      tournament_id: tournamentId,
      api_football_id: null,
      home_team_id: null,
      away_team_id: null,
      home_goals: null,
      away_goals: null,
      status: 'NS',
      round: 'Fase de grupos',
      scheduled_at: matchDate.toISOString(),
      venue: `Estadio ${i / 2 + 1}`,
    });
    matchDate = new Date(matchDate.getTime() + 2 * 60 * 60 * 1000);
  }

  return matches;
}
