'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Download, AlertCircle, X, CheckSquare, Square, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { activatePolla, recalculatePoints } from '@/app/(dashboard)/pollas/[id]/configurar/actions';

interface LoadFixturesButtonProps {
  pollaId: string;
  tournamentId: string;
  loadAction: (pollaId: string, selectedRounds?: string[]) => Promise<any>;
  label?: string;
  skipRoundSelector?: boolean;
}

export function LoadFixturesButton({ pollaId, tournamentId, loadAction, label, skipRoundSelector }: LoadFixturesButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'error' | 'warning' | 'success'; message: string } | null>(null);
  const [showRounds, setShowRounds] = useState(false);
  const [rounds, setRounds] = useState<string[]>([]);
  const [selectedRounds, setSelectedRounds] = useState<Set<string>>(new Set());
  const [loadingRounds, setLoadingRounds] = useState(false);
  const router = useRouter();

  async function openRoundsSelector() {
    setFeedback(null);
    setLoadingRounds(true);
    try {
      const res = await fetch(`/api/fixtures/rounds?tournamentId=${tournamentId}`);
      const data = await res.json();
      if (data.rounds && data.rounds.length > 0) {
        setRounds(data.rounds);
        setSelectedRounds(new Set(data.rounds));
        setShowRounds(true);
      } else if (data.rounds && data.rounds.length === 0) {
        // La liga no tiene rondas definidas, cargar todos los partidos directamente
        confirmLoad([]);
      } else {
        // Error del endpoint, intentar cargar sin filtrar
        setFeedback({ type: 'warning', message: data.error || 'No se pudieron obtener las fases, se cargarán todos los partidos' });
        confirmLoad([]);
      }
    } catch (err: any) {
      setFeedback({ type: 'warning', message: err.message || 'Error al consultar fases, se cargarán todos los partidos' });
      confirmLoad([]);
    } finally {
      setLoadingRounds(false);
    }
  }

  function toggleRound(round: string) {
    const next = new Set(selectedRounds);
    if (next.has(round)) {
      next.delete(round);
    } else {
      next.add(round);
    }
    setSelectedRounds(next);
  }

  function selectAllRounds() {
    setSelectedRounds(new Set(rounds));
  }

  function deselectAllRounds() {
    setSelectedRounds(new Set());
  }

  function confirmLoad(roundsOverride?: string[]) {
    setShowRounds(false);
    startTransition(async () => {
      try {
        const roundsToLoad = roundsOverride ?? Array.from(selectedRounds);
        const result = await loadAction(pollaId, roundsToLoad.length > 0 ? roundsToLoad : undefined);
        if (result?.error) {
          setFeedback({ type: 'error', message: result.error });
        } else if (result?.warning) {
          setFeedback({ type: 'warning', message: result.warning });
        } else if (result?.success) {
          const msg = result.message
            || `Se ${result.fixturesImported === 1 ? 'cargó' : 'cargaron'} ${result.fixturesImported} partido${result.fixturesImported !== 1 ? 's' : ''}${result.wasTruncated ? ' (lista truncada a 500)' : ''}.`;
          setFeedback({ type: 'success', message: msg });
        }
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Error al cargar partidos' });
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {feedback && (
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded max-w-[280px] ${
          feedback.type === 'success'
            ? 'text-green-700 bg-green-50'
            : feedback.type === 'error'
            ? 'text-red-700 bg-red-50'
            : 'text-amber-700 bg-amber-50'
        }`}>
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span className="line-clamp-2">{feedback.message}</span>
        </div>
      )}

      {showRounds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">Seleccionar fases</h3>
              <button
                onClick={() => setShowRounds(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">
                Marcá las fases que querés incluir en la polla.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllRounds}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={deselectAllRounds}
                  className="text-[11px] font-medium text-muted-foreground hover:underline"
                >
                  Desmarcar
                </button>
              </div>
            </div>
            <div className="max-h-60 overflow-auto space-y-1 mb-4">
              {rounds.map((round) => (
                <label
                  key={round}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleRound(round)}
                    className="flex-shrink-0"
                  >
                    {selectedRounds.has(round) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <span className={selectedRounds.has(round) ? '' : 'text-muted-foreground'}>
                    {round}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowRounds(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700"
                disabled={selectedRounds.size === 0}
                onClick={() => confirmLoad()}
              >
                <Download className="h-4 w-4" />
                Cargar {selectedRounds.size} fase{selectedRounds.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        disabled={isPending || loadingRounds}
        onClick={skipRoundSelector ? () => confirmLoad([]) : openRoundsSelector}
        className="gap-1.5 bg-amber-600 hover:bg-amber-700"
      >
        {isPending || loadingRounds ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isPending || loadingRounds ? 'Cargando...' : (label || 'Cargar partidos')}
      </Button>
    </div>
  );
}

interface ActivatePollaButtonProps {
  disabled?: boolean;
  pollaId: string;
}

export function ActivatePollaButton({ disabled, pollaId }: ActivatePollaButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleConfirm = () => {
    setShowConfirm(false);
    startTransition(async () => {
      const result = await activatePolla(pollaId);
      if (result?.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        disabled={disabled || isPending}
        onClick={() => setShowConfirm(true)}
        className="gap-1.5 bg-primary-dark hover:bg-primary-dark/90"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {isPending ? 'Iniciando...' : 'Iniciar polla'}
      </Button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl border border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-base">¿Iniciar polla?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Una vez iniciada, la polla queda <strong>activa</strong> y no se podrá modificar la configuración de puntos.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5">
              <strong>Recordá:</strong> si hiciste cambios en la configuración, primero tenés que guardarlos con el botón &quot;Guardar cambios&quot; antes de iniciar la polla.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 gap-1.5 bg-primary-dark hover:bg-primary-dark/90"
                onClick={handleConfirm}
              >
                <Play className="h-4 w-4" />
                Confirmar e iniciar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface RecalculatePointsButtonProps {
  pollaId: string;
}

export function RecalculatePointsButton({ pollaId }: RecalculatePointsButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleClick = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await recalculatePoints(pollaId);
      if (!result) {
        setFeedback({ type: 'error', message: 'Error desconocido' });
        return;
      }
      if ('error' in result) {
        setFeedback({ type: 'error', message: result.error });
      } else if ('skipped' in result) {
        setFeedback({ type: 'success', message: result.reason || 'No había partidos pendientes.' });
      } else {
        setFeedback({
          type: 'success',
          message: `Puntos calculados: ${result.processed} predicciones en ${result.matches} partidos.`,
        });
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {feedback && (
        <div
          className={`text-xs px-2 py-1 rounded ${
            feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}
      <Button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        variant="outline"
        className="gap-1.5"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {isPending ? 'Calculando...' : 'Recalcular puntos'}
      </Button>
    </div>
  );
}
