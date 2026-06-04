'use client';

import { useState } from 'react';
import { Download, Share2, Loader2, Check } from 'lucide-react';

interface Props {
  imageUrl: string;
  pollaName: string;
}

export function CheatsheetActions({ imageUrl, pollaName }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const safeName = pollaName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `golazo-reglas-${safeName}.png`;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(imageUrl, { cache: "no-store" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (e) {
      alert('No se pudo descargar la imagen. Intentá de nuevo.');
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await fetch(imageUrl, { cache: "no-store" });
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Reglas de ${pollaName}`,
          text: `Sumate a la polla "${pollaName}" en Golazo ⚽`,
        });
      } else if (navigator.share) {
        // Fallback: share text-only (sin imagen)
        await navigator.share({
          title: `Reglas de ${pollaName}`,
          text: `Sumate a la polla "${pollaName}" en Golazo ⚽`,
          url: window.location.href,
        });
      } else {
        alert('Tu navegador no soporta compartir directo. Descargá la imagen y compartila desde WhatsApp.');
      }
    } catch (e: any) {
      // AbortError cuando user cancela share dialog — ignorar
      if (e.name !== 'AbortError') {
        alert('No se pudo compartir. Probá descargando la imagen.');
      }
    }
    setSharing(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleShare}
        disabled={sharing}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sharing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        Compartir
      </button>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : downloaded ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloaded ? 'Descargada' : 'Descargar imagen'}
      </button>
    </div>
  );
}
