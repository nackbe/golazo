'use client';

import { useState } from 'react';
import { Loader2, Zap, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { savePrediction } from '@/app/(dashboard)/pollas/[id]/prediccion/actions';

interface Props {
  pollaId: string;
  matchId: string;
  isOpen: boolean;
  existingPrediction: {
    home_goals: number;
    away_goals: number;
    wildcard_used: 'x2' | 'x3' | null;
  } | null;
  wildcardsAvailable: { x2: number; x3: number };
}

function GoalInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-lg font-bold transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className="h-14 w-16 rounded-xl border bg-background text-center text-3xl font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || value >= 20}
          onClick={() => onChange(Math.min(20, value + 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-lg font-bold transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function PredictionForm({
  pollaId,
  matchId,
  isOpen,
  existingPrediction,
  wildcardsAvailable,
}: Props) {
  const [homeGoals, setHomeGoals] = useState(existingPrediction?.home_goals ?? 0);
  const [awayGoals, setAwayGoals] = useState(existingPrediction?.away_goals ?? 0);
  const [wildcard, setWildcard] = useState<'x2' | 'x3' | null>(
    existingPrediction?.wildcard_used || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('polla_id', pollaId);
    formData.append('match_id', matchId);
    formData.append('home_goals', String(homeGoals));
    formData.append('away_goals', String(awayGoals));
    if (wildcard) formData.append('wildcard', wildcard);

    const result = await savePrediction(formData);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      const returnUrl = sessionStorage.getItem('fixtureReturnUrl') || `/pollas/${pollaId}/fixture`;
      window.location.href = returnUrl;
    }
  };

  if (!isOpen) {
    return (
      <div className="rounded-xl border bg-muted/50 p-6 text-center space-y-1">
        <p className="font-medium text-muted-foreground text-sm">
          El plazo de apuestas para este partido ya cerró.
        </p>
        {existingPrediction && (
          <p className="text-2xl font-black">
            {existingPrediction.home_goals} – {existingPrediction.away_goals}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center gap-6">
        <GoalInput label="Local" value={homeGoals} onChange={setHomeGoals} disabled={isLoading} />
        <span className="text-2xl font-bold text-muted-foreground pb-6">–</span>
        <GoalInput label="Visitante" value={awayGoals} onChange={setAwayGoals} disabled={isLoading} />
      </div>

      {/* Comodines */}
      {(wildcardsAvailable.x2 > 0 || wildcardsAvailable.x3 > 0 || wildcard) && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Comodín (opcional)</label>
          <div className="flex gap-2">
            {(wildcardsAvailable.x2 > 0 || wildcard === 'x2') && (
              <button
                type="button"
                onClick={() => setWildcard(wildcard === 'x2' ? null : 'x2')}
                disabled={wildcard !== 'x2' && wildcardsAvailable.x2 <= 0}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  wildcard === 'x2'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700'
                    : 'border-border bg-background hover:bg-accent'
                }`}
              >
                <Zap className="h-4 w-4" />
                x2 {wildcard === 'x2' ? '(activo)' : `(${wildcardsAvailable.x2} disp.)`}
              </button>
            )}
            {(wildcardsAvailable.x3 > 0 || wildcard === 'x3') && (
              <button
                type="button"
                onClick={() => setWildcard(wildcard === 'x3' ? null : 'x3')}
                disabled={wildcard !== 'x3' && wildcardsAvailable.x3 <= 0}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  wildcard === 'x3'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-700'
                    : 'border-border bg-background hover:bg-accent'
                }`}
              >
                <Zap className="h-4 w-4" />
                x3 {wildcard === 'x3' ? '(activo)' : `(${wildcardsAvailable.x3} disp.)`}
              </button>
            )}
          </div>
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : existingPrediction ? (
          'Actualizar predicción'
        ) : (
          'Guardar predicción'
        )}
      </Button>
    </form>
  );
}
