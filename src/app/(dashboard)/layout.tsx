import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/features/dashboard/dashboard-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('alias, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  // Si no tiene alias, obligar a completar onboarding
  if (!profile?.alias) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        alias={profile?.alias ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        email={user.email ?? ''}
      />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
