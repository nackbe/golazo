'use client';

import { Clock, Zap, Search, RefreshCw, Calculator, Database } from 'lucide-react';

interface ActivityItem {
  action: string;
  identifier: string;
  metadata: any;
  created_at: string;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  load_fixtures: Database,
  sync_fixtures: RefreshCw,
  search_leagues: Search,
  get_rounds: Search,
  recalculate_points: Calculator,
  default: Zap,
};

const ACTION_LABELS: Record<string, string> = {
  load_fixtures: 'Cargar fixtures',
  sync_fixtures: 'Sincronizar',
  search_leagues: 'Buscar ligas',
  get_rounds: 'Consultar rounds',
  recalculate_points: 'Recalcular puntos',
};

function formatTimeAgo(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours} h`;
  return `hace ${diffDays} d`;
}

export function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  if (!activity.length) {
    return (
      <div className="rounded-2xl border bg-white p-8 shadow-sm text-center text-muted-foreground">
        No hay actividad reciente.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">
          Actividad reciente
        </h3>
      </div>
      <div className="divide-y">
        {activity.map((item, i) => {
          const Icon = ACTION_ICONS[item.action] || ACTION_ICONS.default;
          const label = ACTION_LABELS[item.action] || item.action;
          const isIp = item.identifier.startsWith('ip_');
          const who = isIp
            ? item.identifier.replace('ip_', 'IP ')
            : item.identifier.slice(0, 8) + '...';

          return (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {who}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatTimeAgo(item.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
