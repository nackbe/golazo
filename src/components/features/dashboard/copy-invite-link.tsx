'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';

interface Props {
  code: string;
}

export function CopyInviteLink({ code }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/pollas/unirse?code=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback para navegadores que no soportan clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copiado
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" />
          Copiar link
        </>
      )}
    </button>
  );
}
