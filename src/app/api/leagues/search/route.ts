import { NextRequest } from 'next/server';
import { checkRateLimit, logApiUsage, getClientIdentifier } from '@/lib/rate-limit';

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
const BASE_URL = 'https://v3.football.api-sports.io';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q')?.trim();
  const country = searchParams.get('country')?.trim();
  const type = searchParams.get('type')?.trim(); // 'League' | 'Cup'

  const identifier = getClientIdentifier(request);

  const rateCheck = await checkRateLimit(identifier, 'search_leagues');
  if (!rateCheck.allowed) {
    return Response.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterMinutes} minutes.` },
      { status: 429 }
    );
  }

  if (!API_KEY) {
    return Response.json({ error: 'API key not configured' }, { status: 500 });
  }

  if (!query && !country) {
    return Response.json({ error: 'Provide q or country parameter' }, { status: 400 });
  }

  if (query && query.length < 3) {
    return Response.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  // Traducir términos comunes del español al inglés para API-Football
  const TRANSLATIONS: Record<string, string> = {
    mundial: 'world cup',
    'copa del mundo': 'world cup',
    fifa: 'fifa',
    'champions league': 'champions league',
    champions: 'champions league',
    'copa america': 'copa america',
    'copa libertadores': 'copa libertadores',
    'copa sudamericana': 'copa sudamericana',
    premier: 'premier league',
    'la liga': 'la liga',
    serie: 'serie a',
    bundesliga: 'bundesliga',
    ligue: 'ligue 1',
    europa: 'europa league',
    'europa league': 'europa league',
  };

  const normalizedQuery = query ? (TRANSLATIONS[query.toLowerCase()] || query) : undefined;

  const url = new URL(`${BASE_URL}/leagues`);
  if (normalizedQuery) url.searchParams.set('search', normalizedQuery);
  if (country) url.searchParams.set('country', country);
  if (type) url.searchParams.set('type', type);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST,
      },
      next: { revalidate: 3600 }, // Cache 1 hora
    });

    if (!response.ok) {
      return Response.json(
        { error: `API-Football error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Normalizar la respuesta
    let leagues = (data.response || []).map((item: any) => ({
      id: item.league.id,
      name: item.league.name,
      type: item.league.type,
      logo: item.league.logo,
      country: {
        name: item.country.name,
        code: item.country.code,
        flag: item.country.flag,
      },
      seasons: (item.seasons || []).map((s: any) => ({
        year: s.year,
        start: s.start,
        end: s.end,
        current: s.current,
        coverage: s.coverage,
      })),
    }));

    // Priorizar torneos cuyo nombre coincida exactamente con la búsqueda
    // (ej: "World Cup" antes que "World Cup - Qualification Europe")
    const searchTerm = normalizedQuery?.toLowerCase() || '';
    if (searchTerm) {
      leagues.sort((a: any, b: any) => {
        const aExact = a.name.toLowerCase() === searchTerm;
        const bExact = b.name.toLowerCase() === searchTerm;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        // Luego priorizar nombres que empiecen con el término buscado
        const aStarts = a.name.toLowerCase().startsWith(searchTerm);
        const bStarts = b.name.toLowerCase().startsWith(searchTerm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
    }

    await logApiUsage(identifier, 'search_leagues', null, { query: normalizedQuery || query, country });

    return Response.json({
      results: data.results,
      leagues,
    });
  } catch (err: any) {
    console.error('Leagues search error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
