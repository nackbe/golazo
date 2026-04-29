'use client';

import { useState } from 'react';
import { Loader2, Mail, ChevronDown } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState<'google' | 'magic' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMagic, setShowMagic] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading('google');
    setError(null);
    const supabase = createClient();
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const callbackUrl = new URL('/api/auth/callback', base);
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

  const handleMagicLink = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading('magic');
    setError(null);
    const email = (new FormData(e.currentTarget).get('email') as string).trim();
    const supabase = createClient();
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const callbackUrl = new URL('/api/auth/callback', base);
    if (redirectTo) {
      callbackUrl.searchParams.set('redirectTo', redirectTo);
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
        setError('Demasiados intentos. Esperá unos minutos e intentá de nuevo.');
      } else {
        setError('No se pudo enviar el link. Intentá de nuevo.');
      }
    } else {
      setMagicSent(true);
    }
    setIsLoading(null);
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
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#0d3d1f] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isLoading === 'google' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continuar con Google
      </button>

      {/* Magic link — colapsado por defecto */}
      {!magicSent ? (
        <div>
          <button
            type="button"
            onClick={() => { setShowMagic(!showMagic); setError(null); }}
            className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" />
            ¿No tenés Google? Entrá con tu correo
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMagic ? 'rotate-180' : ''}`} />
          </button>

          {showMagic && (
            <form onSubmit={handleMagicLink} className="mt-3 space-y-2">
              <input
                name="email"
                type="email"
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                autoFocus
                disabled={!!isLoading}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!!isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {isLoading === 'magic' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar link de acceso'
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Te enviamos un link al correo. Sin contraseñas.
              </p>
            </form>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-5 text-center">
          <div className="mb-2 flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
          </div>
          <p className="font-semibold text-sm">¡Link enviado!</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Revisá tu bandeja y hacé clic en el link para entrar.
          </p>
          <button
            onClick={() => { setMagicSent(false); setShowMagic(true); }}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Usar otro correo
          </button>
        </div>
      )}

    </div>
  );
}
