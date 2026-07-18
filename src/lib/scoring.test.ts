import { describe, it, expect } from 'vitest';
import {
  getPointSystem,
  getSpecialPointSystem,
  scoreMatchPrediction,
  calculateTournamentStatsFromMatches,
  DEFAULT_POINTS,
  DEFAULT_SPECIAL_POINTS,
  type PointSystem,
  type TournamentMatch,
} from './scoring';

describe('getPointSystem', () => {
  it('returns defaults when json is null', () => {
    expect(getPointSystem(null)).toEqual(DEFAULT_POINTS);
  });

  it('returns defaults when json is undefined', () => {
    expect(getPointSystem(undefined)).toEqual(DEFAULT_POINTS);
  });

  it('overrides specific fields', () => {
    expect(getPointSystem({ exact_score: 5 })).toEqual({
      ...DEFAULT_POINTS,
      exact_score: 5,
    });
  });

  it('propagates unknown fields via spread', () => {
    expect(getPointSystem({ foo: 99 } as any)).toEqual({ ...DEFAULT_POINTS, foo: 99 });
  });
});

describe('getSpecialPointSystem', () => {
  it('returns defaults when json is null', () => {
    expect(getSpecialPointSystem(null)).toEqual(DEFAULT_SPECIAL_POINTS);
  });

  it('overrides champion points', () => {
    expect(getSpecialPointSystem({ champion: 20 })).toEqual({
      ...DEFAULT_SPECIAL_POINTS,
      champion: 20,
    });
  });
});

describe('scoreMatchPrediction', () => {
  const ps: PointSystem = DEFAULT_POINTS;

  it('returns 0 when everything is wrong', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 0, predAway: 0,
      ps,
    });
    expect(result).toBe(0);
  });

  it('awards correct_result only', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 4, predAway: 0,
      ps,
    });
    // Gana local en ambos casos, nada más coincide
    expect(result).toBe(ps.correct_result);
  });

  it('awards home_goals only', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 2,
      ps,
    });
    // local exacto, pero visitante no, resultado diferente (ganó local vs empate)
    expect(result).toBe(ps.home_goals);
  });

  it('does NOT award goal_difference when sign differs (strict directional)', () => {
    // real 2-1 (diff=+1), pred 0-1 (diff=-1): magnitudes match pero signo no.
    // Strict: solo away_goals (0=1? no — espera, pred 0-1 vs real 2-1 → away=1=1 sí, home 0≠2)
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 0, predAway: 1,
      ps,
    });
    // Ahora SIN goal_difference porque signo no coincide. Solo away_goals.
    expect(result).toBe(ps.away_goals);
  });

  it('awards goal_difference only when sign + magnitude match', () => {
    // real 3-0 (|diff|=3), pred 0-0 (|diff|=0): away_goals match, no other category does
    const result = scoreMatchPrediction({
      realHome: 3, realAway: 0,
      predHome: 0, predAway: 0,
      ps,
    });
    expect(result).toBe(ps.away_goals);
  });

  it('awards ONLY exact_score on exact prediction (no acumulación con otras categorías)', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps,
    });
    // Nueva regla: exacto = solo exact_score, no se acumulan correct_result/home_goals/etc.
    expect(result).toBe(ps.exact_score);
  });

  it('awards exact_score × unique_exact_bonus when uniqueExactMultiplier > 1', () => {
    const psWithBonus: PointSystem = { ...ps, unique_exact_bonus: 2 };
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps: psWithBonus,
      uniqueExactMultiplier: 2,
    });
    expect(result).toBe(ps.exact_score * 2);
  });

  it('ignores uniqueExactMultiplier when prediction is not exact', () => {
    const psWithBonus: PointSystem = { ...ps, unique_exact_bonus: 3 };
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 4, predAway: 0,
      ps: psWithBonus,
      uniqueExactMultiplier: 3,
    });
    expect(result).toBe(ps.correct_result);
  });

  it('awards goal_difference without exact score', () => {
    const result = scoreMatchPrediction({
      realHome: 3, realAway: 1,
      predHome: 2, predAway: 0,
      ps,
    });
    // diff = +2 en ambos, resultado = local gana
    // puntos: correct_result + goal_difference = 1 + 1 = 2
    expect(result).toBe(ps.correct_result + ps.goal_difference);
  });

  it('awards total_goals without exact score', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 2,
      predHome: 1, predAway: 3,
      ps,
    });
    // total = 4 en ambos, resultado diferente (empate vs gana away)
    expect(result).toBe(ps.total_goals);
  });

  it('awards correct_result on draws with same sign', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 2,
      predHome: 3, predAway: 3,
      ps,
    });
    // empate predicho, empate real → correct_result + goal_difference (both 0)
    expect(result).toBe(ps.correct_result + ps.goal_difference);
  });

  it('does not award correct_result when draw predicted but team wins', () => {
    const result = scoreMatchPrediction({
      realHome: 1, realAway: 0,
      predHome: 1, predAway: 1,
      ps,
    });
    // real: +1 (gana local), pred: 0 (empate) → no coincide
    expect(result).toBe(ps.home_goals);
  });

  it('doubles points with x2 wildcard when points > 0', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps,
      wildcard: 'x2',
    });
    // exacto = solo exact_score, multiplicado por x2
    expect(result).toBe(ps.exact_score * 2);
  });

  it('triples points with x3 wildcard when points > 0', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps,
      wildcard: 'x3',
    });
    expect(result).toBe(ps.exact_score * 3);
  });

  it('stacks unique exact bonus and wildcard: exact_score × unique × wildcard', () => {
    const psWithBonus: PointSystem = { ...ps, unique_exact_bonus: 2 };
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps: psWithBonus,
      wildcard: 'x3',
      uniqueExactMultiplier: 2,
    });
    expect(result).toBe(ps.exact_score * 2 * 3);
  });

  it('does not multiply 0 points with wildcard', () => {
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 0, predAway: 0,
      ps,
      wildcard: 'x2',
    });
    expect(result).toBe(0);
  });

  it('supports custom point systems', () => {
    const custom: PointSystem = {
      correct_result: 3,
      home_goals: 2,
      away_goals: 2,
      exact_score: 10,
      goal_difference: 3,
      total_goals: 2,
      unique_exact_bonus: 0,
    };
    const result = scoreMatchPrediction({
      realHome: 2, realAway: 1,
      predHome: 2, predAway: 1,
      ps: custom,
    });
    // Nueva regla: exacto = solo exact_score
    expect(result).toBe(custom.exact_score);
  });

  it('returns 0 when predicted exact reverse result', () => {
    const result = scoreMatchPrediction({
      realHome: 0, realAway: 3,
      predHome: 4, predAway: 0,
      ps,
    });
    expect(result).toBe(0);
  });
});

describe('calculateTournamentStatsFromMatches', () => {
  it('returns empty arrays when no matches provided', () => {
    const result = calculateTournamentStatsFromMatches([]);
    expect(result).toEqual({
      least_goals_against: [],
      worst_team: [],
      top_scorer_team: [],
    });
  });

  it('returns empty arrays when all matches have null goals', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: 't2', home_goals: null, away_goals: null, status: 'FT' },
    ];
    expect(calculateTournamentStatsFromMatches(matches)).toEqual({
      least_goals_against: [],
      worst_team: [],
      top_scorer_team: [],
    });
  });

  it('calculates least_goals_against correctly', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: 't2', home_goals: 2, away_goals: 0, status: 'FT' },
      { home_team_id: 't2', away_team_id: 't1', home_goals: 1, away_goals: 1, status: 'FT' },
    ];
    // t1: ga = 0 + 1 = 1
    // t2: ga = 2 + 1 = 3
    const result = calculateTournamentStatsFromMatches(matches);
    expect(result.least_goals_against).toEqual(['t1']);
  });

  it('calculates worst_team correctly (lowest goal diff)', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: 't2', home_goals: 0, away_goals: 3, status: 'FT' },
      { home_team_id: 't2', away_team_id: 't1', home_goals: 2, away_goals: 1, status: 'FT' },
    ];
    // t1: gf=1, ga=5, diff=-4
    // t2: gf=5, ga=1, diff=+4
    const result = calculateTournamentStatsFromMatches(matches);
    expect(result.worst_team).toEqual(['t1']);
  });

  it('calculates top_scorer_team correctly', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: 't2', home_goals: 1, away_goals: 0, status: 'FT' },
      { home_team_id: 't2', away_team_id: 't1', home_goals: 4, away_goals: 2, status: 'FT' },
    ];
    // t1: gf=1+2=3
    // t2: gf=0+4=4
    const result = calculateTournamentStatsFromMatches(matches);
    expect(result.top_scorer_team).toEqual(['t2']);
  });

  it('returns all tied teams (multiple winners on equal extreme)', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: 't2', home_goals: 1, away_goals: 1, status: 'FT' },
      { home_team_id: 't2', away_team_id: 't1', home_goals: 1, away_goals: 1, status: 'FT' },
    ];
    // t1: gf=2, ga=2, diff=0
    // t2: gf=2, ga=2, diff=0
    const result = calculateTournamentStatsFromMatches(matches);
    expect(result.worst_team.sort()).toEqual(['t1', 't2']);
    expect(result.top_scorer_team.sort()).toEqual(['t1', 't2']);
    expect(result.least_goals_against.sort()).toEqual(['t1', 't2']);
  });

  it('skips matches with missing team ids', () => {
    const matches: TournamentMatch[] = [
      { home_team_id: 't1', away_team_id: null, home_goals: 2, away_goals: 0, status: 'FT' },
      { home_team_id: 't1', away_team_id: 't2', home_goals: 1, away_goals: 0, status: 'FT' },
    ];
    const result = calculateTournamentStatsFromMatches(matches);
    expect(result.least_goals_against).toEqual(['t1']); // only valid match, t1 has ga=0
  });
});
