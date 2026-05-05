'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { RankingEvolutionData } from '@/lib/sync/ranking-history';

interface Props {
  data: RankingEvolutionData;
  currentUserId: string;
}

const PALETTE = [
  '#0d3d1f', // verde oscuro (primario)
  '#d97706', // ámbar
  '#2563eb', // azul
  '#dc2626', // rojo
  '#7c3aed', // violeta
  '#0891b2', // cyan
  '#db2777', // rosa
  '#4b5563', // gris
];

export default function RankingEvolutionChart({ data, currentUserId }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const { chartData, players } = useMemo(() => {
    if (!data.entries.length) return { chartData: [], players: [] };

    // Agrupar snapshots por created_at (mismo batch = mismo timestamp aprox)
    // Usamos un índice secuencial como eje X para evitar problemas de densidad
    const snapshots: {
      label: string;
      matchLabel?: string;
      [alias: string]: number | string | undefined;
    }[] = [];

    // Agrupar entradas por created_at (a segundo exacto)
    const groups = new Map<string, typeof data.entries>();
    for (const entry of data.entries) {
      const key = entry.created_at;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    let index = 1;
    for (const [, entries] of Array.from(groups)) {
      const row: (typeof snapshots)[number] = { label: `${index}` };
      const matchId = entries[0]?.match_id;
      if (matchId && data.matchLabels[matchId]) {
        row.matchLabel = data.matchLabels[matchId];
      }
      for (const e of entries) {
        row[e.alias] = e.position;
      }
      snapshots.push(row);
      index++;
    }

    // Detectar jugadores únicos y ordenar por mejor posición promedio
    const playerStats = new Map<
      string,
      { best: number; avg: number; isMe: boolean }
    >();
    for (const entry of data.entries) {
      const stats = playerStats.get(entry.alias) ?? {
        best: Infinity,
        avg: 0,
        count: 0,
        isMe: entry.user_id === currentUserId,
      };
      stats.best = Math.min(stats.best, entry.position);
      stats.avg += entry.position;
      (stats as any).count += 1;
      playerStats.set(entry.alias, stats as any);
    }

    const players = Array.from(playerStats.entries())
      .map(([alias, stats]: [string, any]) => ({
        alias,
        avg: stats.avg / stats.count,
        best: stats.best,
        isMe: stats.isMe,
      }))
      .sort((a, b) => a.avg - b.avg);

    return { chartData: snapshots, players };
  }, [data, currentUserId]);

  if (!chartData.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">
          La evolución del ranking aparecerá una vez que se calculen los puntos de los primeros partidos.
        </p>
      </div>
    );
  }

  const visiblePlayers = showAll ? players : players.slice(0, 5);
  const visibleSet = new Set(visiblePlayers.map((p) => p.alias));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 border-b border-border hover:bg-muted/30 transition-colors"
      >
        <div>
          <h2 className="font-bold text-base">Evolución del ranking</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {players.length} {players.length === 1 ? 'jugador' : 'jugadores'} · {chartData.length}{' '}
            {chartData.length === 1 ? 'snapshot' : 'snapshots'}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 py-4 sm:px-5">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Partidos calculados', position: 'insideBottom', offset: -2, fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  reversed
                  domain={['dataMin', 'dataMax']}
                  allowDecimals={false}
                  label={{ value: 'Posición', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload) return null;
                    const matchLabel = (payload[0]?.payload as any)?.matchLabel;
                    return (
                      <div className="rounded-lg border border-border bg-white p-3 shadow-md text-sm">
                        <p className="font-semibold text-xs text-muted-foreground mb-1">
                          Snapshot {label}
                          {matchLabel ? ` · ${matchLabel}` : ''}
                        </p>
                        <div className="space-y-0.5">
                          {[...payload]
                            .sort((a: any, b: any) => (a.value as number) - (b.value as number))
                            .map((item: any) => (
                              <div key={item.dataKey} className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="flex-1">{item.dataKey}</span>
                                <span className="font-bold">#{item.value}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => {
                    const isMe = players.find((p) => p.alias === value)?.isMe;
                    return (
                      <span className={isMe ? 'font-bold text-primary' : ''}>
                        {value} {isMe ? '(Vos)' : ''}
                      </span>
                    );
                  }}
                />
                {visiblePlayers.map((player, i) => (
                  <Line
                    key={player.alias}
                    type="monotone"
                    dataKey={player.alias}
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={player.isMe ? 3 : 2}
                    dot={{ r: player.isMe ? 4 : 3 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {players.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 w-full rounded-lg border border-border bg-muted/30 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              {showAll ? 'Ver solo top 5' : `Ver todos los jugadores (${players.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
