'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = (form.get('email') as string).trim().toLowerCase();
    const supabase = createClient();
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('429') || msg.includes('rate')) {
        setError('Demasiados intentos. Esperá unos minutos.');
      } else {
        setError('No se pudo enviar el correo. Intentá de nuevo.');
      }
      setIsLoading(false);
      return;
    }
    setSent(email);
    setIsLoading(false);
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <p className="font-bold">Revisá tu correo</p>
        <p className="text-sm text-muted-foreground">
          Si <strong>{sent}</strong> está registrado, recibirás un link para resetear la contraseña.
        </p>
        <Link href="/login" className="inline-flex text-sm font-semibold text-primary hover:underline">
          Volver al login
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="email"
            type="email"
            placeholder="tu@correo.com"
            required
            autoComplete="email"
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
              Enviando...
            </>
          ) : (
            'Enviar link de recuperación'
          )}
        </button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="hover:underline">
          Volver al login
        </Link>
      </p>
    </div>
  );
}
