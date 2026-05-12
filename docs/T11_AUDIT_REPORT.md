# T11 — Full Audit Report
## Golazo: Security, Performance, Load Testing, Supabase Limits, Concurrency

**Fecha:** 2026-04-25
**Auditor:** Kimi Code CLI
**Scope:** Backend, DB, API, Infrastructure, Concurrency

---

## 1. RACE CONDITIONS & CONCURRENCY

### 1.1 Race condition en `savePrediction` — validación de comodines ⚠️ ALTA

**Problema:** La validación de comodines disponibles NO es atómica.

```typescript
// Paso 1: Contar comodines usados
const { data: playerWildcards } = await admin
  .from('predictions')
  .select('wildcard_used, match_id')
  ...

// Paso 2: Validar
if (wildcard === 'x2' && usedX2 >= totalX2) return error;

// Paso 3: Insertar
await supabase.from('predictions').upsert(...)
```

**Escenario de race:** Dos usuarios (o el mismo usuario con dos tabs) envían predicción con comodín x2 simultáneamente. Ambos pasan la validación (ambos ven `usedX2 = 0, totalX2 = 1`), y ambos insertan. Resultado: 2 comodines x2 usados cuando solo había 1 disponible.

**Mitigación actual:** Ninguna. La DB no tiene constraint de UNIQUE sobre comodines por usuario.

**Fix recomendado:** Agregar un campo `wildcards_used` contador en `polla_members` y hacer la validación + update en una sola operación atómica (o usar advisory lock en PostgreSQL).

### 1.2 Race condition en cron — cálculo de puntos duplicado ⚠️ MEDIA

**Problema:** El cron marca `points_calculated = true` DESPUÉS de calcular. Si dos instancias del cron corren simultáneamente (ej: cron-job.org hace retry), ambas pueden procesar los mismos partidos.

**Impacto:**
- `match_points`: `upsert` con `onConflict` previene duplicados → ✅ Seguro
- `ranking_history`: `insert` sin deduplicación → ❌ Puede duplicar entradas
- `player_streaks`/`player_badges`: Upserts → ✅ Seguro
- `polla_members.total_points`: Updates → ✅ Seguro (sobrescribe)

**Mitigación:** Agregar `DISTINCT` o deduplicación en `recordRankingHistory`, o usar un lock de ejecución (ej: tabla `cron_locks`).

### 1.3 Race condition en predicciones — deadline ⚠️ BAJA

**Problema:** La validación de deadline usa `get_server_time()` (hora de PostgreSQL) pero la inserción no es atómica con la validación. Entre la validación y el insert, el deadline podría pasar.

**Impacto:** Muy bajo. La ventana de tiempo es milisegundos. Aceptable para este caso de uso.

---

## 2. SUPABASE LIMITS

### 2.1 `max_rows = 1000` ⚠️ MEDIA

En `supabase/config.toml` línea 16: `max_rows = 1000`.

**Queries que podrían exceder 1000 filas:**

| Query | Tabla | ¿Riesgo? | Notas |
|-------|-------|----------|-------|
| `select('*, home_team(*), away_team(*)')` en fixture page | matches | ⚠️ Sí | Torneo con >1000 partidos truncaría |
| `select('user_id, home_goals...')` en batch calculate | predictions | ⚠️ Sí | Polla con >1000 miembros × múltiples partidos |
| `select('user_id, alias')` en ranking history | polla_members | ✅ No | Miembros típicos <100 |
| `select('*')` en fixture sync | matches | ✅ No | Filtra por torneo |

**Recomendación:** Las queries de fixtures deberían paginarse o al menos tener `.limit(1000)` explícito con manejo de paginación.

### 2.2 Conexiones y Pooler

- Pooler deshabilitado en local (`enabled = false`)
- En producción (Supabase cloud): 60 conexiones directas en plan gratuito/pro
- Edge Runtime usa HTTP/1.1 con `fetch` — cada request crea una nueva conexión HTTP
- **No hay connection pooling** en el cliente de Supabase usado en Edge Runtime

**Impacto:** Con muchos usuarios concurrentes, podría agotarse el pool de conexiones de Supabase.

**Recomendación:** Considerar habilitar el pooler de Supabase (Supavisor) y usar la connection string del pooler en Edge Runtime.

### 2.3 Storage limits

- `file_size_limit = "50MiB"` en config local
- En producción: 1GB en plan gratuito
- La app solo usa avatares (pequeños) → ✅ Sin riesgo

### 2.4 Auth limits

- `jwt_expiry = 3600` (1 hora)
- Refresh token rotation habilitado
- Sin riesgos identificados

---

## 3. PERFORMANCE

### 3.1 Queries sin índices ⚠️ MEDIA

**Revisión de índices existentes (migración 0001):**
```sql
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_scheduled ON matches(scheduled_at);
CREATE INDEX idx_predictions_user ON predictions(user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);
CREATE INDEX idx_polla_members_polla ON polla_members(polla_id);
CREATE INDEX idx_polla_members_user ON polla_members(user_id);
CREATE INDEX idx_special_predictions_polla ON special_predictions(polla_id);
CREATE INDEX idx_ranking_history_polla ON ranking_history(polla_id);
```

**Índices FALTANTES que podrían mejorar performance:**

| Query | Índice recomendado | Impacto |
|-------|-------------------|---------|
| `matches.points_calculated = false` | `CREATE INDEX idx_matches_points_calculated ON matches(points_calculated) WHERE points_calculated = false;` | ⚡ Alto — usado en cada cron |
| `predictions.polla_id + match_id` | `CREATE INDEX idx_predictions_polla_match ON predictions(polla_id, match_id);` | ⚡ Alto — batch calculate |
| `matches.tournament_id + status + points_calculated` | `CREATE INDEX idx_matches_tournament_status_calculated ON matches(tournament_id, status, points_calculated);` | ⚡ Alto — cron live sync |
| `api_usage_logs.identifier + action + created_at` | Ya existe (0018) | ✅ OK |
| `player_streaks.polla_id + user_id` | UNIQUE constraint ya es índice | ✅ OK |

### 3.2 N+1 Queries ⚠️ BAJA

En `calculateMatchPoints` (legacy), se hace un loop sobre predicciones y un update por cada una. PERO `batchCalculateMatchPoints` ya lo resolvió con batch upsert. ✅

En `recalculateMemberTotalPoints`, se hacen 2 queries por miembro (match_points + special_predictions). Si hay 100 miembros, son 200 queries. Esto ocurre en cada batch calculate.

**Mitigación:** Considerar precalcular totales con una query agregada en vez de member-by-member.

### 3.3 Memory usage en Edge Runtime

- Edge Runtime tiene **128MB de memoria**
- `batchCalculateMatchPoints` carga TODAS las predicciones de TODOS los partidos pendientes en memoria
- Si una polla tiene 100 miembros × 10 partidos pendientes = 1000 predicciones
- Cada predicción es ~50 bytes → ~50KB → ✅ Sin problema
- Pero si creciera a 1000 miembros × 100 partidos = 100K predicciones → ~5MB → ✅ Aún OK

**Conclusión:** Sin riesgo inmediato, pero monitorear.

---

## 4. API-FOOTBALL LIMITS

### 4.1 Consumo actual estimado

| Endpoint | Frecuencia | Requests/día |
|----------|-----------|-------------|
| `getLiveFixtures` | Cada 2 min | 720 |
| `getFixturesByIds` (disappeared/overdue) | Cada 2 min | Variable (~50-200) |
| `getFixtures` (fixture sync cron) | Cada 6 horas | ~4-20 por torneo |
| `getFixturesByIds` (manual refresh) | Por admin | Variable |

**Total estimado:** ~1000-1500 requests/día

### 4.2 Límites del plan

- Plan gratuito de API-Football: **100 requests/día** (no 7500)
- El valor `7500` en `system_settings` parece ser un límite autoimpuesto, no el real de la API

**⚠️ CRÍTICO:** Si están usando el plan gratuito, el cron YA está excediendo el límite diario. Esto explicaría por qué a veces la API no devuelve datos (plan limit reached).

**Recomendación:** Verificar el plan real de API-Football. Si es gratuito, necesitan:
1. Reducir frecuencia del cron a cada 5-10 min (en vez de 2 min)
2. O upgradear a plan de pago ($20/mes = 7500 requests/día)

### 4.3 Batch de IDs

`getFixturesByIds` hace batches de 10 IDs. Si hay 50 partidos disappeared, hace 5 requests. ✅ Eficiente.

---

## 5. VERCEL LIMITS (Hobby Plan)

### 5.1 Function Execution

- **Timeout Edge:** 30s ✅ (configurado)
- **Timeout Serverless:** 10s (no usamos)
- **Max Memory Edge:** 128MB
- **Concurrent executions:** 1000 (Hobby)

### 5.2 Cron triggers

- Vercel Hobby **bloquea cron nativo** → Usan cron-job.org ✅
- Pero cron-job.org no garantiza exactly-once execution → Puede haber overlap de ejecuciones

### 5.3 Build limits

- 6000 minutos/mes (Hobby)
- Build actual: ~2-3 minutos
- Sin riesgo

---

## 6. SECURITY (repaso rápido)

| Aspecto | Estado | Notas |
|---------|--------|-------|
| RLS en tablas críticas | ✅ | profiles, pollas, predictions, etc. |
| RLS en api_usage_logs | ✅ (0028) | Nueva migración |
| CRON_SECRET | ✅ | Bearer token en headers |
| service_role key | ⚠️ | Nunca expuesta al cliente |
| SQL Injection | ✅ | Solo queries parametrizadas (Supabase JS) |
| XSS | ✅ | React escapa por defecto |
| CSRF | N/A | Next.js Server Actions manejan CSRF tokens implícitamente |

---

## 7. RECOMENDACIONES PRIORIZADAS

### Prioridad 1 (Crítico — hacer YA)

1. **Verificar plan API-Football** — Si es gratuito (100 req/día), el cron va a fallar consistentemente. Reducir frecuencia o upgradear.
2. **Agregar índice faltante** `idx_matches_points_calculated` — Mejora performance del cron.

### Prioridad 2 (Alto — esta semana)

3. **Fix race condition de comodines** — Agregar validación atómica o advisory lock.
4. **Agregar deduplicación en `ranking_history`** — Prevenir duplicados si el cron se solapa.
5. **Paginar queries de fixture list** — Manejar >1000 partidos.

### Prioridad 3 (Medio — próxima semana)

6. **Precalcular totales agregados** — Evitar N+1 en `recalculateMemberTotalPoints`.
7. **Monitorear uso de memoria** en Edge Runtime.
8. **Agregar índice compuesto** `idx_matches_tournament_status_calculated`.

### Prioridad 4 (Bajo — cuando crezca)

9. **Habilitar Supavisor (pooler)** para conexiones de Edge Runtime.
10. **Implementar distributed lock** para el cron (evitar overlap).

---

## 8. LOAD TESTING — Estimaciones teóricas

| Métrica | Estimación actual | Límite teórico | Cuello de botella |
|---------|------------------|----------------|-------------------|
| Miembros por polla | ~20-50 | ~500 | `batchCalculateMatchPoints` memoria |
| Pollas activas | ~10 | ~100 | Cron de 30s procesando todas |
| Partidos por torneo | ~64 | ~500 | `max_rows = 1000` |
| Requests API-Football/día | ~1500 | 7500 (setting) | Plan de API-Football real |
| Conexiones Supabase concurrentes | ~10-20 | 60 (plan gratuito) | Vercel Edge Runtime sin pooler |
| Tiempo de build | ~2-3 min | 10 min (Vercel free) | N/A |

**Conclusión:** La app soporta sin problemas ~100 usuarios activos, ~10 pollas concurrentes, ~500 partidos. Para escalar más allá, se necesita:
- Upgradear plan API-Football
- Habilitar pooler de conexiones
- Paginar fixture list
- Optimizar batch calculate

---

*Fin del reporte T11.*
