'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Trophy, Globe, Calendar, Loader2, Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface League {
  id: number;
  name: string;
  type: string;
  logo: string;
  country: {
    name: string;
    code: string;
    flag: string;
  };
  seasons: Array<{
    year: number;
    start: string;
    end: string;
    current: boolean;
    coverage: any;
  }>;
}

interface Props {
  pollaId: string;
  onSelect: (formData: FormData) => void;
  currentTournament?: {
    id: string;
    name: string;
    country?: string | null;
    logo_url?: string | null;
  } | null;
}

const POPULAR_TOURNAMENTS = [
  { label: 'Mundial', query: 'world cup' },
  { label: 'Copa América', query: 'copa america' },
  { label: 'Champions', query: 'champions league' },
  { label: 'Premier', query: 'premier league' },
  { label: 'La Liga', query: 'la liga' },
  { label: 'Bundesliga', query: 'bundesliga' },
  { label: 'Serie A', query: 'serie a' },
  { label: 'Libertadores', query: 'copa libertadores' },
  { label: 'Sudamericana', query: 'copa sudamericana' },
  { label: 'Europa League', query: 'europa league' },
];

export function TournamentSearch({ pollaId, onSelect, currentTournament }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/leagues/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.leagues) {
        setResults(data.leagues);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length >= 3) {
      debounceRef.current = setTimeout(() => search(query), 300);
    } else {
      setResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(league: League) {
    setSelectedLeague(league);
    // Default to current season or latest available
    const current = league.seasons.find((s) => s.current);
    const latest = league.seasons[league.seasons.length - 1];
    setSelectedSeason(current?.year ?? latest?.year ?? null);
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  function handleConfirm() {
    if (!selectedLeague || !selectedSeason) return;

    const formData = new FormData();
    formData.append('polla_id', pollaId);
    formData.append('api_football_id', String(selectedLeague.id));
    formData.append('name', selectedLeague.name);
    formData.append('country', selectedLeague.country.name);
    formData.append('type', selectedLeague.type);
    formData.append('logo_url', selectedLeague.logo);
    formData.append('season', String(selectedSeason));

    onSelect(formData);
  }

  function handleClear() {
    setSelectedLeague(null);
    setSelectedSeason(null);
    setQuery('');
    setResults([]);
  }

  // If a tournament is already selected, show it
  if (selectedLeague) {
    const season = selectedLeague.seasons.find((s) => s.year === selectedSeason);
    return (
      <div className="space-y-3 rounded-xl border border-border/50 bg-card p-4">
        <div className="flex items-center gap-3">
          {selectedLeague.logo && (
            <img
              src={selectedLeague.logo}
              alt={selectedLeague.name}
              className="h-10 w-10 rounded-lg object-contain"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{selectedLeague.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {selectedLeague.country.name} · {selectedLeague.type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedSeason ?? ''}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selectedLeague.seasons.map((s) => (
              <option key={s.year} value={s.year}>
                {s.year} {s.current ? '(actual)' : ''} — {s.start} a {s.end}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleConfirm} className="flex-1 gap-1.5 bg-[#0d3d1f] hover:bg-[#0d3d1f]/90">
            <Check className="h-4 w-4" />
            Confirmar selección
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar torneo... (ej: Chile, Copa, Mundial)"
          className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Torneos populares — rápido acceso */}
      {!selectedLeague && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {POPULAR_TOURNAMENTS.map((t) => (
            <button
              key={t.query}
              type="button"
              onClick={() => {
                setQuery(t.label);
                search(t.query);
                setOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Star className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {open && (results.length > 0 || (query.length >= 3 && !loading)) && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.length === 0 && query.length >= 3 && !loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No se encontraron torneos</div>
          ) : (
            <ul className="py-1">
              {results.map((league) => (
                <li key={league.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(league)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    {league.logo ? (
                      <img
                        src={league.logo}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-primary/10">
                        <Trophy className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{league.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {league.country.name} · {league.type} ·{' '}
                        {league.seasons.length > 0
                          ? `${league.seasons.length} temporadas`
                          : 'Sin temporadas disponibles'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {currentTournament && !selectedLeague && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border/50 bg-muted/50 px-3 py-2">
          {currentTournament.logo_url && (
            <img src={currentTournament.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
          )}
          <p className="text-sm">
            Torneo actual: <span className="font-medium">{currentTournament.name}</span>
            {currentTournament.country && (
              <span className="text-muted-foreground"> · {currentTournament.country}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
