'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trophy, AlertTriangle, CheckCircle, Shield, Skull, Goal, Sparkles, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveSpecialPredictions } from '@/app/(dashboard)/pollas/[id]/predicciones-especiales/actions';

interface Team {
  id: string;
  name: string;
  logo_url: string | null;
}

interface ExistingPrediction {
  type: string;
  team_id: string | null;
  player_name: string | null;
}

interface Props {
  pollaId: string;
  teams: Team[];
  firstMatchDate?: string;
  points: Record<string, number>;
  existingPredictions: ExistingPrediction[];
}

const PREDICTIONS: Array<{
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  badgeColor: string;
}> = [
  {
    key: 'champion',
    label: 'Campeón del torneo',
    description: 'El equipo que ganará el torneo',
    icon: <Trophy className="h-5 w-5 text-amber-500" />,
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50/50',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'finalist',
    label: 'Finalista (subcampeón)',
    description: 'El equipo que perderá la final',
    icon: <Trophy className="h-5 w-5 text-slate-400" />,
    borderColor: 'border-slate-200',
    bgColor: 'bg-slate-50/50',
    badgeColor: 'bg-slate-100 text-slate-700',
  },
  {
    key: 'third_place',
    label: 'Tercer lugar',
    description: 'El equipo que quedará en tercer puesto',
    icon: <Trophy className="h-5 w-5 text-orange-400" />,
    borderColor: 'border-orange-200',
    bgColor: 'bg-orange-50/50',
    badgeColor: 'bg-orange-100 text-orange-700',
  },
  {
    key: 'least_goals_against',
    label: 'Equipo menos goleado',
    description: 'El equipo que reciba menos goles en todo el torneo',
    icon: <Shield className="h-5 w-5 text-blue-500" />,
    borderColor: 'border-blue-200',
    bgColor: 'bg-blue-50/50',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'worst_team',
    label: 'La peor recocha',
    description: 'El último equipo en la tabla general del torneo',
    icon: <Skull className="h-5 w-5 text-red-500" />,
    borderColor: 'border-red-200',
    bgColor: 'bg-red-50/50',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    key: 'top_scorer_team',
    label: 'Goleador de fase de grupos',
    description: 'El equipo con más goles en la fase de grupos',
    icon: <Goal className="h-5 w-5 text-emerald-500" />,
    borderColor: 'border-emerald-200',
    bgColor: 'bg-emerald-50/50',
    badgeColor: 'bg-emerald-100 text-emerald-700',
  },
];

export function SpecialPredictionsForm({ pollaId, teams, firstMatchDate, points, existingPredictions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const isEditing = existingPredictions.length > 0;

  // Map existing predictions by type for pre-selection
  const existingByType = new Map<string, string>();
  for (const p of existingPredictions) {
    if (p.team_id) existingByType.set(p.type, p.team_id);
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveSpecialPredictions(pollaId, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  };

  if (saved) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
          <CheckCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-green-800">
          {isEditing ? 'Predicciones actualizadas' : 'Predicciones guardadas'}
        </h2>
        <p className="text-sm text-green-700">
          ¡Buena suerte! No se pueden modificar una vez cerrado el plazo.
        </p>
        <Button
          onClick={() => { setSaved(false); router.refresh(); }}
          variant="outline"
          size="sm"
          className="mt-2"
        >
          {isEditing ? 'Seguir editando' : 'Volver al formulario'}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <Pencil className="h-4 w-4 flex-shrink-0" />
          <span>Estás editando tus predicciones. Podés cambiarlas hasta que cierre el plazo.</span>
        </div>
      )}

      {firstMatchDate && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Se cierran antes del primer partido: <strong>{firstMatchDate}</strong></span>
        </div>
      )}

      <div className="grid gap-3">
        {PREDICTIONS.map((pred) => (
          <div
            key={pred.key}
            className={`rounded-xl border ${pred.borderColor} ${pred.bgColor} p-4 space-y-2.5 transition-shadow hover:shadow-sm`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                  {pred.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-tight">{pred.label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-tight">{pred.description}</p>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${pred.badgeColor}`}>
                {points[pred.key] ?? 0} pts
              </span>
            </div>

            <select
              name={pred.key}
              required
              defaultValue={existingByType.get(pred.key) || ''}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Seleccionar equipo...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 inline-block mr-1 text-primary" />
        <strong className="text-foreground">Importante:</strong> Las predicciones especiales se hacen una sola vez antes del primer partido. Podés editarlas mientras el plazo esté abierto.
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full gap-1.5 bg-primary-dark hover:bg-primary-dark/90"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {isEditing ? 'Actualizar predicciones' : 'Guardar predicciones especiales'}
          </>
        )}
      </Button>
    </form>
  );
}
