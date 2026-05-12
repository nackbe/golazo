'use client';

import { useState } from 'react';
import { PollaCard } from './polla-card';

type RoleFilter = 'all' | 'admin' | 'jugador';
type StatusFilter = 'all' | 'active' | 'open' | 'finished' | 'draft';

interface Polla {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
  tournaments?: { name: string } | null;
  isAdmin: boolean;
}

interface Props {
  pollas: Polla[];
}

export function PollaListFilters({ pollas }: Props) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = pollas.filter((p) => {
    if (roleFilter === 'admin' && !p.isAdmin) return false;
    if (roleFilter === 'jugador' && p.isAdmin) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const availableStatuses = Array.from(new Set(pollas.map((p) => p.status)));

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Borrador', open: 'Abierta', active: 'Activa', finished: 'Finalizada',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Role filter */}
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'admin', 'jugador'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                roleFilter === r ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {r === 'all' ? 'Todas' : r === 'admin' ? 'Soy admin' : 'Soy jugador'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        {availableStatuses.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              Todos estados
            </button>
            {availableStatuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s as StatusFilter)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === s ? 'bg-slate-700 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {STATUS_LABEL[s] ?? s}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} de {pollas.length}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((polla) => (
          <PollaCard key={polla.id} polla={polla} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          No hay pollas que coincidan con los filtros.
        </div>
      )}
    </div>
  );
}
