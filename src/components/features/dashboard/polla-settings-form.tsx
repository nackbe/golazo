'use client';

import { useState, useTransition } from 'react';
import { Loader2, CheckCircle, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { updatePollaSettings } from '@/app/(dashboard)/pollas/[id]/configurar/actions';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'open', label: 'Abierta — acepta nuevos miembros' },
  { value: 'active', label: 'Activa — predicciones en curso' },
  { value: 'finished', label: 'Finalizada' },
];

const DEADLINE_OPTIONS = [
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '360', label: '6 horas antes' },
  { value: '1440', label: '24 horas antes' },
];

interface PointSystem {
  correct_result?: number;
  home_goals?: number;
  away_goals?: number;
  exact_score?: number;
  goal_difference?: number;
  total_goals?: number;
  team_qualified?: number;
  quarterfinals?: number;
  semifinalists?: number;
  finalist?: number;
  third_place?: number;
  champion?: number;
  [key: string]: number | undefined;
}

interface WildcardEntry {
  type: string;
  quantity: number;
}

interface Polla {
  id: string;
  name: string;
  status: string;
  auto_approve: boolean;
  admin_plays: boolean;
  bet_deadline_minutes: number;
  point_system: PointSystem | null;
  wildcards: WildcardEntry[] | null;
  special_point_system: Record<string, number>;
}

const POINT_FIELDS: Array<{
  key: string;
  label: string;
  description: string;
  max: number;
  defaultVal: number;
}> = [
  { key: 'correct_result', label: 'Resultado correcto', description: 'Gana / empata / pierde sin importar el marcador', max: 100, defaultVal: 1 },
  { key: 'home_goals', label: 'Goles local exactos', description: 'Acierta la cantidad de goles del equipo local', max: 100, defaultVal: 1 },
  { key: 'away_goals', label: 'Goles visitante exactos', description: 'Acierta la cantidad de goles del equipo visitante', max: 100, defaultVal: 1 },
  { key: 'exact_score', label: 'Marcador exacto', description: 'Acierta el resultado final exacto (ej: 2-1)', max: 100, defaultVal: 3 },
  { key: 'goal_difference', label: 'Diferencia de goles exacta', description: 'Acierta la diferencia entre goles de ambos equipos', max: 100, defaultVal: 1 },
  { key: 'total_goals', label: 'Total de goles exacto', description: 'Acierta la suma de goles del partido', max: 100, defaultVal: 1 },
];

const SPECIAL_PREDICTION_FIELDS: Array<{
  key: string;
  label: string;
  description: string;
  max: number;
  defaultVal: number;
}> = [
  { key: 'champion', label: 'Campeón', description: 'Acierta el campeón del torneo', max: 100, defaultVal: 10 },
  { key: 'finalist', label: 'Finalista', description: 'Acierta el subcampeón', max: 100, defaultVal: 5 },
  { key: 'third_place', label: 'Tercer lugar', description: 'Acierta el tercer puesto', max: 100, defaultVal: 3 },
  { key: 'least_goals_against', label: 'Menos goleado', description: 'Equipo que reciba menos goles en todo el torneo', max: 100, defaultVal: 5 },
  { key: 'worst_team', label: 'La peor recocha', description: 'Último equipo en la tabla general', max: 100, defaultVal: 4 },
  { key: 'top_scorer_team', label: 'Goleador de fase de grupos', description: 'Equipo con más goles en fase de grupos', max: 100, defaultVal: 5 },
];

function ps(polla: Polla, key: string, defaultVal: number): number {
  return polla.point_system?.[key] ?? defaultVal;
}

function sps(polla: Polla, key: string, defaultVal: number): number {
  return polla.special_point_system?.[key] ?? defaultVal;
}

function wcQuantity(polla: Polla, type: string, defaultVal: number): number {
  return polla.wildcards?.find(w => w.type === type)?.quantity ?? defaultVal;
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-input'} disabled:opacity-50`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform absolute top-[2px] ${value ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
      />
    </button>
  );
}

function NumberInput({ name, defaultValue, min, max, disabled }: { name: string; defaultValue: number; min: number; max: number; disabled?: boolean }) {
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
      <span className="text-xs text-muted-foreground">pts</span>
    </div>
  );
}

function Section({ title, children, locked, defaultOpen = true }: { title: string; children: React.ReactNode; locked?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-base">{title}</h2>
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Lock className="h-2.5 w-2.5" />
              Bloqueado
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

export function PollaSettingsForm({ polla }: { polla: Polla }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [autoApprove, setAutoApprove] = useState(polla.auto_approve);
  const [adminPlays, setAdminPlays] = useState(polla.admin_plays);

  const isLocked = polla.status === 'active' || polla.status === 'finished';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set('auto_approve', autoApprove ? 'true' : 'false');
    fd.set('admin_plays', adminPlays ? 'true' : 'false');
    startTransition(async () => {
      const result = await updatePollaSettings(polla.id, fd);
      if (result?.error) setError(result.error);
      else {
        setSaved(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => setSaved(false), 5000);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-green-500/30 bg-green-600 px-5 py-3 text-sm text-white flex items-center gap-2 shadow-lg">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          Cambios guardados correctamente
        </div>
      )}

      {/* Configuración general */}
      <Section title="Configuración general" defaultOpen>
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
            disabled={isPending}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">Máximo 40 caracteres. Se puede cambiar cuando quieras.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className="text-sm font-semibold">Estado de la polla</label>
          {/* El select muestra el valor pero no envía nada (disabled o sin name). 
              El hidden input envía el status real para evitar problemas con disabled. */}
          <input type="hidden" name="status" defaultValue={polla.status} />
          <select
            id="status"
            defaultValue={polla.status}
            disabled={isPending || isLocked}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isLocked 
              ? 'El estado no se puede cambiar una vez que la polla está activa o finalizada.'
              : 'Cambiá a Abierta para que tus amigos puedan unirse con el código.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bet_deadline_minutes" className="text-sm font-semibold">Cierre de predicciones</label>
          <select
            id="bet_deadline_minutes"
            name="bet_deadline_minutes"
            defaultValue={String(polla.bet_deadline_minutes)}
            disabled={isPending}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            {DEADLINE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Las predicciones se cierran automáticamente antes de cada partido según el horario del servidor.
          </p>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border p-4">
          <Toggle value={autoApprove} onChange={setAutoApprove} disabled={isPending} />
          <div>
            <p className="text-sm font-semibold">Aprobación automática</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {autoApprove
                ? 'Cualquiera con el código entra directamente sin tu aprobación.'
                : 'Vos aprobás manualmente cada solicitud en la sección de pendientes.'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border p-4">
          <Toggle value={adminPlays} onChange={setAdminPlays} disabled={isPending} />
          <div>
            <p className="text-sm font-semibold">El admin juega en el ranking</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {adminPlays
                ? 'Tus predicciones cuentan y aparecés en el ranking junto a los demás jugadores.'
                : 'No aparecés en el ranking ni se calculan tus puntos. Solo administrás la polla.'}
            </p>
          </div>
        </div>
      </Section>

      {/* Sistema de puntos */}
      <Section title="Sistema de puntos" locked={isLocked} defaultOpen={!isLocked}>
        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Los puntos no se pueden cambiar cuando la polla está activa o finalizada para garantizar la igualdad del juego.
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Predicciones de partido</p>
          <div className="space-y-3">
            {POINT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                </div>
                <NumberInput
                  name={`ps_${f.key}`}
                  defaultValue={ps(polla, f.key, f.defaultVal)}
                  min={0}
                  max={f.max}
                  disabled={isPending || isLocked}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Predicciones especiales de torneo</p>
          <p className="text-xs text-muted-foreground mb-3">Puntos que ganará cada jugador por acertar las predicciones especiales hechas antes del primer partido.</p>
          <div className="space-y-3">
            {SPECIAL_PREDICTION_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                </div>
                <NumberInput
                  name={`ps_${f.key}`}
                  defaultValue={sps(polla, f.key, f.defaultVal)}
                  min={0}
                  max={f.max}
                  disabled={isPending || isLocked}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Los puntos de partido son acumulables.</strong> Si acertás el marcador exacto, ganás al mismo tiempo los puntos por goles local exactos, goles visitante exactos, marcador exacto, diferencia de goles y total de goles. Con los valores default eso suma <strong className="text-foreground">8 puntos</strong> por partido (sin comodín).
        </div>
      </Section>

      {/* Comodines */}
      <Section title="Comodines" locked={isLocked} defaultOpen={!isLocked}>
        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Los comodines no se pueden cambiar una vez que la polla está activa.
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">Comodines x2</p>
              <p className="text-xs text-muted-foreground mt-0.5">Multiplica x2 todos los puntos de un partido. Si fallás, el comodín se consume igual.</p>
              <p className="text-xs text-muted-foreground">Rango: 0–100 por jugador</p>
            </div>
            <NumberInput
              name="wc_x2"
              defaultValue={wcQuantity(polla, 'x2', 2)}
              min={0}
              max={100}
              disabled={isPending || isLocked}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">Comodines x3</p>
              <p className="text-xs text-muted-foreground mt-0.5">Multiplica x3 todos los puntos de un partido. Mayor riesgo, mayor recompensa.</p>
              <p className="text-xs text-muted-foreground">Rango: 0–100 por jugador</p>
            </div>
            <NumberInput
              name="wc_x3"
              defaultValue={wcQuantity(polla, 'x3', 1)}
              min={0}
              max={100}
              disabled={isPending || isLocked}
            />
          </div>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
          Cada jugador puede usar <strong className="text-foreground">un solo comodín por partido</strong>. El multiplicador aplica sobre el total acumulado del partido, incluyendo marcador exacto, diferencia de goles, etc.
        </div>
      </Section>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          'Guardar todos los cambios'
        )}
      </button>
    </form>
  );
}
