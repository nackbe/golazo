'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface OnboardingFormProps {
  email: string;
}

export function OnboardingForm({ email }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const alias = (formData.get('alias') as string).trim();

    if (!alias || alias.length < 2) {
      setError('El alias debe tener al menos 2 caracteres.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Error al guardar el alias.');
        setIsLoading(false);
        return;
      }

      window.location.href = '/pollas';
    } catch (err: any) {
      setError(err.message || 'Error de conexión. Intentá de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="alias" className="text-sm font-semibold">
          Tu alias
        </label>
        <input
          id="alias"
          name="alias"
          type="text"
          placeholder="Ej: ElAdivino"
          required
          minLength={2}
          maxLength={30}
          autoFocus
          disabled={isLoading}
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Este será tu nombre visible en todas las pollas.
        </p>
      </div>

      <div className="rounded-xl bg-muted/60 px-4 py-3">
        <p className="text-xs text-muted-foreground">Email</p>
        <p className="text-sm font-medium mt-0.5">{email}</p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          '⚽ Entrar a Golazo'
        )}
      </button>
    </form>
  );
}
