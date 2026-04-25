import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/features/auth/login-form';

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect('/pollas');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
