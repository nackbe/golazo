import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/features/profile/profile-form';

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('alias, avatar_url')
    .eq('id', user.id)
    .single();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Tu perfil</h1>
        <p className="text-muted-foreground">
          Actualizá tu alias y foto para que tus amigos te reconozcan.
        </p>
      </div>

      <ProfileForm
        userId={user.id}
        initialAlias={profile?.alias ?? null}
        initialAvatarUrl={profile?.avatar_url ?? null}
        email={user.email ?? ''}
      />
    </div>
  );
}
