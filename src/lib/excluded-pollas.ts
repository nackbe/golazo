/**
 * IDs de pollas que son test/demo — excluidas de todos los cálculos del cron
 * (batch, orphan detection, affected pollas). Sus predicciones y match_points
 * quedan intactos en DB; simplemente no se recalculan ni pesan en el cron.
 *
 * Para agregar/quitar: editar el Set y hacer un deploy.
 */
export const EXCLUDED_POLLA_IDS = new Set<string>([
  '3b58a482-a732-4932-b141-822999f54e42', // DEMO99 — DEMO Copa América (test)
  '7e226f3f-e727-4d1a-b263-a9f231dae669', // MEGA99 — MEGA Liga 30 (test)
]);

export function isExcludedPolla(pollaId: string): boolean {
  return EXCLUDED_POLLA_IDS.has(pollaId);
}
