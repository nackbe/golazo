'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit3,
  Eye,
  Search,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';


interface Team {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Prediction {
  match_id: string;
  home_goals: number;
  away_goals: number;
  wildcard_used: 'x2' | 'x3' | null;
}

interface Match {
  id: string;
  scheduled_at: string;
  round: string | null;
  venue: string | null;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_penalty_goals: number | null;
  away_penalty_goals: number | null;
  home_team: Team | null;
  away_team: Team | null;
}

interface Props {
  pollaId: string;
  matches: Match[];
  predictions: Prediction[];
  betDeadlineMinutes: number;
  isAdmin: boolean;
}

type StatusFilter = 'all' | 'open' | 'closed' | 'missing' | 'predicted';
type SortBy = 'date-asc' | 'date-desc' | 'team' | 'round';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function isBetOpen(match: Match, deadlineMinutes: number) {
  const deadline = new Date(match.scheduled_at);
  deadline.setMinutes(deadline.getMinutes() - (deadlineMinutes || 60));
  return new Date() < deadline;
}

function getYear(iso: string) {
  return new Date(iso).getFullYear();
}

function getMonth(iso: string) {
  return new Date(iso).getMonth();
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  open: 'Por predecir',
  closed: 'Cerrado',
  missing: 'Sin predicción',
  predicted: 'Predicho',
};

export function FixtureList({ pollaId, matches, predictions, betDeadlineMinutes, isAdmin }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Leer filtros desde URL query params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [yearFilter, setYearFilter] = useState<string>(searchParams.get('year') || 'all');
  const [monthFilter, setMonthFilter] = useState<string>(searchParams.get('month') || 'all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || 'all');
  const [sortBy, setSortBy] = useState<SortBy>((searchParams.get('sort') as SortBy) || 'date-asc');
  const [showFilters, setShowFilters] = useState(searchParams.get('showFilters') === '1');

  // Sincronizar filtros con URL query params
  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  // Restaurar scroll position al volver de predicción
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('fixtureScrollY');
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll, 10));
      sessionStorage.removeItem('fixtureScrollY');
    }
  }, []);

  const predByMatch = useMemo(() => {
    return new Map(predictions.map((p) => [p.match_id, p]));
  }, [predictions]);

  // Años y meses disponibles
  const availableYears = useMemo(() => {
    const years = new Set(matches.map((m) => getYear(m.scheduled_at)));
    return Array.from(years).sort();
  }, [matches]);

  const availableMonths = useMemo(() => {
    const months = new Set(matches.map((m) => getMonth(m.scheduled_at)));
    return Array.from(months).sort((a, b) => a - b);
  }, [matches]);

  // Contadores de resumen
  const counts = useMemo(() => {
    let total = 0;
    let closed = 0;
    let missing = 0;
    let predicted = 0;
    for (const match of matches) {
      total++;
      const open = isBetOpen(match, betDeadlineMinutes);
      const hasPrediction = predByMatch.has(match.id);
      if (!open) closed++;
      if (open && !hasPrediction) missing++;
      if (hasPrediction) predicted++;
    }
    return { total, closed, missing, predicted };
  }, [matches, predByMatch, betDeadlineMinutes]);

  // Filtrar
  const filtered = useMemo(() => {
    return matches.filter((match) => {
      const pred = predByMatch.get(match.id);
      const open = isBetOpen(match, betDeadlineMinutes);
      const hasPrediction = !!pred;

      // Búsqueda por nombre de equipo
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const homeName = match.home_team?.name?.toLowerCase() || '';
        const awayName = match.away_team?.name?.toLowerCase() || '';
        if (!homeName.includes(q) && !awayName.includes(q)) return false;
      }

      // Filtro por año
      if (yearFilter !== 'all' && getYear(match.scheduled_at) !== Number(yearFilter)) return false;

      // Filtro por mes
      if (monthFilter !== 'all' && getMonth(match.scheduled_at) !== Number(monthFilter)) return false;

      // Filtro por estado
      if (statusFilter === 'open') return open;
      if (statusFilter === 'closed') return !open;
      if (statusFilter === 'missing') return open && !hasPrediction;
      if (statusFilter === 'predicted') return hasPrediction;

      return true;
    });
  }, [matches, predByMatch, betDeadlineMinutes, searchQuery, yearFilter, monthFilter, statusFilter]);

  // Ordenar
  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'date-asc':
        list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
        break;
      case 'date-desc':
        list.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
        break;
      case 'team':
        list.sort((a, b) => {
          const aName = (a.home_team?.name || '') + (a.away_team?.name || '');
          const bName = (b.home_team?.name || '') + (b.away_team?.name || '');
          return aName.localeCompare(bName);
        });
        break;
      case 'round':
        list.sort((a, b) => (a.round || '').localeCompare(b.round || ''));
        break;
    }
    return list;
  }, [filtered, sortBy]);

  // Agrupar por fecha solo cuando se ordena por fecha
  const grouped = useMemo(() => {
    if (sortBy !== 'date-asc' && sortBy !== 'date-desc') {
      return null; // sin agrupar
    }
    const map = new Map<string, Match[]>();
    for (const m of sorted) {
      const key = formatDate(m.scheduled_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [sorted, sortBy]);

  const activeFiltersCount =
    (yearFilter !== 'all' ? 1 : 0) +
    (monthFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  function clearFilters() {
    setSearchQuery('');
    setYearFilter('all');
    setMonthFilter('all');
    setStatusFilter('all');
    updateUrl({ q: null, year: null, month: null, status: null });
  }

  const hasMatches = matches.length > 0;

  function renderMatchCard(match: Match) {
    const pred = predByMatch.get(match.id);
    const open = isBetOpen(match, betDeadlineMinutes);
    const isFinished = match.status === 'FT' || match.status === 'AFT';
    const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(match.status || '');
    const isOverdue = !isFinished && !isLive && new Date(match.scheduled_at) < new Date();
    const hasPenalties = match.home_penalty_goals !== null && match.away_penalty_goals !== null;
    const homeWon = isFinished && (match.home_goals ?? 0) > (match.away_goals ?? 0);
    const awayWon = isFinished && (match.away_goals ?? 0) > (match.home_goals ?? 0);
    const isDraw = isFinished && (match.home_goals ?? 0) === (match.away_goals ?? 0);

    return (
      <div
        key={match.id}
        className="grid grid-cols-[1fr_90px_1fr_90px] gap-3 items-center rounded-xl border bg-card p-4"
      >
        {/* Col 1: Equipo local */}
        <div className={`flex items-center justify-end gap-2 min-w-0 ${homeWon ? 'text-green-700' : isDraw ? 'text-amber-700' : ''}`}>
          <span className="font-semibold truncate">{match.home_team?.name || 'Local'}</span>
          {homeWon && <span className="text-lg shrink-0">✓</span>}
          {match.home_team?.logo_url && (
            <img src={match.home_team.logo_url} alt="" className="h-6 w-6 object-contain shrink-0" />
          )}
        </div>

        {/* Col 2: Centro (marcador/vs + hora + round) */}
        <div className="flex flex-col items-center">
          {isFinished || isLive ? (
            <>
              <span className="text-lg font-black leading-tight">
                {match.home_goals ?? '-'} : {match.away_goals ?? '-'}
              </span>
              {hasPenalties && (
                <span className="text-[10px] text-muted-foreground">
                  (P) {match.home_penalty_goals} - {match.away_penalty_goals}
                </span>
              )}
            </>
          ) : isOverdue ? (
            <>
              <span className="text-xs text-amber-600 font-semibold leading-tight">Pendiente</span>
              <span className="text-[10px] text-muted-foreground">vs</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground leading-tight">vs</span>
          )}
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 leading-tight">EN VIVO</span>
          )}
          {isDraw && !hasPenalties && (
            <span className="text-[10px] font-bold text-amber-600 leading-tight">Empate</span>
          )}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            {formatTime(match.scheduled_at)}
          </div>
          {match.round && (
            <span className="text-[10px] text-muted-foreground whitespace-normal break-words leading-tight text-center">{match.round}</span>
          )}
        </div>

        {/* Col 3: Equipo visitante */}
        <div className={`flex items-center gap-2 min-w-0 ${awayWon ? 'text-green-700' : isDraw ? 'text-amber-700' : ''}`}>
          {match.away_team?.logo_url && (
            <img src={match.away_team.logo_url} alt="" className="h-6 w-6 object-contain shrink-0" />
          )}
          {awayWon && <span className="text-lg shrink-0">✓</span>}
          <span className="font-semibold truncate">{match.away_team?.name || 'Visitante'}</span>
        </div>

        {/* Col 4: Botón / estado */}
        <div className="flex justify-end items-center">
          {pred ? (
            <Link
              href={`/pollas/${pollaId}/prediccion/${match.id}`}
              onClick={() => {
                sessionStorage.setItem('fixtureScrollY', String(window.scrollY));
                sessionStorage.setItem('fixtureReturnUrl', window.location.pathname + window.location.search);
              }}
            >
              <Button
                variant={open ? 'default' : 'outline'}
                size="sm"
                className={`gap-1 shrink-0 w-[90px] justify-center ${open ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              >
                {open ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {pred.home_goals}-{pred.away_goals}
                {pred.wildcard_used && (
                  <span className={`ml-1 rounded-full px-1 py-px text-[10px] font-bold ${pred.wildcard_used === 'x3' ? 'bg-purple-500 text-white' : 'bg-amber-500 text-white'}`}>
                    {pred.wildcard_used.toUpperCase()}
                  </span>
                )}
              </Button>
            </Link>
          ) : open ? (
            <Link
              href={`/pollas/${pollaId}/prediccion/${match.id}`}
              onClick={() => {
                sessionStorage.setItem('fixtureScrollY', String(window.scrollY));
                sessionStorage.setItem('fixtureReturnUrl', window.location.pathname + window.location.search);
              }}
            >
              <Button size="sm" className="bg-[#0d3d1f] hover:bg-[#0d3d1f]/90 w-[90px] justify-center">
                Predecir
              </Button>
            </Link>
          ) : (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground w-[90px] text-center block">
              Cerrado
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen de contadores */}
      {hasMatches && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col items-center rounded-xl border bg-card py-1.5 px-2">
            <Calendar className="h-3.5 w-3.5 text-slate-500 mb-0.5" />
            <span className="text-base font-bold leading-none text-slate-700">{counts.total}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Total</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border bg-red-50 py-1.5 px-2">
            <Lock className="h-3.5 w-3.5 text-red-500 mb-0.5" />
            <span className="text-base font-bold leading-none text-red-700">{counts.closed}</span>
            <span className="text-[10px] text-red-600/70 mt-0.5">Cerrados</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border bg-amber-50 py-1.5 px-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 mb-0.5" />
            <span className="text-base font-bold leading-none text-amber-700">{counts.missing}</span>
            <span className="text-[10px] text-amber-600/70 mt-0.5">Sin predicción</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border bg-emerald-50 py-1.5 px-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mb-0.5" />
            <span className="text-base font-bold leading-none text-emerald-700">{counts.predicted}</span>
            <span className="text-[10px] text-emerald-600/70 mt-0.5">Predichos</span>
          </div>
        </div>
      )}

      {/* Barra de búsqueda, filtros y actualizar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); updateUrl({ q: e.target.value }); }}
            placeholder="Buscar por equipo..."
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); updateUrl({ q: null }); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtros de estado siempre visibles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'open', 'missing', 'predicted', 'closed'] as StatusFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                const next = statusFilter === key ? 'all' : key;
                setStatusFilter(next);
                updateUrl({ status: next });
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {STATUS_LABELS[key]}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = !showFilters;
                setShowFilters(next);
                updateUrl({ showFilters: next ? '1' : null });
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showFilters || yearFilter !== 'all' || monthFilter !== 'all'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              <Filter className="h-3 w-3" />
              Más filtros
              {(yearFilter !== 'all' || monthFilter !== 'all') && (
                <span className="ml-0.5 rounded-full bg-primary px-1 py-0.5 text-[10px] font-bold text-white">
                  {(yearFilter !== 'all' ? 1 : 0) + (monthFilter !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}

            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as SortBy); updateUrl({ sort: e.target.value }); }}
              className="rounded-lg border border-input bg-background px-2 py-1.5 pr-6 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="date-asc">Fecha ↑</option>
              <option value="date-desc">Fecha ↓</option>
              <option value="team">Equipo</option>
              <option value="round">Fase</option>
            </select>
          </div>
        </div>

        {/* Panel de filtros expandible (año, mes) */}
        {showFilters && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {availableYears.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Año</label>
                  <select
                    value={yearFilter}
                    onChange={(e) => { setYearFilter(e.target.value); updateUrl({ year: e.target.value }); }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="all">Todos</option>
                    {availableYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              {availableMonths.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Mes</label>
                  <select
                    value={monthFilter}
                    onChange={(e) => { setMonthFilter(e.target.value); updateUrl({ month: e.target.value }); }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="all">Todos</option>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>{MONTHS[m]}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contador de resultados */}
      {hasMatches && (
        <p className="text-xs text-muted-foreground">
          Mostrando {sorted.length} de {matches.length} partidos
        </p>
      )}

      {/* Lista de partidos */}
      {grouped ? (
        // Vista agrupada por fecha
        Array.from(grouped.entries()).map(([date, dayMatches]) => (
          <div key={date} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {date}
            </div>
            <div className="space-y-2">
              {dayMatches.map((match) => renderMatchCard(match))}
            </div>
          </div>
        ))
      ) : sorted.length > 0 ? (
        // Vista plana (sin agrupar)
        <div className="space-y-2">
          {sorted.map((match) => renderMatchCard(match))}
        </div>
      ) : null}

      {(!sorted || sorted.length === 0) && hasMatches && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No hay partidos que coincidan con los filtros.
        </div>
      )}

      {(!matches || matches.length === 0) && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No hay partidos cargados todavía.
          {isAdmin && (
            <div className="mt-2">
              <Link href={`/pollas/${pollaId}/configurar`}>
                <Button variant="outline" size="sm">
                  Ir a configurar para activar
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
