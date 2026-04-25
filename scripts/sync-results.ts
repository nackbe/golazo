/**
 * Sync Script for Mac Mini
 *
 * This script runs on a local machine (Mac Mini) using node-cron.
 * It polls API-Football for live match results and updates Supabase.
 *
 * Usage:
 *   npm install node-cron axios
 *   npx tsx scripts/sync-results.ts
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import 'dotenv/config';

const API_KEY = process.env.API_FOOTBALL_KEY!;
const API_HOST = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ApiFixture {
  fixture: {
    id: number;
    status: { short: string };
    date: string;
  };
  goals: { home: number | null; away: number | null };
}

async function fetchLiveFixtures(tournamentApiId: number): Promise<ApiFixture[]> {
  const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
    headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
    params: { league: tournamentApiId, season: new Date().getFullYear() },
  });
  return response.data.response || [];
}

async function syncMatches(tournamentApiId: number) {
  const fixtures = await fetchLiveFixtures(tournamentApiId);

  for (const f of fixtures) {
    const status = f.fixture.status.short;
    const homeGoals = f.goals.home;
    const awayGoals = f.goals.away;

    // Only update if match has started or finished
    if (status === 'NS') continue;

    const { error } = await supabase
      .from('matches')
      .update({
        home_goals: homeGoals,
        away_goals: awayGoals,
        status,
      })
      .eq('api_football_id', f.fixture.id);

    if (error) {
      console.error(`Error updating match ${f.fixture.id}:`, error.message);
    } else {
      console.log(`Updated match ${f.fixture.id}: ${homeGoals}-${awayGoals} (${status})`);
    }

    // If match finished, trigger point recalculation via webhook or edge function
    if (status === 'FT' || status === 'AFT') {
      await notifyFinished(f.fixture.id, homeGoals ?? 0, awayGoals ?? 0, status);
    }
  }
}

async function notifyFinished(matchId: number, homeGoals: number, awayGoals: number, status: string) {
  // Option A: Call a Supabase Edge Function directly
  // Option B: Call the Next.js webhook (requires public URL)
  // Below is a placeholder for Edge Function invocation
  try {
    await supabase.functions.invoke('recalculate-points', {
      body: { matchId, homeGoals, awayGoals, status },
    });
    console.log(`Recalculation triggered for match ${matchId}`);
  } catch (err) {
    console.error(`Failed to trigger recalculation for ${matchId}:`, err);
  }
}

async function main() {
  // Load active tournaments
  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('api_football_id')
    .eq('status', 'ongoing');

  if (error || !tournaments) {
    console.error('Failed to load tournaments:', error?.message);
    return;
  }

  for (const t of tournaments) {
    if (!t.api_football_id) continue;
    await syncMatches(t.api_football_id);
  }
}

// Run immediately on start
main();

// Schedule: every 5 minutes during active hours
// Adjust frequency as needed (see document strategy)
cron.schedule('*/5 * * * *', () => {
  console.log(`[${new Date().toISOString()}] Running sync...`);
  main();
});

console.log('Golazo Sync Service started. Polling every 5 minutes.');
