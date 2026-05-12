# T11 — Plan de Optimización para Escalabilidad
## De ~100 usuarios/polla a ~1000+ usuarios, ~100 pollas, ~1000 partidos

---

## Cuello de botella #1: `recalculateMemberTotalPoints` (N+1)

### Problema
```typescript
// En batchCalculateMatchPoints, línea 463:
for (const member of members || []) {
  await recalculateMemberTotalPoints(pollaId, member.user_id);
}
```

`recalculateMemberTotalPoints` hace **2 queries por miembro**:
1. Sumar `match_points` del usuario
2. Sumar `special_predictions` del usuario

Con 100 miembros = **200 queries + 100 updates**. Con 1000 miembros = **2000 queries + 1000 updates**.

### Fix: Recálculo agregado en una sola query

Reemplazar el loop por una query SQL que recalcula TODOS los totales en una sola pasada:

```sql
-- Una sola query que calcula totales para TODOS los miembros de una polla
WITH match_totals AS (
  SELECT user_id, COALESCE(SUM(points), 0) as total
  FROM match_points
  WHERE polla_id = $1
  GROUP BY user_id
),
special_totals AS (
  SELECT user_id, COALESCE(SUM(points), 0) as total
  FROM special_predictions
  WHERE polla_id = $1
  GROUP BY user_id
)
SELECT 
  pm.user_id,
  COALESCE(mt.total, 0) + COALESCE(st.total, 0) as total_points
FROM polla_members pm
LEFT JOIN match_totals mt ON mt.user_id = pm.user_id
LEFT JOIN special_totals st ON st.user_id = pm.user_id
WHERE pm.polla_id = $1 AND pm.status = 'approved';
```

**Impacto:** De 200 queries a 1 query para 100 miembros. **200× más rápido**.

### Implementación en código:

```typescript
async function recalculateAllMemberTotals(pollaId: string) {
  const admin = createAdminClient();

  // Versión 0031: RPC hace UPDATE directo en SQL y devuelve true
  const { data: result, error } = await admin.rpc('recalculate_polla_totals', {
    p_polla_id: pollaId,
  });

  if (!error && result === true) return;

  // Fallback legacy: recalcular miembro por miembro
  // ...
}
```

**Migración 0031 (RPC optimizado — UPDATE directo en SQL):**

```sql
CREATE OR REPLACE FUNCTION public.recalculate_polla_totals(p_polla_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  WITH match_totals AS (
    SELECT mp.user_id, COALESCE(SUM(mp.points), 0) as total
    FROM public.match_points mp
    WHERE mp.polla_id = p_polla_id
    GROUP BY mp.user_id
  ),
  special_totals AS (
    SELECT sp.user_id, COALESCE(SUM(sp.points), 0) as total
    FROM public.special_predictions sp
    WHERE sp.polla_id = p_polla_id
    GROUP BY sp.user_id
  ),
  computed AS (
    SELECT
      pm.user_id,
      (COALESCE(mt.total, 0) + COALESCE(st.total, 0))::INTEGER as total_points
    FROM public.polla_members pm
    LEFT JOIN match_totals mt ON mt.user_id = pm.user_id
    LEFT JOIN special_totals st ON st.user_id = pm.user_id
    WHERE pm.polla_id = p_polla_id AND pm.status = 'approved'
  )
  UPDATE public.polla_members pm
  SET total_points = c.total_points
  FROM computed c
  WHERE pm.polla_id = p_polla_id AND pm.user_id = c.user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Impacto:** De 200 queries + 100 updates a **1 query SQL** para 100 miembros. **300× más rápido**.

---

## Cuello de botella #2: `awardBadgesFromMatch` (N llamadas async)

### Problema
```typescript
// En batchCalculateMatchPoints, línea 434:
for (const pred of predictions || []) {
  // ... calcular puntos ...
  await awardBadgesFromMatch(pollaId, pred.user_id, {
    exact, correctResult, wildcardUsed, isFinal,
  });
}
```

Se llama `awardBadgesFromMatch` **una vez por predicción**. Con 1000 predicciones = 1000 llamadas a Supabase.

### Fix: Batch badges

Acumular todos los eventos de badge y procesarlos en un solo batch al final:

```typescript
// En batchCalculateMatchPoints:
const badgeEvents: BadgeEvent[] = [];

for (const pred of predictions || []) {
  // ... calcular puntos ...
  badgeEvents.push({
    userId: pred.user_id,
    exact: realHome === pred.home_goals && realAway === pred.away_goals,
    correctResult: Math.sign(realHome - realAway) === Math.sign(pred.home_goals - pred.away_goals),
    wildcardUsed: pred.wildcard_used,
    isFinal: m?.round?.toLowerCase() === 'final',
  });
}

// Procesar badges en batch (una sola query)
await awardBadgesBatch(pollaId, badgeEvents);
```

---

## Cuello de botella #3: `ranking_history` crece sin bound

### Problema
`recordRankingHistory` inserta una fila por miembro por cada vez que se ejecuta. Con 100 miembros × 500 partidos = **50,000 filas** por torneo. Si el cron se ejecuta 2 veces por partido (overlap), puede duplicarse.

### Fix: Delete + Insert idempotente

En vez de depender de una constraint UNIQUE (que requiere migración aplicada), usamos delete previo + insert:

```typescript
async function recordRankingHistory(pollaId: string, matchId: string | null) {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('polla_members')
    .select('user_id, total_points')
    .eq('polla_id', pollaId)
    .eq('status', 'approved')
    .order('total_points', { ascending: false });

  if (!members || members.length === 0) return;

  const rows = members.map((m, index) => ({
    polla_id: pollaId,
    user_id: m.user_id,
    match_id: matchId,
    position: index + 1,
    total_points: m.total_points || 0,
  }));

  // Borrar snapshot anterior + insertar nuevo = idempotente
  const deleteQuery = admin.from('ranking_history').delete().eq('polla_id', pollaId);
  if (matchId === null) {
    await deleteQuery.is('match_id', null);
  } else {
    await deleteQuery.eq('match_id', matchId);
  }

  await admin.from('ranking_history').insert(rows);
}
```

**Beneficio:** Idempotente sin depender de constraints — funciona incluso si la migración 0030 no está aplicada todavía.

**Nota:** La migración 0030 también incluye la constraint `UNIQUE (polla_id, user_id, match_id)` para quienes quieran usar `upsert` directamente una vez aplicada.

---

## Cuello de botella #4: Fixture list carga TODO sin paginación

### Problema
```tsx
// fixture-list.tsx recibe matches[] completo
<FixtureList matches={matches || []} ... />
```

Si un torneo tiene 1000+ partidos, la query se trunca por `max_rows = 1000`.

### Fix: Paginación server-side

En `fixture/page.tsx`, agregar paginación:

```typescript
const PAGE_SIZE = 50;
const page = parseInt(searchParams.get('page') || '1', 10);
const offset = (page - 1) * PAGE_SIZE;

const { data: matches, count } = await admin
  .from('matches')
  .select('*', { count: 'exact' })
  .eq('tournament_id', tournamentId)
  .order('scheduled_at', { ascending: true })
  .range(offset, offset + PAGE_SIZE - 1);
```

Y en el UI, agregar botones de paginación o scroll infinito.

**Alternativa menos invasiva:** Filtrar por defecto solo partidos futuros + últimos 7 días:

```typescript
const { data: matches } = await admin
  .from('matches')
  .select('*')
  .eq('tournament_id', tournamentId)
  .or(`status.in.(${LIVE_STATUSES}),scheduled_at.gte.${weekAgo}`)
  .order('scheduled_at', { ascending: true })
  .limit(200);
```

---

## Cuello de botella #5: Cron overlap (ejecución simultánea)

### Problema
cron-job.org puede ejecutar el cron mientras el anterior sigue corriendo (si se demora más de 2 minutos).

### Fix: Distributed lock con tabla `cron_locks`

```sql
CREATE TABLE cron_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  instance_id TEXT
);
```

Y en el cron:

```typescript
async function acquireLock(jobName: string, timeoutSeconds: number): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const until = new Date(Date.now() + timeoutSeconds * 1000).toISOString();
  
  // Intentar insertar (falla si ya existe)
  const { error } = await admin
    .from('cron_locks')
    .insert({ job_name: jobName, locked_until: until, instance_id: crypto.randomUUID() })
    .single();
  
  if (!error) return true;
  
  // Si existe, verificar si expiró
  const { data: lock } = await admin
    .from('cron_locks')
    .select('locked_until')
    .eq('job_name', jobName)
    .single();
  
  if (lock && new Date(lock.locked_until) < new Date()) {
    // Lock expirado, tomarlo
    await admin.from('cron_locks').delete().eq('job_name', jobName);
    const { error: err2 } = await admin
      .from('cron_locks')
      .insert({ job_name: jobName, locked_until: until });
    return !err2;
  }
  
  return false;
}

async function releaseLock(jobName: string) {
  const admin = createAdminClient();
  await admin.from('cron_locks').delete().eq('job_name', jobName);
}
```

---

## Cuello de botella #6: API-Football requests

### Problema
- `getLiveFixtures('all')` se llama cada 2 min = **720 requests/día**
- Plan gratuito de API-Football = **100 requests/día**

### Fix: Cachear respuestas

Agregar cache simple en memoria (Edge Runtime no tiene Redis, pero sí Cache API):

```typescript
// services/api-football.ts
const CACHE_TTL_MS = 60_000; // 1 minuto para live fixtures

async function fetchFootball(endpoint: string, options: ApiOptions = {}) {
  const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
  const cache = caches.default;
  
  // En Edge Runtime, usar Cache API
  const cached = await cache.match(new Request(`https://cache/${cacheKey}`));
  if (cached) {
    return cached.json();
  }
  
  const response = await fetch(url, { headers: ... });
  const data = await response.json();
  
  // Guardar en cache
  await cache.put(
    new Request(`https://cache/${cacheKey}`),
    new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'max-age=60' } })
  );
  
  return data;
}
```

**Alternativa más simple:** Reducir frecuencia del cron a cada **5 minutos** (288 requests/día) o **10 minutos** (144 requests/día).

---

## Cuello de botella #7: Índices faltantes

### Migración de índices recomendada:

```sql
-- ============================================
-- 0030_performance_indexes.sql
-- Índices críticos para escalar a 1000+ usuarios
-- ============================================

-- 1. Acelera el cron de live sync (busca partidos sin calcular por torneo)
CREATE INDEX IF NOT EXISTS idx_matches_tournament_status_calculated 
  ON matches(tournament_id, status, points_calculated)
  WHERE points_calculated = false;

-- 2. Acelera batch calculate (predicciones por polla + match)
CREATE INDEX IF NOT EXISTS idx_predictions_polla_match 
  ON predictions(polla_id, match_id)
  WHERE match_id IS NOT NULL;

-- 3. Acelera recálculo de totales (match_points por polla + user)
CREATE INDEX IF NOT EXISTS idx_match_points_polla_user 
  ON match_points(polla_id, user_id);

-- 4. Acelera recálculo de especiales (special_predictions por polla + user)
CREATE INDEX IF NOT EXISTS idx_special_predictions_polla_user 
  ON special_predictions(polla_id, user_id);

-- 5. Acelera fixture list (partidos de torneo ordenados por fecha)
CREATE INDEX IF NOT EXISTS idx_matches_tournament_scheduled 
  ON matches(tournament_id, scheduled_at DESC);

-- 6. Acelera ranking history (evita full scan)
CREATE INDEX IF NOT EXISTS idx_ranking_history_polla_match 
  ON ranking_history(polla_id, match_id);

-- 7. Constraint para prevenir duplicados en ranking_history
ALTER TABLE ranking_history 
  ADD CONSTRAINT IF NOT EXISTS unique_ranking_snapshot 
  UNIQUE (polla_id, user_id, match_id);
```

---

## Cuello de botella #8: Settings cache TTL muy corto

### Problema
```typescript
// lib/settings.ts: CACHE_TTL_MS = 60_000 (1 minuto)
```

Settings rara vez cambian (rate limits, cron intervals). Cachear cada minuto genera queries innecesarias.

### Fix: TTL más largo + invalidación manual

```typescript
const CACHE_TTL_MS = 300_000; // 5 minutos (settings cambian poco)
```

O mejor: cachear indefinidamente y invalidar solo cuando se guarda un setting:

```typescript
// En admin/settings/settings-form.tsx:
import { invalidateSettingsCache } from '@/lib/settings';

// Después de guardar:
await saveSetting(key, value);
invalidateSettingsCache(); // Fuerza recarga en próximo request
```

---

## Resumen de optimizaciones y impacto estimado

| # | Optimización | Complejidad | Impacto | Estimado |
|---|-------------|-------------|---------|----------|
| 1 | Batch recalculateMemberTotalPoints (RPC 0031) | 🟡 Media | 🔥🔥🔥 | De 200 queries a 1 SQL (300×) |
| 2 | Batch badges (acumular + procesar al final) | 🟡 Media | 🔥🔥🔥 | De 1000 queries a 1 (1000×) |
| 3 | Delete+Insert ranking_history idempotente | 🟢 Baja | 🔥🔥 | Previene duplicados, sin depender de constraints |
| 4 | Paginación en fixture list | 🟡 Media | 🔥🔥 | Soporta >1000 partidos |
| 5 | Distributed lock para cron | 🟡 Media | 🔥🔥 | Previene overlap |
| 6 | Cache API-Football + reducir frecuencia | 🟢 Baja | 🔥🔥 | De 720 a ~150 requests/día |
| 7 | Índices compuestos (migración 0030) | 🟢 Baja | 🔥🔥 | 10-100× más rápido en queries críticas |
| 8 | Cache settings TTL 5 min | 🟢 Baja | 🔥 | 5× menos queries de settings |

**Capacidad estimada después de optimizaciones:**
- **Antes:** ~100 usuarios/polla, ~10 pollas, ~500 partidos
- **Después:** ~1000 usuarios/polla, ~100 pollas, ~1000+ partidos

---

*Fin del plan de optimización.*
