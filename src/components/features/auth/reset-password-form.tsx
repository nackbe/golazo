'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function ResetPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState<'checking' | 'ok' | 'missing'>('checking');

  // Supabase entrega un access_token en hash al volver del email — exchange auto
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(data.session ? 'ok' : 'missing');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = form.get('password') as string;
    const confirm = form.get('confirm') as string;

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      setIsLoading(false);
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError('No se pudo actualizar la contraseña. Pedí un nuevo link.');
      setIsLoading(false);
      return;
    }
    setDone(true);
    setIsLoading(false);
  };

  if (sessionReady === 'checking') {
    return (
      <div className="text-center py-6">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (sessionReady === 'missing') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center space-y-2">
        <p className="font-semibold text-amber-900">Link inválido o expirado</p>
        <p className="text-sm text-amber-800">
          El link de recuperación ya no es válido. Pedí uno nuevo.
        </p>
        <Link href="/forgot-password" className="inline-flex text-sm font-semibold text-primary hover:underline">
          Pedir nuevo link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-6 w-6 text-emerald-700" />
        </div>
        <p className="font-bold text-emerald-900">Contraseña actualizada</p>
        <Link
          href="/pollas"
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          Ir a mis pollas
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="password"
            type="password"
            placeholder="Nueva contraseña (mínimo 8)"
            required
            minLength={8}
            autoComplete="new-password"
            disabled={isLoading}
            className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
        </div>
        <div className="relative">
          <CheckCircle2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="confirm"
            type="password"
            placeholder="Confirmá la contraseña"
            required
            minLength={8}
            autoComplete="new-password"
            disabled={isLoading}
            className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            'Actualizar contraseña'
          )}
        </button>
      </form>
    </div>
  );
}
