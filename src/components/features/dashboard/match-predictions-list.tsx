'use client';

import { Zap, Trophy, X } from 'lucide-react';

interface Prediction {
  user_id: string;
  alias: string;
  avatar_url: string | null;
  home_goals: number;
  away_goals: number;
  wildcard_used: 'x2' | 'x3' | null;
  points: number | null;
  is_me: boolean;
}

interface Props {
  predictions: Prediction[];
  homeTeamName: string;
  awayTeamName: string;
  matchStatus: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

export function MatchPredictionsList({
  predictions,
  homeTeamName,
  awayTeamName,
  matchStatus,
  homeGoals,
  awayGoals,
}: Props) {
  const isFinished = matchStatus === 'FT' || matchStatus === 'AFT';
  const sorted = [...predictions].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return (
    <div className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-base">Predicciones del grupo</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isFinished
            ? `Resultado final: ${homeTeamName} ${homeGoals ?? '-'} - ${awayGoals ?? '-'} ${awayTeamName}`
            : 'El partido está en curso. Resultado parcial.'}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {sorted.map((p) => {
          const initials = p.alias.slice(0, 2).toUpperCase();
          const isExact = isFinished && p.home_goals === homeGoals && p.away_goals === awayGoals;
          return (
            <li
              key={p.user_id}
              className={`flex items-center gap-3 px-5 py-3 ${p.is_me ? 'bg-primary/5' : ''}`}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.alias} className="h-9 w-9 rounded-full flex-shrink-0" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                  {initials}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm truncate ${p.is_me ? 'text-primary' : ''}`}>
                    {p.alias}
                  </span>
                  {p.is_me && (
                    <span className="text-[11px] text-primary/70 font-medium">Vos</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-mono font-bold">
                    {p.home_goals} - {p.away_goals}
                  </span>
                  {p.wildcard_used && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        p.wildcard_used === 'x3'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      <Zap className="h-3 w-3" />
                      {p.wildcard_used.toUpperCase()}
                    </span>
                  )}
                  {isExact && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                      <Trophy className="h-3 w-3" />
                      Exacto
                    </span>
                  )}
                </div>
              </div>

              {isFinished && (
                <div className="text-right flex-shrink-0">
                  <span className={`text-lg font-black ${(p.points ?? 0) > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {p.points ?? 0}
                  </span>
                  <span className="ml-0.5 text-xs text-muted-foreground">pts</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
