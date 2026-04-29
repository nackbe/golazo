'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Trophy } from 'lucide-react';
import { createPolla } from './actions';

export default function NuevaPollaPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createPolla(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <Link
        href="/pollas"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a mis pollas
      </Link>

      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black">Crear nueva polla</h1>
            <p className="text-sm text-muted-foreground">Dale un nombre para empezar. Configurás todo lo demás en el paso siguiente.</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-semibold">
              Nombre de la polla
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Ej: Los Cracks del Mundial"
              required
              minLength={2}
              maxLength={60}
              autoFocus
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground space-y-1">
            <p>Se genera automáticamente un <strong className="text-foreground">código de 6 caracteres</strong> para invitar a tus amigos.</p>
            <p>En el paso siguiente configurás el sistema de puntos, comodines y más.</p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando polla...
              </>
            ) : (
              '⚽ Crear polla'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
