'use client';

import Link from 'next/link';
import { Crown, Hash, User, Calendar } from 'lucide-react';

function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
    created_at?: string;
    tournaments?: { name: string } | null;
    isAdmin: boolean;
    adminAlias?: string;
    matchStats?: { total: number; finished: number };
  };
}

export function PollaCard({ polla }: Props) {
  const { total = 0, finished = 0 } = polla.matchStats ?? {};
  const progress = total > 0 ? Math.round((finished / total) * 100) : 0;
  const hasStarted = total > 0;

  return (
    <Link
      href={`/pollas/${polla.id}`}
      className="group flex flex-col rounded-2xl bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 border border-border/50"
    >
      <div className="flex-1">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="truncate font-bold text-lg leading-tight group-hover:text-primary transition-colors">
              {polla.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {polla.tournaments?.name ?? 'Torneo'}
            </p>
          </div>
          {polla.isAdmin ? (
            <span title="Sos el admin" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 flex-shrink-0">
              <Crown className="h-3 w-3" /> Admin
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 flex-shrink-0">
              <User className="h-3 w-3" /> Jugador
            </span>
          )}
        </div>

        {/* Admin name */}
        {!polla.isAdmin && polla.adminAlias && (
          <p className="mb-2 text-xs text-muted-foreground">
            Por <span className="font-medium text-foreground">{polla.adminAlias}</span>
          </p>
        )}

        {/* Progress bar */}
        {hasStarted && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {finished} de {total} partidos
              </span>
              <span className="text-[11px] font-semibold text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-foreground">
              <Hash className="h-3 w-3 text-muted-foreground" />
              {polla.code}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[polla.status] ?? 'bg-muted text-muted-foreground'}`}>
              {STATUS_LABEL[polla.status] ?? polla.status}
            </span>
          </div>
          {polla.created_at && (
            <p className="text-[11px] text-muted-foreground">
              Creada el {formatRelativeDate(polla.created_at)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
