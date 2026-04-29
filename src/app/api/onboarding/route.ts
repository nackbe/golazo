import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { alias } = await request.json();

    if (!alias || typeof alias !== 'string' || alias.trim().length < 2) {
      return NextResponse.json(
        { error: 'El alias debe tener al menos 2 caracteres.' },
        { status: 400 }
      );
    }

    // Verify session first
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No estás autenticado.' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS entirely — this is the most reliable path
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .upsert({ id: user.id, alias: alias.trim() }, { onConflict: 'id' });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}
