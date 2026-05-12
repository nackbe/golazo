export interface PointSystem {
  correct_result: number;
  home_goals: number;
  away_goals: number;
  exact_score: number;
  goal_difference: number;
  total_goals: number;
  unique_exact_bonus: number; // 0 = desactivado. Si > 0 y exactamente 1 jugador acierta exacto, multiplica exact_score por este valor.
}

export interface SpecialPointSystem {
  champion: number;
  finalist: number;
  third_place: number;
  least_goals_against: number;
  worst_team: number;
  top_scorer_team: number;
}

export const DEFAULT_POINTS: PointSystem = {
  correct_result: 1,
  home_goals: 1,
  away_goals: 1,
  exact_score: 3,
  goal_difference: 1,
  total_goals: 1,
  unique_exact_bonus: 0,
};

export const DEFAULT_SPECIAL_POINTS: SpecialPointSystem = {
  champion: 10,
  finalist: 5,
  third_place: 3,
  least_goals_against: 5,
  worst_team: 4,
  top_scorer_team: 5,
};

export function getPointSystem(json: unknown): PointSystem {
  return { ...DEFAULT_POINTS, ...(json as Record<string, number> || {}) };
}

export function getSpecialPointSystem(json: unknown): SpecialPointSystem {
  return { ...DEFAULT_SPECIAL_POINTS, ...(json as Record<string, number> || {}) };
}

interface ScorePredictionInput {
  realHome: number;
  realAway: number;
  predHome: number;
  predAway: number;
  ps: PointSystem;
  wildcard?: 'x2' | 'x3' | null;
}

export interface PointBreakdownItem {
  key: string;
  label: string;
  points: number;
}

export interface PointBreakdown {
  items: PointBreakdownItem[];
  baseTotal: number;
  total: number;
  multiplier: number;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  correct_result: 'Resultado correcto',
  home_goals: 'Goles local exactos',
  away_goals: 'Goles visitante exactos',
  exact_score: 'Marcador exacto',
  goal_difference: 'Diferencia de goles',
  total_goals: 'Total de goles',
};

/**
 * Calcula el desglose de puntos de una predicción (sin side effects).
 * El bonus de "único y exacto" NO se incluye aquí — se aplica externamente.
 */
export function scoreMatchPredictionWithBreakdown({
  realHome,
  realAway,
  predHome,
  predAway,
  ps,
  wildcard,
}: ScorePredictionInput): PointBreakdown {
  const realDiff = realHome - realAway;
  const realTotal = realHome + realAway;
  const predDiff = predHome - predAway;
  const predTotal = predHome + predAway;

  const items: PointBreakdownItem[] = [];

  function add(key: string, condition: boolean, value: number) {
    if (condition && value > 0) {
      items.push({ key, label: BREAKDOWN_LABELS[key] ?? key, points: value });
    }
  }

  add('correct_result', Math.sign(realDiff) === Math.sign(predDiff), ps.correct_result);
  add('home_goals', realHome === predHome, ps.home_goals);
  add('away_goals', realAway === predAway, ps.away_goals);
  add('exact_score', realHome === predHome && realAway === predAway, ps.exact_score);
  add('goal_difference', Math.abs(realDiff) === Math.abs(predDiff), ps.goal_difference);
  add('total_goals', realTotal === predTotal, ps.total_goals);

  const baseTotal = items.reduce((sum, i) => sum + i.points, 0);
  let multiplier = 1;
  if (baseTotal > 0 && wildcard === 'x2') multiplier = 2;
  else if (baseTotal > 0 && wildcard === 'x3') multiplier = 3;

  return {
    items,
    baseTotal,
    total: baseTotal * multiplier,
    multiplier,
  };
}

/**
 * Calcula los puntos de una predicción de forma pura (sin side effects).
 * Wrapper sobre scoreMatchPredictionWithBreakdown que solo devuelve el total.
 */
export function scoreMatchPrediction(input: ScorePredictionInput): number {
  return scoreMatchPredictionWithBreakdown(input).total;
}

export interface TournamentMatch {
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
}

export interface TournamentStats {
  least_goals_against: string | null;
  worst_team: string | null;
  top_scorer_team: string | null;
}

/**
 * Calcula estadísticas de torneo (menos goles en contra, peor equipo, máximo goleador)
 * a partir de partidos terminados. Función pura.
 */
export function calculateTournamentStatsFromMatches(
  matches: TournamentMatch[]
): TournamentStats {
  const stats = new Map<string, { gf: number; ga: number; played: number }>();

  for (const m of matches) {
    if (m.home_goals === null || m.away_goals === null) continue;
    if (!m.home_team_id || !m.away_team_id) continue;

    if (!stats.has(m.home_team_id)) stats.set(m.home_team_id, { gf: 0, ga: 0, played: 0 });
    if (!stats.has(m.away_team_id)) stats.set(m.away_team_id, { gf: 0, ga: 0, played: 0 });

    const home = stats.get(m.home_team_id)!;
    const away = stats.get(m.away_team_id)!;

    home.gf += m.home_goals;
    home.ga += m.away_goals;
    home.played++;

    away.gf += m.away_goals;
    away.ga += m.home_goals;
    away.played++;
  }

  if (stats.size === 0) {
    return { least_goals_against: null, worst_team: null, top_scorer_team: null };
  }

  let leastGaTeam: string | null = null;
  let leastGa = Infinity;
  let worstTeam: string | null = null;
  let worstDiff = Infinity;
  let topScorerTeam: string | null = null;
  let topGf = -Infinity;

  for (const [teamId, s] of Array.from(stats.entries())) {
    if (s.ga < leastGa) {
      leastGa = s.ga;
      leastGaTeam = teamId;
    }
    const diff = s.gf - s.ga;
    if (diff < worstDiff) {
      worstDiff = diff;
      worstTeam = teamId;
    }
    if (s.gf > topGf) {
      topGf = s.gf;
      topScorerTeam = teamId;
    }
  }

  return { least_goals_against: leastGaTeam, worst_team: worstTeam, top_scorer_team: topScorerTeam };
}
