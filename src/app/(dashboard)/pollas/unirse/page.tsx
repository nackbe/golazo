'use client';

import { useState, useTransition, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle, Hash } from 'lucide-react';
import { joinPolla } from './actions';

export default function UnirsePage() {
  const searchParams = useSearchParams();
  const prefillCode = searchParams.get('code')?.toUpperCase() || '';

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [code, setCode] = useState(prefillCode);

  // Auto-submit si viene código por URL
  useEffect(() => {
    if (prefillCode.length === 6) {
      const fd = new FormData();
      fd.set('code', prefillCode);
      handleSubmit(fd);
    }
  }, [prefillCode]);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await joinPolla(formData);
      if (result?.error) setError(result.error);
      else if (result?.success) setSuccess(result.message || '¡Te uniste a la polla!');
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
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Hash className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black">Unirme a una polla</h1>
            <p className="text-sm text-muted-foreground">Ingresá el código que te compartieron.</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          </div>
        )}

        <form action={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="code" className="text-sm font-semibold">
              Código de invitación
            </label>
            <input
              id="code"
              name="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A3B9K2"
              required
              minLength={6}
              maxLength={6}
              autoFocus
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-center text-2xl font-mono font-black uppercase tracking-[0.3em] outline-none placeholder:text-muted-foreground placeholder:text-lg placeholder:tracking-normal focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <p className="text-xs text-muted-foreground text-center">6 caracteres, sin espacios</p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uniéndome...
              </>
            ) : (
              'Unirme a la polla'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
