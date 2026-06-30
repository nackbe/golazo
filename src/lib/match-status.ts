const KNOWN_STATUSES = new Set([
  'NS', 'TBD', 'PST', '1H', 'HT', '2H', 'ET', 'BT', 'P',
  'SUSP', 'INT', 'FT', 'AET', 'PEN', 'AFT', 'CANC', 'ABD', 'AWD', 'WO', 'LIVE',
]);

/**
 * Status terminales: el match terminó y el marcador a 90 min
 * (home_goals/away_goals) ya está definido para scoring.
 *
 * - FT: terminó en regulación.
 * - AFT: terminó (alias).
 * - AET: terminó tras tiempo extra. El marcador 90 min sigue válido — ET no
 *   afecta predicciones.
 * - PEN: terminó por penales. Idem, 90 min es la predicción.
 *
 * AWD/CANC/ABD/WO no entran: no hay marcador real para puntuar.
 */
export const TERMINAL_MATCH_STATUSES = ['FT', 'AFT', 'AET', 'PEN'] as const;

/**
 * Normaliza un status de API-Football a un valor conocido.
 * Si no es reconocido, devuelve 'NS' (Not Started).
 */
export function normalizeMatchStatus(apiStatus: string | undefined): string {
  if (!apiStatus) return 'NS';
  if (KNOWN_STATUSES.has(apiStatus)) return apiStatus;
  return 'NS';
}

/**
 * True si el match terminó con marcador válido para scoring.
 */
export function isMatchTerminal(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_MATCH_STATUSES as readonly string[]).includes(status);
}
