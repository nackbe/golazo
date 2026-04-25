import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Webhook endpoint called by the Mac mini sync script
 * when a match finishes. Triggers point recalculation.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  // Simple secret validation — use a proper cron secret in production
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { matchId, homeGoals, awayGoals, status } = body;

  if (!matchId || homeGoals === undefined || awayGoals === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const supabase = await createClient();

  // Update match result
  const { error: matchError } = await supabase
    .from('matches')
    .update({ home_goals: homeGoals, away_goals: awayGoals, status })
    .eq('api_football_id', matchId);

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  // TODO: Trigger edge function for point recalculation
  // await supabase.functions.invoke('recalculate-points', { body: { matchId } });

  return NextResponse.json({ success: true });
}
