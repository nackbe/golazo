import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPointSystem, getSpecialPointSystem } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POINT_LABELS: Record<string, string> = {
  exact_score: 'Marcador exacto',
  correct_result: 'Acertar ganador',
  home_goals: 'Goles del local',
  away_goals: 'Goles del visitante',
  goal_difference: 'Diferencia de goles',
  total_goals: 'Total de goles',
};

const POINT_ORDER = [
  'exact_score',
  'correct_result',
  'home_goals',
  'away_goals',
  'goal_difference',
  'total_goals',
];

const SPECIAL_LABELS: Record<string, string> = {
  champion: 'Campeon del torneo',
  finalist: 'Finalista (subcampeon)',
  third_place: 'Tercer lugar',
  least_goals_against: 'Mejor defensa',
  worst_team: 'Peor equipo',
  top_scorer_team: 'Maximo goleador (equipo)',
};

const SPECIAL_ORDER = [
  'champion',
  'finalist',
  'third_place',
  'least_goals_against',
  'worst_team',
  'top_scorer_team',
];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = createAdminClient();
    const { data: polla, error } = await admin
      .from('pollas')
      .select('id, name, code, status, point_system, wildcards, special_point_system, auto_random_prediction, tournaments(name)')
      .eq('id', params.id)
      .single();

    if (error || !polla) {
      return new Response(`Polla not found: ${error?.message || 'no row'}`, { status: 404 });
    }

    if (polla.status === 'draft') {
      return new Response('Polla not active yet', { status: 403 });
    }

    const ps = getPointSystem(polla.point_system);
    const sps = getSpecialPointSystem(polla.special_point_system);
    const wildcards = (polla.wildcards as any[] | null) || [];
    const x2 = wildcards.find((w) => w.type === 'x2')?.quantity ?? 0;
    const x3 = wildcards.find((w) => w.type === 'x3')?.quantity ?? 0;
    const tournamentName = (polla.tournaments as any)?.name ?? 'Torneo';

    const pointRows = POINT_ORDER
      .filter((k) => (ps as any)[k] > 0)
      .map((k) => ({ label: POINT_LABELS[k], pts: (ps as any)[k] }));

    const specialRows = SPECIAL_ORDER
      .filter((k) => (sps as any)[k] > 0)
      .map((k) => ({ label: SPECIAL_LABELS[k], pts: (sps as any)[k] }));

    const uniqueBonus = ps.unique_exact_bonus;
    const autoRandom = (polla as any).auto_random_prediction === true;

    return new ImageResponse(
      (
        <div
          style={{
            width: '1080px',
            height: '1920px',
            display: 'flex',
            flexDirection: 'column',
            background: '#0d3d1f',
            padding: '60px 60px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '36px',
            }}
          >
            <div style={{ display: 'flex', fontSize: '46px', fontWeight: 900, letterSpacing: '2px' }}>
              GOLAZO
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '40px',
                fontWeight: 800,
                marginTop: '20px',
                textAlign: 'center',
              }}
            >
              {polla.name}
            </div>
            <div style={{ display: 'flex', fontSize: '24px', opacity: 0.7, marginTop: '4px' }}>
              {tournamentName}
            </div>
          </div>

          {/* Puntos por partido */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '28px 32px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '30px',
                fontWeight: 800,
                marginBottom: '16px',
              }}
            >
              Puntos por partido
            </div>
            {pointRows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '26px',
                  padding: '8px 0',
                  borderBottom:
                    i < pointRows.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                }}
              >
                <div style={{ display: 'flex', opacity: 0.9 }}>{row.label}</div>
                <div style={{ display: 'flex', fontWeight: 900, color: '#fbbf24' }}>
                  +{row.pts} pts
                </div>
              </div>
            ))}
            {uniqueBonus > 1 && (
              <div
                style={{
                  display: 'flex',
                  marginTop: '14px',
                  padding: '12px 16px',
                  background: 'rgba(251,191,36,0.15)',
                  borderRadius: '12px',
                  fontSize: '20px',
                  color: '#fde68a',
                }}
              >
                Unico exacto: x{uniqueBonus} sobre marcador exacto
              </div>
            )}
          </div>

          {/* Comodines */}
          {(x2 > 0 || x3 > 0) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '28px 32px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '30px',
                  fontWeight: 800,
                  marginBottom: '14px',
                }}
              >
                Comodines
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                {x2 > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      background: 'rgba(251,191,36,0.15)',
                      borderRadius: '14px',
                      padding: '18px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        fontSize: '46px',
                        fontWeight: 900,
                        color: '#fbbf24',
                      }}
                    >
                      x2
                    </div>
                    <div style={{ display: 'flex', fontSize: '20px', marginTop: '4px' }}>
                      {x2} disponible{x2 !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
                {x3 > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      background: 'rgba(167,139,250,0.18)',
                      borderRadius: '14px',
                      padding: '18px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        fontSize: '46px',
                        fontWeight: 900,
                        color: '#c4b5fd',
                      }}
                    >
                      x3
                    </div>
                    <div style={{ display: 'flex', fontSize: '20px', marginTop: '4px' }}>
                      {x3} disponible{x3 !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '20px',
                  opacity: 0.85,
                  lineHeight: 1.4,
                  marginTop: '14px',
                }}
              >
                Podés usarlos en los partidos que elijas para multiplicar los puntos que ganes en esos partidos. ¡Usalos cuando estés muyyy seguro!
              </div>
            </div>
          )}

          {/* Predicciones especiales */}
          {specialRows.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '28px 32px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '30px',
                  fontWeight: 800,
                  marginBottom: '6px',
                }}
              >
                Predicciones especiales del torneo
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '18px',
                  opacity: 0.65,
                  marginBottom: '14px',
                }}
              >
                Se eligen una sola vez antes del primer partido.
              </div>
              {specialRows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '24px',
                    padding: '8px 0',
                    borderBottom:
                      i < specialRows.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', opacity: 0.9 }}>{row.label}</div>
                  <div style={{ display: 'flex', fontWeight: 900, color: '#fbbf24' }}>
                    +{row.pts} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Aleatorio si olvidaste predecir */}
          {autoRandom && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(251,191,36,0.12)',
                border: '2px solid rgba(251,191,36,0.4)',
                borderRadius: '20px',
                padding: '20px 24px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#fde68a',
                  marginBottom: '6px',
                }}
              >
                Predicción automática
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '20px',
                  lineHeight: 1.4,
                  opacity: 0.92,
                }}
              >
                Si no alcanzás a poner tu predicción antes del cierre del partido, el sistema te asigna una al azar (entre 0 y 10 goles por equipo). ¡Mejor que cero, pero no te confíes!
              </div>
            </div>
          )}

          {/* Footer — código */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '20px',
              padding: '20px 24px',
            }}
          >
            <div style={{ display: 'flex', fontSize: '20px', opacity: 0.7, letterSpacing: '2px' }}>
              CODIGO DE INVITACION
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '58px',
                fontWeight: 900,
                letterSpacing: '8px',
                marginTop: '6px',
                fontFamily: 'monospace',
              }}
            >
              {polla.code}
            </div>
            <div style={{ display: 'flex', fontSize: '18px', opacity: 0.5, marginTop: '12px' }}>
              golazo-puce.vercel.app
            </div>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1920,
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      }
    );
  } catch (e: any) {
    console.error('Cheatsheet render error:', e);
    return new Response(`Render error: ${e?.message ?? String(e)}`, { status: 500 });
  }
}
