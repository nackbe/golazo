'use client';

import { useState, useTransition } from 'react';
import { Loader2, CheckCircle, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import {
  updateGeneralSettings,
  updatePointSystem,
  updateWildcards,
} from '@/app/(dashboard)/pollas/[id]/configurar/actions';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'open', label: 'Abierta — acepta nuevos miembros' },
  { value: 'active', label: 'Activa — predicciones en curso' },
  { value: 'finished', label: 'Finalizada' },
];

const DEADLINE_OPTIONS = [
  { value: '1', label: '1 minuto antes' },
  { value: '5', label: '5 minutos antes' },
  { value: '15', label: '15 minutos antes' },
];

// Opciones legacy para backward compatibility (pollas creadas antes del cambio)
const LEGACY_DEADLINE_OPTIONS = [
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '360', label: '6 horas antes' },
  { value: '1440', label: '24 horas antes' },
];

const POINT_FIELDS = [
  { key: 'correct_result', label: 'Resultado correcto', description: 'Gana / empata / pierde sin importar el marcador', defaultVal: 1 },
  { key: 'home_goals', label: 'Goles local exactos', description: 'Acierta la cantidad de goles del equipo local', defaultVal: 1 },
  { key: 'away_goals', label: 'Goles visitante exactos', description: 'Acierta la cantidad de goles del equipo visitante', defaultVal: 1 },
  { key: 'exact_score', label: 'Marcador exacto', description: 'Acierta el resultado final exacto (ej: 2-1)', defaultVal: 3 },
  { key: 'goal_difference', label: 'Diferencia de goles exacta', description: 'Acierta la diferencia entre goles de ambos equipos', defaultVal: 1 },
  { key: 'total_goals', label: 'Total de goles exacto', description: 'Acierta la suma de goles del partido', defaultVal: 1 },
  { key: 'unique_exact_bonus', label: 'Bonus marcador único y exacto', description: 'Si solo un jugador acierta el marcador exacto, multiplica sus puntos de exacto por este valor. 0 = desactivado.', defaultVal: 0 },
];

const SPECIAL_FIELDS = [
  { key: 'champion', label: 'Campeón', description: 'Acierta el campeón del torneo', defaultVal: 10 },
  { key: 'finalist', label: 'Finalista', description: 'Acierta el subcampeón', defaultVal: 5 },
  { key: 'third_place', label: 'Tercer lugar', description: 'Acierta el tercer puesto', defaultVal: 3 },
  { key: 'least_goals_against', label: 'Menos goleado', description: 'Equipo que reciba menos goles en todo el torneo', defaultVal: 5 },
  { key: 'worst_team', label: 'La peor recocha', description: 'Último equipo en la tabla general', defaultVal: 4 },
  { key: 'top_scorer_team', label: 'Goleador de fase de grupos', description: 'Equipo con más goles en fase de grupos', defaultVal: 5 },
];

interface Polla {
  id: string;
  name: string;
  status: string;
  auto_approve: boolean;
  admin_plays: boolean;
  auto_random_prediction: boolean;
  bet_deadline_minutes: number;
  point_system: Record<string, number> | null;
  wildcards: Array<{ type: string; quantity: number }> | null;
  special_point_system: Record<string, number>;
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-input'} disabled:opacity-50`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform absolute top-[2px] ${value ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
      />
    </button>
  );
}

function NumberInput({ name, defaultValue, min, max, disabled, unit = 'pts' }: { name: string; defaultValue: number; min: number; max: number; disabled?: boolean; unit?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        disabled={disabled}
        className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function Block({
  title,
  children,
  locked,
  onSubmit,
  isPending,
  saved,
  error,
}: {
  title: string;
  children: React.ReactNode;
  locked?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2">
          <h2 className="font-black text-lg tracking-tight text-foreground">{title}</h2>
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Lock className="h-2.5 w-2.5" />
              Bloqueado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
              <CheckCircle className="h-3.5 w-3.5" />
              Guardado
            </span>
          )}
          <button
            type="submit"
            disabled={isPending || locked}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
      <div className="px-5 py-5 space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {children}
      </div>
    </form>
  );
}

function useBlockSubmit(action: (pollaId: string, fd: FormData) => Promise<{ error?: string; success?: boolean }>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = (pollaId: string) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(pollaId, fd);
      if (result?.error) setError(result.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      }
    });
  };

  return { isPending, error, saved, submit };
}

export function PollaSettingsForm({ polla }: { polla: Polla }) {
  const isLocked = polla.status === 'active' || polla.status === 'finished';

  const general = useBlockSubmit(updateGeneralSettings);
  const points = useBlockSubmit(updatePointSystem);
  const wildcards = useBlockSubmit(updateWildcards);

  const [autoApprove, setAutoApprove] = useState(polla.auto_approve);
  const [adminPlays, setAdminPlays] = useState(polla.admin_plays);
  const [autoRandom, setAutoRandom] = useState(polla.auto_random_prediction);

  const ps = (key: string, def: number) => polla.point_system?.[key] ?? def;
  const sps = (key: string, def: number) => polla.special_point_system?.[key] ?? def;
  const wc = (type: string, def: number) => polla.wildcards?.find(w => w.type === type)?.quantity ?? def;

  return (
    <div className="space-y-4">
      {/* General */}
      <Block
        title="Configuración general"
        onSubmit={general.submit(polla.id)}
        isPending={general.isPending}
        saved={general.saved}
        error={general.error}
      >
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-semibold">Nombre de la polla</label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={polla.name}
            required
            minLength={3}
            maxLength={40}
            disabled={general.isPending}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">Máximo 40 caracteres.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className="text-sm font-semibold">Estado</label>
          <input type="hidden" name="status" defaultValue={polla.status} />
          <select
            id="status"
            defaultValue={polla.status}
            disabled={general.isPending || isLocked}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isLocked ? 'El estado no se puede cambiar una vez iniciada la polla.' : 'Cambiá a Abierta para que se unan con el código.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bet_deadline_minutes" className="text-sm font-semibold">Cierre de predicciones</label>
          <select
            id="bet_deadline_minutes"
            name="bet_deadline_minutes"
            defaultValue={String(polla.bet_deadline_minutes)}
            disabled={general.isPending}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            {DEADLINE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            {/* Si el valor actual es legacy, mostrarlo para que el admin sepa qué tiene */}
            {LEGACY_DEADLINE_OPTIONS.some(o => o.value === String(polla.bet_deadline_minutes)) && (
              <optgroup label="Valor actual (ya no recomendado)">
                {LEGACY_DEADLINE_OPTIONS
                  .filter(o => o.value === String(polla.bet_deadline_minutes))
                  .map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border p-4">
          <Toggle value={autoApprove} onChange={setAutoApprove} disabled={general.isPending} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Aprobación automática</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {autoApprove ? 'Cualquiera con el código entra directamente.' : 'Vos aprobás manualmente cada solicitud.'}
            </p>
          </div>
          <input type="hidden" name="auto_approve" value={autoApprove ? 'true' : 'false'} />
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border p-4">
          <Toggle value={adminPlays} onChange={setAdminPlays} disabled={general.isPending} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">El admin juega en el ranking</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {adminPlays ? 'Tus predicciones cuentan y aparecés en el ranking.' : 'No aparecés en el ranking.'}
            </p>
          </div>
          <input type="hidden" name="admin_plays" value={adminPlays ? 'true' : 'false'} />
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border p-4">
          <Toggle value={autoRandom} onChange={setAutoRandom} disabled={general.isPending} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Predicción automática para olvidadizos</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {autoRandom ? 'Si un jugador no predice, el sistema le asigna marcador aleatorio 0-10.' : 'Los jugadores que no predicen quedan sin puntos.'}
            </p>
          </div>
          <input type="hidden" name="auto_random_prediction" value={autoRandom ? 'true' : 'false'} />
        </div>
      </Block>

      {/* Puntos */}
      <Block
        title="Sistema de puntos"
        locked={isLocked}
        onSubmit={points.submit(polla.id)}
        isPending={points.isPending}
        saved={points.saved}
        error={points.error}
      >
        {isLocked && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            Los puntos no se pueden cambiar cuando la polla está activa o finalizada.
          </div>
        )}

        <div>
          <p className="text-sm font-black uppercase tracking-wider text-primary border-l-4 border-primary pl-2 mb-3">Predicciones de partido</p>
          <div className="space-y-3">
            {POINT_FIELDS.map(f => (
              <div key={f.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
                <NumberInput name={`ps_${f.key}`} defaultValue={ps(f.key, f.defaultVal)} min={0} max={100} disabled={points.isPending || isLocked} />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-black uppercase tracking-wider text-primary border-l-4 border-primary pl-2 mb-3">Predicciones especiales de torneo</p>
          <div className="space-y-3">
            {SPECIAL_FIELDS.map(f => (
              <div key={f.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
                <NumberInput name={`ps_${f.key}`} defaultValue={sps(f.key, f.defaultVal)} min={0} max={100} disabled={points.isPending || isLocked} />
              </div>
            ))}
          </div>
        </div>

      </Block>

      {/* Comodines */}
      <Block
        title="Comodines"
        locked={isLocked}
        onSubmit={wildcards.submit(polla.id)}
        isPending={wildcards.isPending}
        saved={wildcards.saved}
        error={wildcards.error}
      >
        {isLocked && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            Los comodines no se pueden cambiar una vez iniciada la polla.
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 rounded-xl border border-border p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Comodines x2</p>
              <p className="text-xs text-muted-foreground mt-0.5">Multiplica x2 todos los puntos de un partido.</p>
            </div>
            <NumberInput name="wc_x2" defaultValue={wc('x2', 2)} min={0} max={100} disabled={wildcards.isPending || isLocked} unit="" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 rounded-xl border border-border p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Comodines x3</p>
              <p className="text-xs text-muted-foreground mt-0.5">Multiplica x3 todos los puntos de un partido.</p>
            </div>
            <NumberInput name="wc_x3" defaultValue={wc('x3', 1)} min={0} max={100} disabled={wildcards.isPending || isLocked} unit="" />
          </div>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
          Cada jugador puede usar <strong className="text-foreground">un solo comodín por partido</strong>. El multiplicador aplica sobre los puntos ganados en ese partido.
        </div>
      </Block>
    </div>
  );
}
