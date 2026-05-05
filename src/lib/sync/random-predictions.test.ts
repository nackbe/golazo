import { describe, it, expect } from 'vitest';
import { filterUsersWithoutPrediction, buildRandomPredictions } from './random-predictions';

describe('filterUsersWithoutPrediction', () => {
  it('returns all users when none have predictions', () => {
    const members = [{ user_id: 'u1' }, { user_id: 'u2' }];
    const existing = new Set<string>();
    expect(filterUsersWithoutPrediction(members, existing)).toEqual(['u1', 'u2']);
  });

  it('excludes users with existing predictions', () => {
    const members = [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }];
    const existing = new Set(['u2']);
    expect(filterUsersWithoutPrediction(members, existing)).toEqual(['u1', 'u3']);
  });

  it('returns empty when all have predictions', () => {
    const members = [{ user_id: 'u1' }];
    const existing = new Set(['u1']);
    expect(filterUsersWithoutPrediction(members, existing)).toEqual([]);
  });

  it('returns empty for empty members', () => {
    expect(filterUsersWithoutPrediction([], new Set())).toEqual([]);
  });
});

describe('buildRandomPredictions', () => {
  it('generates correct number of predictions', () => {
    const rng = () => 0.5;
    const result = buildRandomPredictions(['u1', 'u2'], 'p1', 'm1', rng);
    expect(result).toHaveLength(2);
  });

  it('uses deterministic rng in tests', () => {
    const rng = () => 0.5;
    const result = buildRandomPredictions(['u1'], 'p1', 'm1', rng);
    expect(result[0].home_goals).toBe(5); // floor(0.5 * 11) = 5
    expect(result[0].away_goals).toBe(5);
  });

  it('generates goals within 0-10 range', () => {
    const rng = () => 0.99;
    const result = buildRandomPredictions(['u1'], 'p1', 'm1', rng);
    expect(result[0].home_goals).toBe(10);
    expect(result[0].away_goals).toBe(10);
  });

  it('generates 0 with rng 0', () => {
    const rng = () => 0;
    const result = buildRandomPredictions(['u1'], 'p1', 'm1', rng);
    expect(result[0].home_goals).toBe(0);
    expect(result[0].away_goals).toBe(0);
  });

  it('sets correct ids and wildcard_used null', () => {
    const rng = () => 0.3;
    const result = buildRandomPredictions(['u1'], 'p1', 'm1', rng);
    expect(result[0]).toMatchObject({
      polla_id: 'p1',
      match_id: 'm1',
      user_id: 'u1',
      wildcard_used: null,
    });
  });
});
