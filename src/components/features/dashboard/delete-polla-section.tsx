'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deletePolla } from '@/app/(dashboard)/pollas/actions';

interface Props {
  pollaId: string;
  pollaName: string;
}

export function DeletePollaSection({ pollaId, pollaName }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const THRESHOLD = 85; // % needed to confirm
  const isConfirmed = sliderValue >= THRESHOLD;

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePolla(pollaId);
      if (result?.error) {
        alert(result.error);
      } else {
        setShowModal(false);
        // Hard navigation to force re-fetch of server components
        window.location.href = '/pollas';
      }
    });
  }

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    updateSlider(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    updateSlider(e.clientX);
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    if (sliderValue < THRESHOLD) {
      setSliderValue(0);
    }
  }, [sliderValue]);

  function updateSlider(clientX: number) {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderValue(pct);
  }

  return (
    <>
      {/* Trigger button */}
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-red-800">Zona de peligro</h2>
              <p className="text-sm text-red-700/80">
                Borrar una polla elimina todas las predicciones, puntos y rankings. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
            onClick={() => {
              setSliderValue(0);
              setShowModal(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Borrar
          </Button>
        </div>
      </div>

      {/* Confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="font-bold text-lg">¿Borrar polla?</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground"
                disabled={isPending}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-2">
              Estás a punto de borrar <strong className="text-foreground">{pollaName}</strong>.
            </p>
            <ul className="text-sm text-muted-foreground mb-6 space-y-1 list-disc list-inside">
              <li>Se eliminarán todas las predicciones</li>
              <li>Se eliminarán los puntos y rankings</li>
              <li>Los jugadores perderán el acceso</li>
              <li><strong className="text-red-600">No se puede deshacer</strong></li>
            </ul>

            {/* Swipe to confirm slider */}
            <div className="mb-6">
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
                {isConfirmed ? '✓ Confirmado' : 'Deslizá para confirmar'}
              </p>
              <div
                ref={sliderRef}
                className="relative h-12 rounded-full bg-muted overflow-hidden select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Background text */}
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted-foreground">
                  {isConfirmed ? 'Listo para borrar' : '→ Deslizá para borrar →'}
                </div>

                {/* Fill track */}
                <div
                  className="absolute inset-y-0 left-0 bg-red-600 transition-colors"
                  style={{
                    width: `${sliderValue}%`,
                    backgroundColor: isConfirmed ? '#dc2626' : '#ef4444',
                  }}
                />

                {/* Draggable thumb */}
                <div
                  className="absolute top-0 bottom-0 flex items-center justify-center"
                  style={{
                    left: `calc(${sliderValue}% - 24px)`,
                    width: '48px',
                  }}
                >
                  <div
                    className={`h-10 w-10 rounded-full shadow-md flex items-center justify-center transition-colors ${
                      isConfirmed ? 'bg-white text-red-600' : 'bg-white text-muted-foreground'
                    }`}
                  >
                    <Trash2 className="h-5 w-5" />
                  </div>
                </div>

                {/* Confirmed overlay text */}
                {isConfirmed && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                    Listo para borrar
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowModal(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40"
                disabled={!isConfirmed || isPending}
                onClick={handleDelete}
              >
                {isPending ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Borrar definitivamente
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
