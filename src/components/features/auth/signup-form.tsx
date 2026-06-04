'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  redirectTo?: string;
}

export function SignupForm({ redirectTo }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = (form.get('email') as string).trim().toLowerCase();
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
    const callbackUrl = new URL('/api/auth/callback', window.location.origin);
    if (redirectTo) callbackUrl.searchParams.set('redirectTo', redirectTo);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('registered')) {
        setError('Ya existe una cuenta con ese correo. Iniciá sesión.');
      } else if (msg.includes('password')) {
        setError('La contraseña no es válida. Mínimo 8 caracteres.');
      } else if (msg.includes('429') || msg.includes('rate')) {
        setError('Demasiados intentos. Esperá unos minutos.');
      } else {
        setError('No se pudo crear la cuenta. Intentá de nuevo.');
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
        <div>
          <p className="font-bold">Revisá tu correo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Te enviamos un link de confirmación a <strong>{sent}</strong>.
            Hacé click en el link para activar tu cuenta.
          </p>
        </div>
        <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
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

      <form onSubmit={handleSignup} className="space-y-2">
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
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (mínimo 8 caracteres)"
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
              Creando cuenta...
            </>
          ) : (
            'Crear cuenta'
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
