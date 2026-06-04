import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CheatsheetActions } from '@/components/features/dashboard/cheatsheet-actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function CheatsheetPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: polla } = await supabase
    .from('pollas')
    .select('id, name, status, admin_id')
    .eq('id', params.id)
    .single();

  if (!polla) notFound();

  // Verificar membresía o admin
  const { data: membership } = await supabase
    .from('polla_members')
    .select('status')
    .eq('polla_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  const isAdmin = polla.admin_id === user.id;
  const isMember = membership?.status === 'approved';
  if (!isAdmin && !isMember) redirect('/pollas');

  if (polla.status === 'draft') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Link
          href={`/pollas/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la polla
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-bold text-amber-900">Polla en borrador</p>
          <p className="mt-1 text-sm text-amber-800">
            Las reglas todavía pueden cambiar. Vas a poder compartir el cheatsheet una vez que se inicie la polla.
          </p>
        </div>
      </div>
    );
  }

  const imageUrl = `/api/polla/${params.id}/cheatsheet`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href={`/pollas/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la polla
      </Link>

      <div className="space-y-1">
        <h1 className="text-xl font-bold">Compartir reglas</h1>
        <p className="text-sm text-muted-foreground">
          Mandalas por WhatsApp para que tus amigos sepan cómo se gana.
        </p>
      </div>

      {/* Preview */}
      <div className="rounded-2xl overflow-hidden border border-border/50 shadow-sm bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Reglas de ${polla.name}`}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      <CheatsheetActions imageUrl={imageUrl} pollaName={polla.name} />
    </div>
  );
}
