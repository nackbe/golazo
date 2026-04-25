'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface OnboardingFormProps {
  userId: string;
  email: string;
}

export function OnboardingForm({ userId, email }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const alias = (formData.get('alias') as string).trim();

    if (!alias || alias.length < 2) {
      setError('El alias debe tener al menos 2 caracteres.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    // Insert profile
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        alias,
        avatar_url: null,
      });

    if (insertError) {
      if (insertError.message.includes('duplicate')) {
        setError('Este alias ya está en uso. Prueba otro.');
      } else {
        setError(insertError.message);
      }
      setIsLoading(false);
      return;
    }

    router.push('/pollas');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="alias" className="text-sm font-medium">
          Tu alias
        </label>
        <input
          id="alias"
          name="alias"
          type="text"
          placeholder="Ej: ElAdivino"
          required
          minLength={2}
          maxLength={30}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Este será tu nombre visible en todas las pollas. Mínimo 2 caracteres.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Email
        </label>
        <p className="mt-1 text-sm">{email}</p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
        {isLoading ? 'Guardando...' : 'Entrar a Golazo'}
      </Button>
    </form>
  );
}
