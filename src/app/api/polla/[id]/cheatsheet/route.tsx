import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPointSystem, DEFAULT_POINTS } from '@/lib/scoring';

export const runtime = 'edge';

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: polla } = await admin
    .from('pollas')
    .select('id, name, code, status, point_system, wildcards, tournaments(name)')
    .eq('id', params.id)
    .single();

  if (!polla) {
    return new Response('Polla not found', { status: 404 });
  }

  // Reglas no se exponen en draft (pueden cambiar)
  if (polla.status === 'draft') {
    return new Response('Polla not active yet', { status: 403 });
  }

  const ps = getPointSystem(polla.point_system);
  const wildcards = (polla.wildcards as any[] | null) || [];
  const x2 = wildcards.find((w) => w.type === 'x2')?.quantity ?? 0;
  const x3 = wildcards.find((w) => w.type === 'x3')?.quantity ?? 0;
  const tournamentName = (polla.tournaments as any)?.name ?? 'Torneo';

  const pointRows = POINT_ORDER
    .filter((k) => (ps as any)[k] > 0)
    .map((k) => ({ label: POINT_LABELS[k], pts: (ps as any)[k] }));

  const uniqueBonus = ps.unique_exact_bonus;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1920px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #0d3d1f 0%, #134e2a 60%, #0a2e17 100%)',
          padding: '80px 70px',
          fontFamily: 'sans-serif',
          color: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '50px' }}>
          <div style={{ fontSize: '90px', marginBottom: '10px' }}>⚽</div>
          <div style={{ fontSize: '52px', fontWeight: 900, letterSpacing: '-1px' }}>GOLAZO</div>
          <div style={{ fontSize: '38px', fontWeight: 700, marginTop: '30px', textAlign: 'center' }}>{polla.name}</div>
          <div style={{ fontSize: '24px', opacity: 0.7, marginTop: '6px' }}>{tournamentName}</div>
        </div>

        {/* Puntos */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '36px 40px',
            marginBottom: '30px',
          }}
        >
          <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '24px' }}>💰 Puntos por partido</div>
          {pointRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '28px',
                padding: '12px 0',
                borderBottom: i < pointRows.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}
            >
              <span style={{ opacity: 0.9 }}>{row.label}</span>
              <span style={{ fontWeight: 900, color: '#fbbf24' }}>+{row.pts} pts</span>
            </div>
          ))}
          {uniqueBonus > 1 && (
            <div
              style={{
                display: 'flex',
                marginTop: '18px',
                padding: '14px 18px',
                background: 'rgba(251,191,36,0.15)',
                borderRadius: '14px',
                fontSize: '22px',
                color: '#fde68a',
              }}
            >
              🎯 Único en acertar marcador exacto → ×{uniqueBonus}
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
              borderRadius: '24px',
              padding: '36px 40px',
              marginBottom: '30px',
            }}
          >
            <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '20px' }}>🃏 Comodines</div>
            <div style={{ display: 'flex', gap: '20px' }}>
              {x2 > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                    background: 'rgba(251,191,36,0.15)',
                    borderRadius: '18px',
                    padding: '24px',
                  }}
                >
                  <div style={{ fontSize: '54px', fontWeight: 900, color: '#fbbf24' }}>×2</div>
                  <div style={{ fontSize: '24px', marginTop: '6px' }}>{x2} disponible{x2 !== 1 ? 's' : ''}</div>
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
                    borderRadius: '18px',
                    padding: '24px',
                  }}
                >
                  <div style={{ fontSize: '54px', fontWeight: 900, color: '#c4b5fd' }}>×3</div>
                  <div style={{ fontSize: '24px', marginTop: '6px' }}>{x3} disponible{x3 !== 1 ? 's' : ''}</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '20px', opacity: 0.7, marginTop: '16px' }}>
              Activá un comodín antes del cierre del partido para multiplicar tus puntos.
            </div>
          </div>
        )}

        {/* Cómo ganar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '36px 40px',
            marginBottom: '30px',
          }}
        >
          <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '18px' }}>🏆 Cómo ganar</div>
          <div style={{ fontSize: '24px', lineHeight: 1.5, opacity: 0.92 }}>
            Predecí el marcador antes que cierre el partido. Si acertás exacto sumás{' '}
            <span style={{ fontWeight: 900, color: '#fbbf24' }}>{ps.exact_score} pts</span>. Si no, podés
            sumar por acertar el ganador o la diferencia de goles. El que más puntos acumule al final del
            torneo gana.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 'auto',
          }}
        >
          <div style={{ fontSize: '22px', opacity: 0.7 }}>CÓDIGO DE INVITACIÓN</div>
          <div
            style={{
              fontSize: '64px',
              fontWeight: 900,
              letterSpacing: '12px',
              marginTop: '8px',
              fontFamily: 'monospace',
            }}
          >
            {polla.code}
          </div>
          <div style={{ fontSize: '20px', opacity: 0.5, marginTop: '24px' }}>golazo-puce.vercel.app</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    }
  );
}
