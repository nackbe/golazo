import { describe, it, expect } from 'vitest';
import { computeStreaks, determineBadges, type PredictionHistory, type BadgeContext } from './badges';

function makeRow(
  pred: [number, number],
  real: [number, number],
  extra?: Partial<PredictionHistory>
): PredictionHistory {
  return {
    match_id: 'm1',
    pred_home: pred[0],
    pred_away: pred[1],
    real_home: real[0],
    real_away: real[1],
    wildcard_used: null,
    round: null,
    scheduled_at: '2024-01-01',
    ...extra,
  };
}

describe('computeStreaks', () => {
  it('returns zeros for empty history', () => {
    expect(computeStreaks([])).toEqual({
      current_result_streak: 0,
      max_result_streak: 0,
      current_exact_streak: 0,
      max_exact_streak: 0,
      current_negative_streak: 0,
    });
  });

  it('counts exact streaks', () => {
    const rows = [
      makeRow([2, 1], [2, 1]),
      makeRow([0, 0], [0, 0]),
      makeRow([3, 2], [3, 3]),
    ];
    const result = computeStreaks(rows);
    expect(result.current_exact_streak).toBe(0); // last was wrong
    expect(result.max_exact_streak).toBe(2);
  });

  it('counts result streaks (correct result only)', () => {
    const rows = [
      makeRow([2, 1], [3, 0]), // both win home
      makeRow([1, 1], [0, 0]), // both draw
      makeRow([0, 2], [1, 3]), // both away win
      makeRow([2, 1], [0, 1]), // wrong: home win vs away win
    ];
    const result = computeStreaks(rows);
    expect(result.current_result_streak).toBe(0);
    expect(result.max_result_streak).toBe(3);
  });

  it('counts negative streaks', () => {
    const rows = [
      makeRow([2, 1], [0, 1]),
      makeRow([1, 1], [2, 1]),
      makeRow([0, 0], [1, 3]),
      makeRow([2, 1], [0, 3]),
      makeRow([1, 0], [1, 3]),
    ];
    const result = computeStreaks(rows);
    expect(result.current_result_streak).toBe(0);
    expect(result.max_result_streak).toBe(0);
    expect(result.current_negative_streak).toBe(5);
  });

  it('resets exact streak when wrong but keeps result streak', () => {
    const rows = [
      makeRow([2, 1], [2, 1]), // exact + result
      makeRow([3, 0], [3, 0]), // exact + result
      makeRow([4, 1], [3, 1]), // result only (both home win, not exact)
    ];
    const result = computeStreaks(rows);
    expect(result.current_exact_streak).toBe(0);
    expect(result.max_exact_streak).toBe(2);
    expect(result.current_result_streak).toBe(3);
    expect(result.max_result_streak).toBe(3);
  });

  it('handles alternating results', () => {
    const rows = [
      makeRow([2, 1], [2, 1]), // exact
      makeRow([0, 0], [2, 1]), // wrong
      makeRow([1, 3], [1, 3]), // exact
      makeRow([2, 2], [3, 0]), // wrong
    ];
    const result = computeStreaks(rows);
    expect(result.max_exact_streak).toBe(1);
    expect(result.max_result_streak).toBe(1);
    expect(result.current_negative_streak).toBe(1);
  });
});

describe('determineBadges', () => {
  const baseStreaks = {
    current_result_streak: 0,
    max_result_streak: 0,
    current_exact_streak: 0,
    max_exact_streak: 0,
    current_negative_streak: 0,
  };

  const baseContext: BadgeContext = {
    exact: false,
    correctResult: false,
    wildcardUsed: null,
    isFinal: false,
  };

  it('awards no badges with empty streaks and no context', () => {
    expect(determineBadges(baseStreaks, baseContext)).toEqual([]);
  });

  it('awards result streak badges at thresholds', () => {
    const s = { ...baseStreaks, max_result_streak: 3 };
    const badges = determineBadges(s, baseContext).map((b) => b.badge_id);
    expect(badges).toContain('streak_result_3');
    expect(badges).not.toContain('streak_result_5');
  });

  it('awards multiple result streak badges cumulatively', () => {
    const s = { ...baseStreaks, max_result_streak: 10 };
    const badges = determineBadges(s, baseContext).map((b) => b.badge_id);
    expect(badges).toContain('streak_result_3');
    expect(badges).toContain('streak_result_5');
    expect(badges).toContain('streak_result_10');
  });

  it('awards exact streak badges', () => {
    const s = { ...baseStreaks, max_exact_streak: 5 };
    const badges = determineBadges(s, baseContext).map((b) => b.badge_id);
    expect(badges).toContain('streak_exact_2');
    expect(badges).toContain('streak_exact_3');
    expect(badges).toContain('streak_exact_5');
  });

  it('awards negative streak badge', () => {
    const s = { ...baseStreaks, current_negative_streak: 5 };
    const badges = determineBadges(s, baseContext).map((b) => b.badge_id);
    expect(badges).toContain('negative_streak_5');
  });

  it('awards perfect wildcard badge', () => {
    const ctx: BadgeContext = { ...baseContext, exact: true, wildcardUsed: 'x2' };
    expect(determineBadges(baseStreaks, ctx).map((b) => b.badge_id)).toContain('perfect_wildcard');
  });

  it('does not award perfect wildcard without exact', () => {
    const ctx: BadgeContext = { ...baseContext, exact: false, wildcardUsed: 'x2' };
    expect(determineBadges(baseStreaks, ctx).map((b) => b.badge_id)).not.toContain('perfect_wildcard');
  });

  it('does not award perfect wildcard without wildcard', () => {
    const ctx: BadgeContext = { ...baseContext, exact: true, wildcardUsed: null };
    expect(determineBadges(baseStreaks, ctx).map((b) => b.badge_id)).not.toContain('perfect_wildcard');
  });

  it('awards exact in final badge', () => {
    const ctx: BadgeContext = { ...baseContext, exact: true, isFinal: true };
    expect(determineBadges(baseStreaks, ctx).map((b) => b.badge_id)).toContain('exact_in_final');
  });

  it('does not award exact in final if not exact', () => {
    const ctx: BadgeContext = { ...baseContext, exact: false, isFinal: true };
    expect(determineBadges(baseStreaks, ctx).map((b) => b.badge_id)).not.toContain('exact_in_final');
  });

  it('combines multiple badges', () => {
    const s = { ...baseStreaks, max_result_streak: 5, max_exact_streak: 3 };
    const ctx: BadgeContext = { ...baseContext, exact: true, wildcardUsed: 'x3', isFinal: true };
    const badges = determineBadges(s, ctx).map((b) => b.badge_id);
    expect(badges).toContain('streak_result_3');
    expect(badges).toContain('streak_result_5');
    expect(badges).toContain('streak_exact_2');
    expect(badges).toContain('streak_exact_3');
    expect(badges).toContain('perfect_wildcard');
    expect(badges).toContain('exact_in_final');
  });
});
