import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, logApiUsage, getClientIdentifier } from '@/lib/rate-limit';

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
const BASE_URL = 'https://v3.football.api-sports.io';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tournamentId = searchParams.get('tournamentId');

  const identifier = getClientIdentifier(request);

  const rateCheck = await checkRateLimit(identifier, 'get_rounds');
  if (!rateCheck.allowed) {
    return Response.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterMinutes} minutes.` },
      { status: 429 }
    );
  }

  if (!API_KEY) {
    return Response.json({ error: 'API key not configured' }, { status: 500 });
  }

  if (!tournamentId) {
    return Response.json({ error: 'tournamentId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from('tournaments')
    .select('api_football_id, season')
    .eq('id', tournamentId)
    .single();

  if (!tournament?.api_football_id) {
    return Response.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  try {
    const url = new URL(`${BASE_URL}/fixtures/rounds`);
    url.searchParams.set('league', String(tournament.api_football_id));
    url.searchParams.set('season', tournament.season);

    const response = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST,
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return Response.json(
        { error: `API-Football error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    await logApiUsage(identifier, 'get_rounds', null, {
      tournament_id: tournamentId,
      api_football_id: tournament.api_football_id,
    });

    return Response.json({
      rounds: data.response || [],
    });
  } catch (err: any) {
    console.error('Rounds fetch error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
