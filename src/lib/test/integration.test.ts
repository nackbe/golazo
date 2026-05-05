import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestPolla,
  createTestMatches,
  createTestPredictions,
  cleanupAllTestData,
} from './factory';
import { calculateMatchPoints, batchCalculateMatchPoints, calculateSpecialPoints } from '@/lib/sync/calculate-points';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Integration: point calculation flow', () => {
  let pollaId: string;
  let userId: string;
  let tournamentId: string;
  let matchId: string;

  beforeAll(async () => {
    const setup = await createTestPolla();
    pollaId = setup.pollaId;
    userId = setup.userId;
    tournamentId = setup.tournamentId;

    const matches = await createTestMatches(tournamentId, [
      { home_goals: 2, away_goals: 1, status: 'FT', scheduled_at: '2024-06-01T18:00:00Z' },
    ]);
    matchId = matches.matchIds[0];
  });

  afterAll(async () => {
    await cleanupAllTestData();
  });

  it('calculates exact score correctly', async () => {
    await createTestPredictions(pollaId, userId, [
      { match_id: matchId, home_goals: 2, away_goals: 1 },
    ]);

    const result = await calculateMatchPoints(matchId);
    expect(result.processed).toBe(1);

    const admin = createAdminClient();

    // match_points should have 8 points (default system: 1+1+1+3+1+1)
    const { data: mp } = await admin
      .from('match_points')
      .select('points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .eq('match_id', matchId)
      .single();
    expect(mp?.points).toBe(8);

    // total_points updated
    const { data: member } = await admin
      .from('polla_members')
      .select('total_points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .single();
    expect(member?.total_points).toBe(8);

    // ranking_history snapshot recorded
    const { data: rh } = await admin
      .from('ranking_history')
      .select('position, total_points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .single();
    expect(rh?.position).toBe(1);
    expect(rh?.total_points).toBe(8);

    // streaks updated (requires migration 0026 applied)
    const { data: streak } = await admin
      .from('player_streaks')
      .select('current_result_streak, max_result_streak, current_exact_streak, max_exact_streak')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .single();
    if (streak) {
      expect(streak.current_result_streak).toBe(1);
      expect(streak.max_result_streak).toBe(1);
      expect(streak.current_exact_streak).toBe(1);
      expect(streak.max_exact_streak).toBe(1);
    }

    // match marked as calculated
    const { data: match } = await admin
      .from('matches')
      .select('points_calculated')
      .eq('id', matchId)
      .single();
    expect(match?.points_calculated).toBe(true);
  });

  it('calculates wrong prediction as 0 points', async () => {
    // Need a new match + prediction for this test
    const matches = await createTestMatches(tournamentId, [
      { home_goals: 3, away_goals: 0, status: 'FT', scheduled_at: '2024-06-02T18:00:00Z' },
    ]);
    const mId = matches.matchIds[0];

    await createTestPredictions(pollaId, userId, [
      { match_id: mId, home_goals: 0, away_goals: 0 },
    ]);

    await calculateMatchPoints(mId);

    const admin = createAdminClient();
    const { data: mp } = await admin
      .from('match_points')
      .select('points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .eq('match_id', mId)
      .single();
    expect(mp?.points).toBe(1); // away_goals coincide (0=0)

    // Streaks should reset exact and result, increase negative (requires migration 0026)
    const { data: streak } = await admin
      .from('player_streaks')
      .select('current_result_streak, current_exact_streak, current_negative_streak')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .single();
    if (streak) {
      expect(streak.current_result_streak).toBe(0);
      expect(streak.current_exact_streak).toBe(0);
      expect(streak.current_negative_streak).toBe(1);
    }
  });
});

describe('Integration: batch calculation', () => {
  let pollaId: string;
  let userId: string;
  let tournamentId: string;

  beforeAll(async () => {
    const setup = await createTestPolla();
    pollaId = setup.pollaId;
    userId = setup.userId;
    tournamentId = setup.tournamentId;
  });

  afterAll(async () => {
    await cleanupAllTestData();
  });

  it('processes multiple pending matches in one batch', async () => {
    const matches = await createTestMatches(tournamentId, [
      { home_goals: 1, away_goals: 1, status: 'FT', scheduled_at: '2024-06-01T18:00:00Z' },
      { home_goals: 2, away_goals: 0, status: 'FT', scheduled_at: '2024-06-02T18:00:00Z' },
    ]);

    await createTestPredictions(pollaId, userId, [
      { match_id: matches.matchIds[0], home_goals: 1, away_goals: 1 }, // exact
      { match_id: matches.matchIds[1], home_goals: 2, away_goals: 0 }, // exact
    ]);

    const result = await batchCalculateMatchPoints(pollaId);
    expect(result.processed).toBe(2);

    const admin = createAdminClient();

    for (const mId of matches.matchIds) {
      const { data: match } = await admin
        .from('matches')
        .select('points_calculated')
        .eq('id', mId)
        .single();
      expect(match?.points_calculated).toBe(true);
    }

    // Total should be 16 (8 + 8)
    const { data: member } = await admin
      .from('polla_members')
      .select('total_points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .single();
    expect(member?.total_points).toBe(16);
  });
});

describe('Integration: special predictions', () => {
  let pollaId: string;
  let userId: string;
  let tournamentId: string;

  beforeAll(async () => {
    const setup = await createTestPolla();
    pollaId = setup.pollaId;
    userId = setup.userId;
    tournamentId = setup.tournamentId;
  });

  afterAll(async () => {
    await cleanupAllTestData();
  });

  it('awards special prediction points when correct', async () => {
    const admin = createAdminClient();

    // Create a team for champion
    const { data: team } = await admin.from('teams').insert({ name: 'Champion Team', country: 'Testlandia' }).select('id').single();
    if (!team) throw new Error('Failed to create team');

    // Set tournament special result
    await admin.from('tournament_special_results').insert({
      tournament_id: tournamentId,
      type: 'champion',
      team_id: team.id,
    });

    // User predicts champion
    await admin.from('special_predictions').insert({
      polla_id: pollaId,
      user_id: userId,
      type: 'champion',
      team_id: team.id,
    });

    const result = await calculateSpecialPoints(pollaId);
    expect(result.processed).toBe(1);

    const { data: sp } = await admin
      .from('special_predictions')
      .select('points')
      .eq('polla_id', pollaId)
      .eq('user_id', userId)
      .eq('type', 'champion')
      .single();
    expect(sp?.points).toBe(10); // default champion points
  });
});
