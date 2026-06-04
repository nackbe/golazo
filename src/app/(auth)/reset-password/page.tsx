import { ResetPasswordForm } from '@/components/features/auth/reset-password-form';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-5xl">⚽</span>
          <h1 className="mt-2 text-3xl font-black text-primary-dark">Golazo</h1>
        </div>
        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-6">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold">Nueva contraseña</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Definí una contraseña nueva para tu cuenta
            </p>
          </div>
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
