const KNOWN_STATUSES = new Set([
  'NS', 'TBD', 'PST', '1H', 'HT', '2H', 'ET', 'BT', 'P',
  'SUSP', 'INT', 'FT', 'AET', 'PEN', 'AFT', 'CANC', 'ABD', 'AWD', 'WO', 'LIVE',
]);

/**
 * Normaliza un status de API-Football a un valor conocido.
 * Si no es reconocido, devuelve 'NS' (Not Started).
 */
export function normalizeMatchStatus(apiStatus: string | undefined): string {
  if (!apiStatus) return 'NS';
  if (KNOWN_STATUSES.has(apiStatus)) return apiStatus;
  return 'NS';
}
