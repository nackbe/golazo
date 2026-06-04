'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<'google' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading('google');
    setError(null);
    const supabase = createClient();
    const callbackUrl = new URL('/api/auth/callback', window.location.origin);
    if (redirectTo) {
      callbackUrl.searchParams.set('redirectTo', redirectTo);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setError('No se pudo conectar con Google. Intentá de nuevo.');
      setIsLoading(null);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading('password');
    setError(null);
    setNeedsConfirm(false);
    const form = new FormData(e.currentTarget);
    const email = (form.get('email') as string).trim().toLowerCase();
    const password = form.get('password') as string;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        setNeedsConfirm(true);
        setError('Necesitás confirmar tu correo. Revisá tu bandeja de entrada.');
      } else if (msg.includes('invalid') || msg.includes('credenciales')) {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('No se pudo iniciar sesión. Intentá de nuevo.');
      }
      setIsLoading(null);
      return;
    }
    // Sesión creada. Redirigir respetando redirectTo.
    const safe = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/pollas';
    window.location.href = safe;
  };

  const handleResendConfirm = async (email: string) => {
    if (!email) return;
    const supabase = createClient();
    const callbackUrl = new URL('/api/auth/callback', window.location.origin);
    if (redirectTo) callbackUrl.searchParams.set('redirectTo', redirectTo);
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    setError('Te reenviamos el correo de confirmación.');
  };

  return (
    <div className="w-full space-y-4">

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Google — botón principal */}
      <button
        onClick={handleGoogleLogin}
        disabled={!!isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary-dark px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isLoading === 'google' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continuar con Google
      </button>

      {/* Divider */}
      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">o con tu correo</span>
        </div>
      </div>

      {/* Email + password */}
      <form onSubmit={handlePasswordLogin} className="space-y-2">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="email"
            type="email"
            placeholder="tu@correo.com"
            required
            autoComplete="email"
            disabled={!!isLoading}
            className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            minLength={8}
            autoComplete="current-password"
            disabled={!!isLoading}
            className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!!isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isLoading === 'password' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>

      {needsConfirm && (
        <button
          type="button"
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>('input[name="email"]');
            if (input?.value) handleResendConfirm(input.value.trim().toLowerCase());
          }}
          className="text-xs text-primary hover:underline w-full text-center"
        >
          Reenviar correo de confirmación
        </button>
      )}

      <div className="flex items-center justify-between text-xs">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Crear cuenta
        </Link>
      </div>

    </div>
  );
}
