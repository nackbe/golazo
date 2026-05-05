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
  '#0d3d1f',
  '#d97706',
  '#2563eb',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4b5563',
];

type Filter = 'top5' | 'all' | string; // string = alias of a single player

export default function RankingEvolutionChart({ data, currentUserId }: Props) {
  const [filter, setFilter] = useState<Filter>('top5');
  const [expanded, setExpanded] = useState(true);

  const { chartData, players } = useMemo(() => {
    if (!data.entries.length) return { chartData: [], players: [] };

    const snapshots: {
      label: string;
      matchLabel?: string;
      [alias: string]: number | string | undefined;
    }[] = [];

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

    const playerStats = new Map<string, { best: number; avg: number; count: number; isMe: boolean }>();
    for (const entry of data.entries) {
      const stats = playerStats.get(entry.alias) ?? { best: Infinity, avg: 0, count: 0, isMe: entry.user_id === currentUserId };
      stats.best = Math.min(stats.best, entry.position);
      stats.avg += entry.position;
      stats.count += 1;
      playerStats.set(entry.alias, stats);
    }

    const players = Array.from(playerStats.entries())
      .map(([alias, stats]) => ({ alias, avg: stats.avg / stats.count, best: stats.best, isMe: stats.isMe }))
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

  // Color by stable index in full sorted players array
  const colorByAlias = new Map(players.map((p, i) => [p.alias, PALETTE[i % PALETTE.length]]));

  const visiblePlayers =
    filter === 'top5' ? players.slice(0, 5)
    : filter === 'all' ? players
    : players.filter((p) => p.alias === filter);

  const chipBase = 'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer border';
  const chipActive = 'bg-primary text-primary-foreground border-primary';
  const chipInactive = 'bg-transparent text-muted-foreground border-border hover:bg-muted/50';

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
        <div className="px-3 py-4 sm:px-5 space-y-4">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-1.5">
            <button className={`${chipBase} ${filter === 'top5' ? chipActive : chipInactive}`} onClick={() => setFilter('top5')}>
              Top 5
            </button>
            <button className={`${chipBase} ${filter === 'all' ? chipActive : chipInactive}`} onClick={() => setFilter('all')}>
              Todos
            </button>
            <span className="self-center text-border text-xs mx-0.5">|</span>
            {players.map((p) => {
              const isSelected = filter === p.alias;
              const color = colorByAlias.get(p.alias)!;
              return (
                <button
                  key={p.alias}
                  onClick={() => setFilter(isSelected ? 'top5' : p.alias)}
                  className={`${chipBase} ${isSelected ? 'border-transparent' : chipInactive}`}
                  style={isSelected ? { backgroundColor: color, color: '#fff', borderColor: color } : {}}
                >
                  {p.alias}{p.isMe ? ' ★' : ''}
                </button>
              );
            })}
          </div>

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
                          Snapshot {label}{matchLabel ? ` · ${matchLabel}` : ''}
                        </p>
                        <div className="space-y-0.5">
                          {[...payload]
                            .sort((a: any, b: any) => (a.value as number) - (b.value as number))
                            .map((item: any) => (
                              <div key={item.dataKey} className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="flex-1">{item.dataKey}</span>
                                <span className="font-bold">#{item.value}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  }}
                />
                {filter !== 'all' && filter !== 'top5' ? null : (
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) => {
                      const isMe = players.find((p) => p.alias === value)?.isMe;
                      return <span className={isMe ? 'font-bold text-primary' : ''}>{value}{isMe ? ' (Vos)' : ''}</span>;
                    }}
                  />
                )}
                {visiblePlayers.map((player) => (
                  <Line
                    key={player.alias}
                    type="monotone"
                    dataKey={player.alias}
                    stroke={colorByAlias.get(player.alias)}
                    strokeWidth={player.isMe ? 3 : 2}
                    dot={{ r: player.isMe ? 4 : 3 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
