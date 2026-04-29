/**
 * API-Football client (RapidAPI)
 * Docs: https://www.api-football.com/documentation-v3
 */

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
const BASE_URL = 'https://v3.football.api-sports.io';

interface ApiOptions {
  league?: number;
  season?: number;
  fixture?: number;
  date?: string;
  timezone?: string;
  [key: string]: string | number | undefined;
}

async function fetchFootball(endpoint: string, options: ApiOptions = {}) {
  if (!API_KEY) {
    throw new Error('API_FOOTBALL_KEY is not defined');
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': API_HOST,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getFixtures(leagueId: number, season: number) {
  return fetchFootball('fixtures', { league: leagueId, season });
}

export async function getLiveFixtures(leagueId?: number) {
  const opts: ApiOptions = { live: 'all' };
  if (leagueId) opts.league = leagueId;
  return fetchFootball('fixtures', opts);
}

export async function getFixtureById(fixtureId: number) {
  return fetchFootball('fixtures', { id: fixtureId });
}

export async function getFixturesByIds(fixtureIds: number[]) {
  // API-Football permite hasta 10 IDs separados por guión
  const batches: number[][] = [];
  for (let i = 0; i < fixtureIds.length; i += 10) {
    batches.push(fixtureIds.slice(i, i + 10));
  }

  const results: any[] = [];
  for (const batch of batches) {
    const data = await fetchFootball('fixtures', { ids: batch.join('-') });
    if (data?.response) {
      results.push(...data.response);
    }
  }
  return { response: results };
}
