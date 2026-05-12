'use client';

import { Users, Trophy, Target, Calendar, Activity, Zap } from 'lucide-react';

interface Stats {
  totalUsers: number;
  usersToday: number;
  pollas: {
    draft: number;
    open: number;
    active: number;
    finished: number;
    total: number;
  };
  totalPredictions: number;
  predictionsToday: number;
  matches: {
    ns: number;
    live: number;
    ft: number;
    other: number;
    total: number;
  };
  apiToday: number;
  apiLimit: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subvalue,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subvalue?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-black tracking-tight">{value}</p>
          {subvalue && (
            <p className="text-xs text-muted-foreground">{subvalue}</p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export function DashboardStats({ stats }: { stats: Stats }) {
  const apiPercent = Math.min(100, Math.round((stats.apiToday / stats.apiLimit) * 100));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={Users}
        label="Usuarios registrados"
        value={stats.totalUsers.toLocaleString('es-ES')}
        subvalue={`+${stats.usersToday} hoy`}
        color="bg-blue-500"
      />
      <StatCard
        icon={Trophy}
        label="Pollas creadas"
        value={stats.pollas.total.toLocaleString('es-ES')}
        subvalue={`${stats.pollas.active} activas · ${stats.pollas.draft} borradores`}
        color="bg-amber-500"
      />
      <StatCard
        icon={Target}
        label="Predicciones totales"
        value={stats.totalPredictions.toLocaleString('es-ES')}
        subvalue={`+${stats.predictionsToday} hoy`}
        color="bg-emerald-500"
      />
      <StatCard
        icon={Calendar}
        label="Partidos"
        value={stats.matches.total.toLocaleString('es-ES')}
        subvalue={`${stats.matches.ns} por jugar · ${stats.matches.live} en vivo · ${stats.matches.ft} terminados`}
        color="bg-purple-500"
      />
      <StatCard
        icon={Zap}
        label="API requests hoy"
        value={stats.apiToday.toLocaleString('es-ES')}
        subvalue={`${apiPercent}% del límite diario (${stats.apiLimit.toLocaleString('es-ES')})`}
        color="bg-rose-500"
      />
      <StatCard
        icon={Activity}
        label="Actividad"
        value={`${stats.predictionsToday + stats.usersToday}`}
        subvalue="eventos hoy"
        color="bg-cyan-500"
      />
    </div>
  );
}
