import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
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
    .select('is_system_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_system_admin) {
    redirect('/pollas');
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,97%)]">
      {children}
    </div>
  );
}
