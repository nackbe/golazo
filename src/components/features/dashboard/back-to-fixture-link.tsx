'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  pollaId: string;
}

export function BackToFixtureLink({ pollaId }: Props) {
  const [href, setHref] = useState<string>(`/pollas/${pollaId}/fixture`);

  useEffect(() => {
    const saved = sessionStorage.getItem('fixtureReturnUrl');
    if (saved) {
      setHref(saved);
    }
  }, []);

  return (
    <Link href={href}>
      <Button variant="ghost" size="sm" className="gap-1">
        <ArrowLeft className="h-4 w-4" />
        Volver al fixture
      </Button>
    </Link>
  );
}
