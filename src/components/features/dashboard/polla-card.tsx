'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Crown, Hash, Trash2, AlertTriangle } from 'lucide-react';
import { deletePolla } from '@/app/(dashboard)/pollas/actions';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  open: 'Abierta',
  active: 'Activa',
  finished: 'Finalizada',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  finished: 'bg-amber-100 text-amber-700',
};

interface Props {
  polla: {
    id: string;
    name: string;
    code: string;
    status: string;
    tournaments?: { name: string } | null;
    isAdmin: boolean;
  };
}

export function PollaCard({ polla }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  }

  function confirmDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await deletePolla(polla.id);
      if (result?.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="group relative flex flex-col rounded-2xl bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 border border-border/50">
      <Link href={`/pollas/${polla.id}`} className="flex-1">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="truncate font-bold text-lg leading-tight group-hover:text-primary transition-colors">
              {polla.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {polla.tournaments?.name ?? 'Torneo'}
            </p>
          </div>
          {polla.isAdmin && (
            <span title="Sos el admin">
              <Crown className="h-5 w-5 flex-shrink-0 text-amber-400" />
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-foreground">
            <Hash className="h-3 w-3 text-muted-foreground" />
            {polla.code}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[polla.status] ?? 'bg-muted text-muted-foreground'}`}>
            {STATUS_LABEL[polla.status] ?? polla.status}
          </span>
        </div>
      </Link>

      {/* Botón borrar — solo para admin */}
      {polla.isAdmin && (
        <div className="mt-3 pt-3 border-t border-border/50">
          {showConfirm ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5 text-xs text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                ¿Seguro?
              </div>
              <button
                onClick={confirmDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? '...' : 'Sí, borrar'}
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirm(false); }}
                className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar polla
            </button>
          )}
        </div>
      )}
    </div>
  );
}
