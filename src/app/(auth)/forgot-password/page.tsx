import { ForgotPasswordForm } from '@/components/features/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-5xl">⚽</span>
          <h1 className="mt-2 text-3xl font-black text-primary-dark">Golazo</h1>
        </div>
        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-6">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold">Recuperar contraseña</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Te enviamos un link a tu correo para resetearla
            </p>
          </div>
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
