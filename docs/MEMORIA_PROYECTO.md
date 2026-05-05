# Memoria del Proyecto — Golazo Polla Deportiva

> Archivo de contexto para sesiones futuras. Contiene decisiones tomadas, análisis del documento de diseño, recomendaciones aplicadas y plan de desarrollo priorizado.

---




## 1. Contexto del Proyecto

**Nombre:** Golazo  
**Tipo:** Aplicación web PWA de predicciones deportivas multijugador.  
**Enfoque inicial:** Mundial FIFA 2026 (junio 2026), pero arquitectura multi-torneo desde el día 1.  
**Público:** Grupos de amigos, familias, oficinas que quieren competir prediciendo resultados deportivos.

### Diferenciadores clave vs. otras pollas
- Sin app nativa: funciona desde el navegador como PWA.
- Sistema de comodines (x2, x3) con riesgo de pérdida si fallas.
- Predicciones especiales de torneo (campeón, finalista, clasificados) que generan tensión hasta el final.
- Posibilidad de predicción por voz (Web Speech API).
- Modo racha, reacciones por partido, logros/badges.
- Sincronización de resultados en tiempo real.

---

## 2. Stack Tecnológico Confirmado

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Framework | Next.js 14.2 + TypeScript | App Router, SSR para SEO, Server Components por defecto. |
| Estilos | Tailwind CSS + shadcn/ui | Diseño rápido, consistente, accesible. |
| Backend/BaaS | Supabase | Auth nativo, PostgreSQL, Realtime (websockets), Storage, Edge Functions. |
| Hosting | Vercel | Deploy automático desde Git, Edge Network, plan gratuito generoso. |
| API Deportiva | API-Football (RapidAPI) | Fixtures, resultados en vivo, logos, banderas. Mundial 2026 cubierto. |
| Emails | Resend | Emails transaccionales (inicio de polla, recordatorios, ranking). |
| Notificaciones | Web Push API + Resend fallback | Push nativo del navegador donde sea posible; email donde no. |
| Sync/Cron | Node.js + node-cron en Mac Mini | Script local que consulta API-Football y actualiza Supabase. |
| Estado Global | Zustand + React Query | Cache del servidor + estado de UI liviano. |

**Restricción importante:** iOS requiere que el usuario agregue la PWA a la pantalla de inicio para recibir push notifications. Por eso el email es fallback obligatorio.

---

## 3. Estado Actual del Proyecto (actualizado)

### Deploy — EN PRODUCCIÓN
- **URL producción:** https://golazo-puce.vercel.app
- **Repo GitHub:** https://github.com/nackbe/golazo (privado)
- **Auto-deploy:** configurar en Vercel Settings → Git → conectar repo `nackbe/golazo` (pendiente si aún no está hecho)
- **Env vars en Vercel:** todas seteadas (SUPABASE, API_FOOTBALL, CRON_SECRET, APP_URL)
- **Supabase Auth:** Site URL y redirect URL apuntando a producción
- **Pendiente:** configurar cron-job.org → `POST https://golazo-puce.vercel.app/api/sync` cada 2 min con `Authorization: Bearer CRON_SECRET`

### Fixes post-deploy aplicados (sesión 2026-05-05)
- Auth redirect a localhost: causa era `NEXT_PUBLIC_APP_URL=http://localhost:3001` en Vercel. Fix: usar solo `window.location.origin` en `login-form.tsx`.
- Inputs de predicción: `onFocus → select()` + botones +/- + `inputMode="numeric"`.
- Fixture card: tarjeta completa clickeable (todo el div es un `<Link>`).
- Prediction detail page: fecha, hora y jornada visibles; nombres de equipo con `w-[110px]`.
- Ranking invisible a miembros: workaround con admin client en `/pollas/[id]/page.tsx`. Fix real: migración 0021 (pendiente en Supabase).
- syncFixtures: ahora actualiza resultados existentes además de insertar nuevos.
- polla-settings-form: `ps()` y `sps()` estaban cruzadas — los puntos se guardaban en la tabla equivocada.
- loadFixtures: falla silenciosa con status `PST`/`TBD` etc. Fix: `normalizeMatchStatus()` + verificar error del upsert. Migración 0023 pendiente en Supabase.
- Polla list: badge Admin/Jugador, fecha de creación, filtros por rol/estado.
- Tournament search: auto-confirma al seleccionar (sin botón "Confirmar selección").

### Flujo de autenticación — FUNCIONANDO
- Google OAuth configurado y operativo.
- Trigger en DB crea perfil vacío (`alias = NULL`) al registrar usuario.
- Callback detecta si el usuario tiene alias: si sí → `/pollas`, si no → `/onboarding`.
- Onboarding guarda alias y redirige a `/pollas`.
- Dashboard layout protege todas las rutas: sin sesión → `/login`, sin alias → `/onboarding`.

### Crear polla — FUNCIONANDO
- Crea torneo por defecto ("Mundial FIFA 2026") si no existe, usando admin client.
- Genera código único de 6 caracteres.
- Agrega al creador como miembro aprobado automáticamente.
- Al crear, redirige a `/pollas/[id]/configurar` para que el admin configure todo de entrada.

### Configurar polla — FUNCIONANDO
- Página `/pollas/[id]/configurar` protegida (solo admin).
- 3 secciones colapsables: Configuración general, Sistema de puntos, Comodines.
- Sistema de puntos y comodines se bloquean cuando `status = active | finished`.
- Aprobación de miembros pendientes aparece arriba de la configuración.
- Admin aprueba/rechaza con admin client (no hay policy UPDATE en polla_members).

### Unirse con código — FUNCIONANDO
- La búsqueda de polla por código usa admin client (el usuario aún no es miembro, RLS lo bloquearía).

### Perfil de usuario — FUNCIONANDO
- Alias editable.
- Avatar: picker de 40 avatares pixel-art de DiceBear, temática futbolera.
- Guardar usa `router.refresh()` para actualizar header y server components al instante.

### UI — Rediseñada
- Header dark green (`#0d3d1f`), look deportivo premium.
- Fondo gris azulado suave (`hsl(220 20% 97%)`) en lugar de blanco puro.
- Cards con sombra, hover suave, bordes redondeados (`rounded-2xl`).
- Hero banner en página de pollas.
- Leaderboard con medallas 🥇🥈🥉 + avatar del jugador al lado del alias.
- Input de código de invitación grande y centrado (fácil en móvil).

### Admin settings — FUNCIONANDO
- Ruta `/admin/settings` protegida por `is_system_admin` (doble check: layout + server action).
- Edición en caliente de todos los parámetros de `system_settings`: rate limits, límites de pollas/fixtures, frecuencia de cron, límite de API.
- Cada setting se edita como JSON en un textarea, guardado individualmente.
- `lib/settings.ts` con cache en memoria de 1 minuto; se invalida al guardar.
- Para activar admin: `UPDATE profiles SET is_system_admin = true WHERE id = 'UUID';` en Supabase SQL Editor.

### Rate limiting — FUNCIONANDO
- Todas las acciones sensibles (cargar fixtures, sincronizar, buscar ligas, recalcular puntos) verifican rate limit antes de ejecutar.
- Límites configurables desde `/admin/settings` sin redesplegar.
- Usa `api_usage_logs` en DB + RPCs SECURITY DEFINER (`check_rate_limit`, `log_api_usage`).

### Fixture list — MEJORADA
- 4 contadores: total / cerrados / sin predicción / predichos.
- Búsqueda por equipo, filtros de estado (pills), filtros de año/mes (expandible), 4 ordenamientos.
- Filtros persistidos en URL query params (se restauran al volver de una predicción).
- Scroll position guardado en sessionStorage.
- Logos de equipos, highlighting de ganador/empate, badge EN VIVO, penales.

### Predicciones especiales de torneo — FUNCIONANDO
- 6 tipos: campeón (10pts), finalista (5pts), tercer lugar (3pts), menos goles en contra (5pts), peor equipo (4pts), máximo goleador por equipo (5pts).
- Página `/pollas/[id]/predicciones-especiales` con formulario que permite editar antes del primer partido.
- Puntos configurables por el admin en `special_point_system` (JSONB en tabla `pollas`).
- Server action valida deadline con `get_server_time()`.

### Invitación por link directo — FUNCIONANDO
- URL `/pollas/unirse?code=XXXXXX` pre-llena y auto-submite el formulario de unión.
- Botón "Copiar link" en el detalle de la polla.
- Flujo completo con OAuth: si el usuario no está logueado, el middleware guarda la URL en cookie `redirect_to`, y después del login redirige al destino original.

### Configurar polla — mejoras recientes
- Popup de confirmación antes de iniciar polla, con advertencia explícita de revisar y guardar cambios.
- Comodines x2/x3 ahora configurables de 0 a 100 (antes 0–5 y 0–3).
- PendingMembersList se actualiza automáticamente al entrar (sin necesidad de F5).
- Sincronización de partidos para pollas activas (agrega nuevos fixtures sin borrar existentes).

---

## 4. Arquitectura de Supabase — Decisiones Críticas

### 4.1. Dos clientes de Supabase: usuario vs. admin

Hay dos clientes distintos y su uso tiene reglas claras:

```typescript
// src/lib/supabase/server.ts — cliente normal (anon key + cookies)
// Usa la sesión del usuario. Respeta RLS. Usar para todo lo que el usuario hace.
const supabase = await createClient();

// src/lib/supabase/admin.ts — cliente admin (service_role key)
// Bypassa RLS completamente. Solo usar para operaciones de sistema.
const admin = createAdminClient();
```

**Regla:** usar admin client SOLO para:
- Datos de sistema: crear torneos, equipos, partidos (desde el sync script o al crear polla).
- Operaciones que el usuario no debería controlar directamente (backfills, upserts de perfil desde el API route de onboarding).

**Nunca** exponer el admin client en Client Components ni en rutas GET públicas.

### 4.2. Migraciones aplicadas en producción

Las migraciones se aplican manualmente en el SQL Editor de Supabase. Todas las que están en `/supabase/migrations/` deben estar aplicadas en orden.

| Migración | Qué hace |
|-----------|----------|
| `0001_initial_schema.sql` | Schema completo: todas las tablas, índices, RLS en tablas principales, función `updated_at`. |
| `0002_fix_rls_insert_policies.sql` | Policies de INSERT faltantes en profiles, pollas, polla_members, predictions. |
| `0003_fix_rls_complete.sql` | Funciones helper `is_polla_member()` / `is_polla_admin()` (SECURITY DEFINER para evitar RLS anidado). Trigger `handle_new_user` para crear perfil vacío al registrarse. |
| `0004_reset_rls_and_policies.sql` | Limpieza total y recreación de RLS. Agrega `FORCE ROW LEVEL SECURITY`. Backfill de perfiles existentes. |
| `0005_upsert_profile_rpc.sql` | Función RPC `upsert_profile(user_alias TEXT)` SECURITY DEFINER para guardar alias sin depender de policies. |
| `0006_storage_avatars.sql` | Bucket de Storage para avatares de perfil. |
| `0007_fix_upsert_profile_rpc.sql` | Corrige la RPC: ya no sobreescribe `avatar_url` con NULL. Solo actualiza `alias` y `updated_at`. |
| `0008_grant_table_permissions.sql` | **CRÍTICO:** GRANTs de tabla a roles `anon`, `authenticated`, `service_role`. Sin esto, cualquier tabla creada via SQL (no desde el dashboard) tiene "permission denied". |
| `0009_fix_all_table_permissions.sql` | Amplía los GRANTs: agrega INSERT/UPDATE en `tournaments`, `teams`, `matches` para `authenticated` y `service_role`. |
| `0010_rls_system_tables.sql` | Habilita RLS en `tournaments`, `teams`, `matches` con policies de solo lectura pública. El INSERT/UPDATE es exclusivo del admin client. |
| `0011_fase1_core_game.sql` | Agrega tabla `match_points` (constraint única `(polla_id, user_id, match_id)`), columna `points_calculated` en `matches`, función `get_server_time()` para validación anti-trampa de deadlines. |
| `0012_add_tournament_country.sql` | Agrega `country`, `type`, `updated_at` a `tournaments`. Trigger `update_tournaments_updated_at`. Índice `idx_tournaments_country`. |
| `0013_tournaments_unique_api_season.sql` | Reemplaza UNIQUE simple de `api_football_id` por compuesto `(api_football_id, season)` para soportar múltiples temporadas de la misma liga. |
| `0014_grant_delete_permissions.sql` | GRANT DELETE a `service_role` en `pollas`, `polla_members`, `match_points`, `ranking_history` para permitir eliminación de pollas. |
| `0015_special_predictions_points.sql` | Agrega columna `special_point_system` JSONB a `pollas`. Actualiza constraint `special_predictions_type_check` con 6 tipos válidos. |
| `0016_tournament_special_results.sql` | Tabla `tournament_special_results` (resultados reales por torneo: campeón, finalista, etc.). RLS con SELECT público. El sync la escribe via admin client. |
| `0017_match_penalties.sql` | Agrega `home_penalty_goals` y `away_penalty_goals` (INT, nullable) a `matches`. Se muestra en el fixture como `(P) X - Y`. |
| `0018_api_rate_limits.sql` | Tabla `api_usage_logs`. Funciones RPC `check_rate_limit()` y `log_api_usage()` SECURITY DEFINER para controlar abuso sin exponer la lógica al cliente. |
| `0019_cron_optimizations.sql` | Columna `last_fixture_sync_at TIMESTAMPTZ` en `tournaments`. Índice parcial. Permite al cron evitar re-sincronizar torneos recién actualizados. |
| `0020_system_settings.sql` | Tabla `system_settings (key TEXT PK, value JSONB)`. Columna `is_system_admin BOOLEAN` en `profiles`. Seed inicial con 10 parámetros del sistema. |
| `0021_fix_polla_members_select_policy.sql` | **⚠️ PENDIENTE aplicar en Supabase.** Reemplaza policy SELECT de `polla_members` "Users can view own memberships" (solo veía fila propia) por "Members can view all members of their pollas" — usa `is_polla_member(polla_id)`. Sin esta migración los miembros no ven el ranking. Workaround activo: `/pollas/[id]/page.tsx` usa admin client para la query del leaderboard. |
| `0022_add_email_to_profiles.sql` | **⚠️ PENDIENTE aplicar en Supabase.** Agrega columna `email TEXT` a `profiles`. Backfill desde `auth.users`. Actualiza trigger `handle_new_user` para guardar email al registrar usuario. |
| `0023_expand_match_status.sql` | **⚠️ PENDIENTE aplicar en Supabase.** Expande el CHECK constraint de `matches.status` para incluir todos los status de API-Football: `PST`, `TBD`, `ABD`, `AWD`, `WO`, `SUSP`, `INT`, `AET`, `PEN`, `BT`, `LIVE` además de los 9 originales. Sin esta migración `loadFixtures` falla silenciosamente para torneos con partidos postergados (ej: Libertadores). |
| `0024_admin_plays_column.sql` | **⚠️ PENDIENTE aplicar en Supabase.** `ALTER TABLE pollas ADD COLUMN admin_plays BOOLEAN DEFAULT TRUE NOT NULL`. Controla si el admin aparece en el ranking de su propia polla. Sin esta migración el toggle de configurar falla al guardar. |
| `0026_badges_and_streaks.sql` | **⚠️ PENDIENTE aplicar en Supabase.** Tablas `player_streaks` y `player_badges`. RLS. Índices. Necesaria para que el sistema de rachas y badges funcione en producción. |
| `0027_fix_streaks_permissions.sql` | **⚠️ PENDIENTE aplicar en Supabase.** `GRANT ALL ON player_streaks, player_badges TO service_role`. Sin esto el admin client no puede escribir en esas tablas. |

### 4.3. Admin client para leer ranking (workaround RLS)

Mientras la migración 0021 no esté aplicada en producción, el leaderboard en `/pollas/[id]/page.tsx` usa `createAdminClient()` en lugar del cliente normal para la query de `polla_members`. Esto es seguro porque ya se verificó que el usuario es admin o miembro aprobado antes de ejecutarla.

```typescript
// BIEN — workaround mientras 0021 no está aplicada
const admin = createAdminClient();
const { data: members } = await admin
  .from('polla_members')
  .select('alias, total_points, user_id, profiles(avatar_url)')
  .eq('polla_id', params.id)
  .eq('status', 'approved')
  .order('total_points', { ascending: false });
```

Una vez aplicada la migración 0021, esta query puede volver al cliente normal de usuario.

### 4.4. Lección aprendida: tablas creadas via SQL necesitan GRANTs manuales

Supabase solo otorga permisos automáticamente a `anon`/`authenticated` cuando se crean tablas **desde el dashboard**. Las tablas creadas en migraciones SQL necesitan:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mi_tabla TO authenticated, service_role;
GRANT SELECT ON TABLE public.mi_tabla TO anon;
```

Si esto falta: error `permission denied for table X`. Si además RLS está activo sin policies: error `new row violates row-level security policy`.

### 4.5. Tablas de sistema vs. tablas de usuario

| Tipo | Tablas | Acceso de escritura |
|------|--------|---------------------|
| Sistema (datos globales) | `tournaments`, `teams`, `matches` | Solo admin client / service_role |
| Usuario (datos propios) | `profiles`, `pollas`, `polla_members`, `predictions`, `special_predictions` | Cliente normal del usuario, controlado por RLS |
| Puntos calculados | `match_points` | Admin client (lo escribe el sistema de puntuación) |
| Histórico | `ranking_history` | Admin client (lo escribe el sistema de puntuación) |

**Nota:** `tournaments` ahora tiene `country`, `type`, `updated_at` (desde migración 0012). Estos campos se usan para mostrar detalle del torneo seleccionado en la UI.

---

## 5. Bugs Corregidos en Sesión Anterior — Detalle Técnico

Esto es importante para no repetir los mismos errores.

### Bug 1: Callback de auth siempre redirigía a `/pollas`
**Archivo:** `src/app/api/auth/callback/route.ts`  
**Síntoma:** Usuario ya registrado tenía que pasar por dashboard layout → redirect → onboarding → redirect. Frágil.  
**Fix:** El callback consulta el perfil directamente y decide: si tiene alias → `/pollas`, si no → `/onboarding`.

### Bug 2: `.eq()` después de `.upsert()` en supabase-js v2
**Archivo:** `src/app/api/onboarding/route.ts`  
**Síntoma:** El alias nunca se guardaba. El form parecía tener éxito pero el usuario volvía al onboarding.  
**Por qué falla:** En supabase-js v2, `from('table').upsert({...}).eq('col', val)` agrega un filtro WHERE al upsert que puede hacer que no encuentre la fila y no inserte. Es una combinación inválida para upsert.  
**Fix:** Usar `admin.from('profiles').upsert({ id, alias }, { onConflict: 'id' })` sin `.eq()`.

### Bug 3: `router.push()` creaba loop silencioso
**Archivo:** `src/components/features/auth/onboarding-form.tsx`  
**Síntoma:** Usuario ingresaba alias, hacía click, nada pasaba (en realidad: alias no se guardaba → router.push('/pollas') → dashboard redirigía a /onboarding → componente se remontaba limpio → usuario veía el mismo form).  
**Fix:** Usar `window.location.href = '/pollas'` (navegación dura) para garantizar que el servidor lea datos frescos de la DB, sin caché del router de Next.js.

### Bug 4: GRANTs faltantes en tablas SQL
**Síntoma:** `permission denied for table profiles` (y luego `tournaments`).  
**Causa:** Las tablas se crearon via migraciones SQL, no desde el dashboard. Supabase no auto-otorga permisos en ese caso.  
**Fix:** Migraciones 0008 y 0009 con GRANT explícitos para cada tabla y rol.

### Bug 5: RLS sin policies en tablas de sistema
**Síntoma:** `new row violates row-level security policy for table "tournaments"`.  
**Causa:** `tournaments` tiene RLS activo pero no tenía policy de INSERT para usuarios autenticados.  
**Fix doble:**
1. Migración 0010: agrega policy SELECT pública para `tournaments`, `teams`, `matches`.
2. En `createPolla` server action: usar admin client para crear/leer el torneo (bypassa RLS). Es el patrón correcto porque los torneos son datos de sistema.

### Bug 6: Admin podía activar polla sin seleccionar torneo
**Síntoma:** Botón "Iniciar Polla" estaba habilitado siempre; al clickearlo sin torneo, no importaba nada o fallaba silenciosamente.  
**Fix:** La página de configurar ahora requiere explícitamente un `tournament_id`. El botón de activar está deshabilitado con tooltip explicativo hasta que el admin seleccione un torneo del dropdown.

### Bug 7: Predicción guardada no aparecía en el fixture
**Síntoma:** Usuario guardaba predicción, redirigía al fixture, pero el botón seguía mostrando "Predecir" en vez de su marcador.  
**Causa:** `router.push()` de Next.js mantiene caché de Server Components; el fixture seguía leyendo datos stale.  
**Fix:** Usar `window.location.href = '/pollas/[id]/fixture'` en lugar de `router.push()` tras guardar la predicción. Fuerza recarga completa del Server Component.

### Bug 8: Usuario podía predecir después del cierre usando cliente modificado
**Síntoma:** Alguien con DevTools podía enviar predicción aunque el botón estuviera deshabilitado, porque la validación era solo client-side.  
**Fix:** El Server Action `savePrediction` ahora valida el deadline usando `get_server_time()` (hora del servidor PostgreSQL), no del dispositivo del cliente. Si el plazo cerró, devuelve `{ error: 'El plazo de apuestas ya cerró.' }`.

### Bug 9: "Cargar partidos" se quedaba cargando infinitamente
**Síntoma:** Al apretar "Cargar partidos" con una liga completa (ej: Colombia 2023 = 452 partidos), el botón se quedaba en "Cargando..." para siempre.  
**Causa:** El código hacía ~5 queries a la DB por cada partido (buscar equipo local, visitante, insertar si no existen, insertar partido). Para 452 partidos = ~2260 queries. Timeout.  
**Fix:** Reescritura completa de `loadFixtures` usando **batch inserts**: 1 query para buscar equipos existentes, 1 query para insertar equipos nuevos, 1 query para insertar todos los partidos. Total: 3 queries sin importar cuántos partidos haya. Límite de 500 partidos (`MAX_FIXTURES = 500`).

### Bug 10: Client Component no refrescaba después de server action
**Síntoma:** Después de cargar partidos, la página seguía mostrando los datos viejos. El usuario tenía que refrescar manualmente.  
**Causa:** El `LoadFixturesButton` llamaba la server action pero no ejecutaba `router.refresh()` después. `revalidatePath` en la server action invalida caché pero no fuerza re-render del Client Component.  
**Fix:** Agregar `router.refresh()` en el `finally` del handler del botón, después de que la server action termine.

---

## 6. Estructura de Carpetas Actual (actualizada)

```
golazo/
├── docs/
│   ├── polla_deportiva_diseno.pdf
│   └── MEMORIA_PROYECTO.md             ← Este archivo
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx              ← Protege rutas: sin sesión→login, sin alias→onboarding
│   │   │   ├── actions.ts              ← logout server action
│   │   │   ├── perfil/page.tsx
│   │   │   └── pollas/
│   │   │       ├── page.tsx            ← Lista de pollas del usuario
│   │   │       ├── [id]/
│   │   │       │   ├── page.tsx        ← Detalle + leaderboard con medallas + avatares
│   │   │       │   ├── configurar/
│   │   │       │   │   ├── page.tsx    ← Config de polla (solo admin). Torneo + partidos + iniciar
│   │   │       │   │   └── actions.ts  ← updatePollaSettings, approveMember, rejectMember, selectTournament, loadFixtures, activatePolla
│   │   │       │   ├── fixture/
│   │   │       │   │   └── page.tsx    ← Lista de partidos agrupados por fecha + estado de predicción
│   │   │       │   └── prediccion/
│   │   │       │       ├── [matchId]/
│   │   │       │       │   └── page.tsx ← Formulario de predicción (inputs + comodines)
│   │   │       │       └── actions.ts  ← savePrediction (server-side deadline validation)
│   │   │       ├── nueva/
│   │   │       │   ├── page.tsx
│   │   │       │   └── actions.ts      ← createPolla → redirect a /configurar
│   │   │       └── unirse/
│   │   │           ├── page.tsx
│   │   │           └── actions.ts      ← joinPolla (usa admin client para lookup por código)
│   │   ├── admin/
│   │   │   └── settings/
│   │   │       ├── layout.tsx          ← Verifica is_system_admin, redirige si no
│   │   │       ├── page.tsx            ← Muestra todos los system_settings agrupados por categoría
│   │   │       ├── settings-form.tsx   ← Client Component: textarea JSON por setting + botón Guardar individual
│   │   │       └── actions.ts          ← updateSystemSetting (re-verifica is_system_admin en servidor)
│   │   ├── api/
│   │   │   ├── auth/callback/route.ts  ← Detecta alias, decide redirect
│   │   │   ├── leagues/search/route.ts ← GET /api/leagues/search?q=... Consulta API-Football /leagues
│   │   │   ├── onboarding/route.ts     ← Guarda alias via admin client upsert
│   │   │   ├── sync/route.ts           ← POST protegido por CRON_SECRET. Sync completo: live/overdue/puntos/fixtures
│   │   │   └── webhook/sync/route.ts   ← POST legacy para Mac Mini (usa SUPABASE_SERVICE_ROLE_KEY)
│   │   ├── onboarding/
│   │   │   ├── page.tsx
│   │   │   └── actions.ts              ← (dead code)
│   │   ├── layout.tsx
│   │   ├── page.tsx                    ← Landing page
│   │   └── globals.css
│   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   └── onboarding-form.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── action-buttons.tsx       ← LoadFixturesButton + ActivatePollaButton (loading states)
│   │   │   │   ├── dashboard-header.tsx
│   │   │   │   ├── polla-settings-form.tsx  ← Form completo de config (3 secciones)
│   │   │   │   ├── pending-members-list.tsx ← Lista de miembros pendientes con aprobar/rechazar
│   │   │   │   └── tournament-search.tsx    ← Buscador de torneos con autocompletado + debounce
│   │   │   ├── profile/
│   │   │   │   └── profile-form.tsx         ← Picker de avatares + alias
│   │   │   └── predictions/
│   │   │       └── prediction-form.tsx      ← Client form: inputs de goles + toggles de comodines
│   │   └── ui/
│   │       └── button.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   ├── admin.ts
│   │   │   └── middleware.ts
│   │   ├── settings.ts                      ← getSetting/getAllSettings (cache 1min) + saveSetting + helpers tipados
│   │   ├── rate-limit.ts                    ← checkRateLimit/logApiUsage via RPC check_rate_limit/log_api_usage
│   │   └── sync/
│   │       └── calculate-points.ts          ← Cálculo de puntos + recálculo de total_points
│   ├── services/
│   │   └── api-football.ts                  ← Cliente para API-Football (fixtures, resultados en vivo)
│   └── types/
│       ├── database.ts
│       └── index.ts
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_fix_rls_insert_policies.sql
│       ├── 0003_fix_rls_complete.sql
│       ├── 0004_reset_rls_and_policies.sql
│       ├── 0005_upsert_profile_rpc.sql
│       ├── 0006_storage_avatars.sql
│       ├── 0007_fix_upsert_profile_rpc.sql
│       ├── 0008_grant_table_permissions.sql
│       ├── 0009_fix_all_table_permissions.sql
│       ├── 0010_rls_system_tables.sql
│       ├── 0011_fase1_core_game.sql
│       ├── 0012_add_tournament_country.sql
│       ├── 0013_tournaments_unique_api_season.sql
│       ├── 0014_grant_delete_permissions.sql
│       ├── 0015_special_predictions_points.sql
│       ├── 0016_tournament_special_results.sql
│       ├── 0017_match_penalties.sql
│       ├── 0018_api_rate_limits.sql
│       ├── 0019_cron_optimizations.sql
│       └── 0020_system_settings.sql
├── scripts/
│   └── sync-results.ts
├── public/
│   └── manifest.json
└── ...config files
```

---

## 7. Plan de Desarrollo Priorizado

### Completado ✅
- Fase 0: Supabase, OAuth Google, flujo de auth end-to-end.
- Perfil de usuario: alias al primer login + picker de 40 avatares pixel-art futboleros.
- Crear polla con código único de 6 caracteres → redirige a configurar.
- Unirse a polla con código (fix: admin client para lookup).
- Configurar polla: nombre, estado, cierre de apuestas, auto-aprobar, sistema de puntos, comodines.
- Aprobación/rechazo de miembros pendientes desde la página de configurar.
- Detalle de polla con leaderboard con medallas y avatares.
- UI rediseñada: header deportivo, cards modernas, leaderboard con medallas.
- Login simplificado: Google como botón principal, magic link colapsado como alternativa.
- SMTP configurado: Gmail (devmostrodev@gmail.com) con App Password, puerto 587.
- Invitación por link directo `/pollas/unirse?code=XXXX` con auto-join.
- Predicciones especiales de torneo (6 tipos) con puntos configurables por admin.
- Sincronización progresiva de fixtures para torneos en curso.
- Popup de confirmación antes de iniciar polla.
- Comodines x2/x3 configurables de 0 a 100.
- Fixture con filtros avanzados (búsqueda, año, mes, estado) y múltiples ordenamientos.
- Scoring automático de predicciones especiales (campeón, finalista, stats del torneo).
- Vista de predicciones de todos los jugadores por partido (después del cierre).
- Página `/admin/settings` para editar parámetros del sistema en tiempo real (solo `is_system_admin`).
- Rate limiting configurable por acción (load_fixtures, sync_fixtures, search_leagues, recalculate_points…).
- Migraciones 0016–0020 aplicadas en producción.

### ✅ Fase 1 — Core del juego (COMPLETADA)

#### Principios de resiliencia del sync (implementados)
- **Idempotencia total** — correr el sync N veces produce el mismo resultado que correrlo 1 vez. Nunca suma puntos dos veces.
- **Estado progresivo** — los partidos solo avanzan: `NS → 1H → HT → 2H → FT`. Nunca retroceden en la DB.
- **Catch-up automático** — si el cron estuvo caído horas, la próxima ejecución detecta todos los partidos atrasados y los procesa de una vez.
- **Recálculo idempotente** — flag `points_calculated` en `matches`. Si ya está en `true` con status `FT`, no recalcula. Si quedó en `false` con `FT` por error, la próxima ejecución lo detecta y recalcula.

#### Infraestructura de sync implementada
```
PRIMARY:   cron-job.org → POST /api/sync cada 5 min (24/7 desde la nube)
SECONDARY: Mac Mini → sync-results.ts con node-cron (backup, misma lógica idempotente)
```
Si ambos corren al mismo tiempo: sin conflicto. Si uno falla horas: el otro ya cubrió.

**Nota:** Se eligió **API Route de Next.js** (`/api/sync`) en lugar de **Supabase Edge Function** por simplicidad — misma lógica, mismo entorno de ejecución, misma codebase. Protegido por `CRON_SECRET` en header `Authorization: Bearer`.

#### Lógica del sync (cada llamada a `/api/sync`)
```
1. Consultar DB (NO la API aún):
   ├─ Partidos con status='NS' y scheduled_at en el pasado → ATRASADOS
   ├─ Partidos con status IN ('1H','HT','2H','ET','PEN')  → EN VIVO
   └─ Partidos con status='FT' y points_calculated=false  → CALCULAR PUNTOS

2. Si no hay nada → salir sin llamar a la API (ahorra requests)

3. Llamar a API-Football solo para los partidos que lo necesitan
   ├─ Si API falla/timeout → loguear, salir limpio, próxima ejecución reintenta
   └─ Si responde parcial → solo actualizar los que tienen datos válidos

4. Actualizar matches en DB (respetando progresión de estado)
   └─ Solo si el nuevo status es más avanzado que el actual

5. Para cada partido recién llegado a FT:
   ├─ Calcular puntos (upsert en match_points, nunca doble INSERT)
   ├─ Recalcular polla_members.total_points (SUM de match_points)
   └─ Marcar matches.points_calculated = true
```

#### Frecuencia de consulta a la API (decide el sync)
| Situación detectada en DB | Acción |
|---|---|
| Sin partidos activos ni atrasados | Sale sin llamar a la API |
| Partido en curso | Llama a la API, actualiza marcador |
| Partido terminado sin puntos calculados | Calcula puntos sin llamar a la API |

#### Pasos completados
| Paso | Qué se hizo | Estado |
|------|-------------|--------|
| 1 | Migración `0011`: `match_points`, `points_calculated`, `get_server_time()` | ✅ |
| 2 | Flujo de activación: selección de torneo obligatoria + buscador con autocompletado | ✅ |
| 3 | Import de fixtures desde API-Football con batch inserts (hasta 500 partidos) + fallback a mocks | ✅ |
| 4 | Página de fixtures: agrupados por fecha, estados visuales, botones inteligentes | ✅ |
| 5 | Formulario de predicción + validación server-side con `get_server_time()` | ✅ |
| 6 | Anti-trampa: cada jugador solo ve sus predicciones antes del pitazo | ✅ |
| 7 | API Route `/api/sync` con detección inteligente y catch-up | ✅ |
| 8 | Configurar cron-job.org — **pendiente de configurar en producción** | ⏳ |
| 9 | Cálculo de puntos: sistema configurable + comodines + recálculo de ranking | ✅ |
| 10 | Leaderboard lee `total_points` actualizado automáticamente | ✅ |

### 🟡 Fase 1.5 — Mejoras de experiencia importantes

**Completadas:**
1. ✅ **Mostrar torneo seleccionado permanentemente** — En configurar siempre se ve el torneo actual (logo, país, tipo, season, API ID).
2. ✅ **Mejor manejo de errores de API-Football** — Detecta plan gratuito, muestra warning al admin, cae a mock fixtures.
3. ✅ **Invitación por link directo** — URL `/pollas/unirse?code=XXXXXX` para compartir por WhatsApp sin tipear el código.
4. ✅ **Predicciones especiales de torneo** — 6 tipos, puntos configurables por admin. Guarda en `special_predictions`.

**Pendientes (bloqueantes para MVP):**
5. ✅ **Scoring de predicciones especiales** — Implementado. `calculate-points.ts` ahora procesa `special_predictions` comparando con `tournament_special_results`.
6. ✅ **Vista de partido con predicciones** — Implementado. La página de predicción muestra lista de todas las predicciones cuando el partido cerró.

**Pendientes (no bloqueantes):**
7. ⏳ **Notificaciones push/email** — recordatorio antes del cierre, alerta de resultados. Requiere dominio propio para Resend.
8. ⏳ **Gráfica de evolución del ranking** — línea de tiempo partido a partido.
9. ⏳ **Tests** — carpeta `tests/` vacía.

### 🟢 Fase 2 — Diferenciadores (post-MVP)

1. **Soporte para planes pagos de API-Football** — Permitir seasons actuales (2025+) cuando el usuario tenga plan Pro.
2. **Modo racha y logros/badges** — racha de marcadores exactos, badges de perfil.
3. **Predicción por voz** — Web Speech API para dictar el marcador.
4. **PWA completa** — Service worker, instalable, offline básico.
5. **Dominio propio + Resend** — emails transaccionales con dominio propio.

---

## 8. Convenciones de Código

- **TypeScript estricto** (`strict: true`).
- **Server Components por defecto**; Client Components solo cuando se necesite interactividad (`'use client'`).
- **App Router** obligatorio para todas las rutas.
- **Supabase RLS habilitado** en todas las tablas.
- **Admin client** solo para operaciones de sistema; nunca en Client Components.
- **Navegación post-mutation:** usar `window.location.href` (hard nav) cuando se necesite que el servidor lea datos recién escritos. `router.push()` puede usar caché stale del router.
- **Server Actions** para formularios del dashboard; **API Routes** para el onboarding (necesita respuesta JSON para mostrar errores en el cliente).
- Alias `@/*` apunta a `./src/*`.
- Commits con prefijos: `feat:`, `fix:`, `refactor:`, `docs:`.

---

## 9. Variables de Entorno Críticas

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Necesario para admin client (bypass RLS)

# API Football (RapidAPI)
API_FOOTBALL_KEY=
API_FOOTBALL_HOST=v3.football.api-sports.io

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# App
NEXT_PUBLIC_APP_URL=

# Sync / Cron (protección del endpoint /api/sync)
CRON_SECRET=                        # Token secreto para autenticar llamadas de cron-job.org

# Mac Mini / Sync (backup)
SUPABASE_PROJECT_ID=
SUPABASE_DB_PASSWORD=
```

---

## 10. Patrones y Trampas Conocidas

### No usar `.eq()` después de `.upsert()` en supabase-js v2
```typescript
// MAL — el .eq() filtra de forma inesperada y puede romper el upsert
await supabase.from('profiles').upsert({ id, alias }).eq('id', userId);

// BIEN
await supabase.from('profiles').upsert({ id, alias }, { onConflict: 'id' });
```

### Siempre usar window.location.href para navegar tras guardar datos críticos
```typescript
// MAL — router.push puede usar caché del router y el server component
// lee datos stale (el alias recién guardado no aparece)
router.push('/pollas');

// BIEN — fuerza recarga completa, el servidor lee datos frescos
window.location.href = '/pollas';
```

### Las tablas de sistema usan admin client
```typescript
// MAL — el cliente del usuario falla con RLS en tablas de sistema
const { data } = await supabase.from('tournaments').insert({...});

// BIEN
const admin = createAdminClient();
const { data } = await admin.from('tournaments').insert({...});
```

### Toda tabla nueva creada via SQL necesita GRANT manual
```sql
-- Siempre incluir esto en cada migración que cree tablas nuevas:
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.nueva_tabla TO authenticated, service_role;
GRANT SELECT ON TABLE public.nueva_tabla TO anon;
```

### polla_members no tiene policy UPDATE — usar admin client para aprobar/rechazar
```typescript
// MAL — falla silenciosamente porque no hay policy UPDATE en polla_members
await supabase.from('polla_members').update({ status: 'approved' }).eq('id', memberId);

// BIEN — admin client bypassa RLS
const admin = createAdminClient();
await admin.from('polla_members').update({ status: 'approved' }).eq('id', memberId);
```

### joinPolla debe usar admin client para buscar la polla por código
```typescript
// MAL — el usuario no es miembro aún, RLS bloquea el SELECT y devuelve null
const { data } = await supabase.from('pollas').select('id').eq('code', code).single();

// BIEN
const admin = createAdminClient();
const { data } = await admin.from('pollas').select('id').eq('code', code).single();
```

### Después de guardar perfil usar router.refresh() para actualizar el header
```typescript
// Sin esto, el avatar y alias del header no se actualizan hasta que el usuario navega
router.refresh(); // invalida caché del router y re-fetcha server components
```

### Después de guardar predicción usar window.location.href (no router.push)
```typescript
// MAL — router.push mantiene caché de Server Components, el fixture lee datos stale
router.push(`/pollas/${pollaId}/fixture`);

// BIEN — fuerza recarga completa, el fixture lee predicción recién guardada
window.location.href = `/pollas/${pollaId}/fixture`;
```

### Validar deadlines con get_server_time(), nunca con Date.now() del cliente
```typescript
// MAL — el cliente puede modificar su reloj o retrasar la petición
const clientNow = new Date(); // no confiar

// BIEN — usar hora del servidor PostgreSQL
const { data: nowData } = await supabase.rpc('get_server_time');
const serverNow = new Date(nowData as string);
const deadline = new Date(match.scheduled_at);
deadline.setMinutes(deadline.getMinutes() - polla.bet_deadline_minutes);
if (serverNow >= deadline) return { error: 'El plazo de apuestas ya cerró.' };
```

### Después de una server action desde Client Component, hacer router.refresh()
```typescript
// MAL — revalidatePath en la server action invalida caché pero no fuerza re-render
startTransition(async () => {
  await loadFixtures(pollaId);
  // La UI sigue mostrando datos viejos
});

// BIEN — router.refresh() fuerza re-fetch de Server Components
startTransition(async () => {
  await loadFixtures(pollaId);
  router.refresh(); // ← necesario
});
```

### Batch inserts para operaciones masivas en DB
```typescript
// MAL — una query por fila = timeout con 400+ registros
for (const fixture of fixtures) {
  await admin.from('matches').insert(fixture); // N queries
}

// BIEN — insertar todo en una sola query
await admin.from('matches').insert(fixtures.map(f => ({ ... })));
```

### Siempre verificar el error de upsert/insert en Supabase
```typescript
// MAL — si el upsert falla (ej: CHECK constraint), no se sabe y se devuelve éxito falso
await admin.from('matches').upsert(rows, { onConflict: 'api_football_id' });
return { success: true, count: rows.length }; // MENTIRA si hubo error

// BIEN — verificar error explícitamente
const { error } = await admin.from('matches').upsert(rows, { onConflict: 'api_football_id' });
if (error) return { error: `Error al guardar: ${error.message}` };
return { success: true, count: rows.length };
```

### Status de partidos de API-Football — no asumir los 9 originales
La API devuelve status que el schema original no contemplaba: `PST` (postergado), `TBD`, `ABD`, `AWD`, `WO`, `SUSP`, `INT`, `AET`, `PEN`, `BT`, `LIVE`. Usar siempre `normalizeMatchStatus()` antes de insertar:
```typescript
// En actions.ts
const KNOWN_STATUSES = new Set(['NS','TBD','PST','1H','HT','2H','ET','BT','P','SUSP','INT','FT','AET','PEN','AFT','CANC','ABD','AWD','WO','LIVE']);
function normalizeMatchStatus(s?: string): string {
  if (!s) return 'NS';
  return KNOWN_STATUSES.has(s) ? s : 'NS';
}
```

### DiceBear pixel-art: solo seed + backgroundColor, nada más
```typescript
// MAL — hair[] y beardProbability no son válidos en pixel-art v9, rompen la URL
`https://api.dicebear.com/9.x/pixel-art/svg?seed=X&hair[]=short01&beardProbability=35`

// BIEN
`https://api.dicebear.com/9.x/pixel-art/svg?seed=X&backgroundColor=fef08a`
```

---

## 15. Bugs Corregidos — Sesión 2026-05-05

### Bug A: loadFixtures devuelve éxito pero no inserta nada (Libertadores)
**Síntoma:** Al cargar partidos, el mensaje dice "126 partidos cargados" pero la página sigue mostrando "Tenés que cargar partidos" y no hay ninguno en la DB.
**Causa:** El CHECK constraint original en `matches.status` solo permitía 9 valores: `('NS','1H','HT','2H','ET','P','FT','AFT','CANC')`. La Copa Libertadores (y muchos otros torneos) tiene partidos con status `PST` (postponed), `TBD`, `ABD`, `WO`, etc. El upsert fallaba con constraint violation para cualquier fixture con status desconocido. **El código no verificaba el error del upsert**, así que devolvía `{ success: true, fixturesImported: 126 }` contando el array de entrada, no las filas realmente insertadas.
**Fix en código:** `normalizeMatchStatus()` mapea status desconocidos a `NS` como fallback. Se agrega `const { error: upsertError } = await admin.from('matches').upsert(...)` y se verifica el error antes de continuar.
**Fix en DB:** Migración `0023_expand_match_status.sql` — expande el CHECK para incluir todos los status conocidos de API-Football. **⚠️ Pendiente aplicar en Supabase SQL Editor.**
**Regla aprendida:** Siempre verificar el error de operaciones de escritura en Supabase. No asumir que si no hay excepción, la operación funcionó.

### Bug B: ps() y sps() cruzados en polla-settings-form (puntos no se guardaban)
**Síntoma:** Al guardar configuración de puntos desde la página de configurar, los valores se mezclaban entre `point_system` y `special_point_system`.
**Causa:** En `POINT_FIELDS` (predicciones de partido) se usaba `sps()` que lee `special_point_system`, y en `SPECIAL_PREDICTION_FIELDS` se usaba `ps()` que lee `point_system`. Estaban completamente invertidas.
**Fix:** `POINT_FIELDS` usa `ps(polla, f.key, f.defaultVal)`, `SPECIAL_PREDICTION_FIELDS` usa `sps(polla, f.key, f.defaultVal)`.

### Bug C: Miembros no ven el ranking de otros jugadores
**Síntoma:** Un usuario que es miembro (no admin) entra a la polla y ve el leaderboard vacío o solo con su propio nombre.
**Causa:** La RLS policy "Users can view own memberships" en `polla_members` solo permitía `user_id = auth.uid() OR is_polla_admin(polla_id)` — cada miembro solo veía su propia fila.
**Fix:** Workaround inmediato: usar admin client para la query del leaderboard en `/pollas/[id]/page.tsx` (ya verificamos que el usuario tiene acceso antes de ejecutarla). Fix permanente: migración 0021 cambia la policy a `is_polla_member(polla_id) OR is_polla_admin(polla_id)` para que cualquier miembro aprobado pueda ver todos los miembros de sus pollas.

### Bug D: syncFixtures no actualizaba resultados existentes
**Síntoma:** Al sincronizar, se agregaban partidos nuevos pero los goles de partidos ya terminados no se actualizaban en la DB.
**Causa:** La función solo filtraba `newFixtures` (los que no existían) y los insertaba. Los fixtures existentes en la DB se ignoraban por completo.
**Fix:** Reescritura de `syncFixtures` para separar en `newFixtures` (insertar) y `fixturesToUpdate` (actualizar status y goles si la API tiene un estado terminal o en vivo que el registro en DB no tiene). Retorna mensaje detallado: "X nuevos, Y actualizados".

### Bug E: Auth redirect a localhost con magic link / Google OAuth
**Síntoma:** Al hacer login con magic link o Google, el email/redirect apuntaba a `http://localhost:3001/...`.
**Causa:** `NEXT_PUBLIC_APP_URL=http://localhost:3001` estaba seteado en Vercel (copiado de `.env.local`). El código usaba `process.env.NEXT_PUBLIC_APP_URL || window.location.origin` — como la variable era truthy (aunque incorrecta), nunca caía al fallback.
**Fix:** Se cambió a usar solo `window.location.origin` para construir el callback URL. Siempre correcto en el browser independientemente de las env vars.

---

## 16. UX Improvements — Sesión 2026-05-05

### Fixture card — tarjeta completa clickeable
- **Antes:** Solo el botón pequeño "Predecir" / "2-1" era clickeable.
- **Ahora:** Toda la tarjeta (`<Link>` wrappea el grid completo). Los inner Buttons se reemplazaron por `<span>` badges visuales (sin link anidado — HTML inválido).
- El badge de predicción muestra la misma info: marcador con ícono lápiz/ojo, wildcard, "Predecir", "Cerrado".
- `hover:bg-accent/50 active:scale-[0.99]` para feedback táctil.

### Prediction detail page — fecha, hora y round
- Se agregó bloque de fecha/hora/jornada encima del display de equipos:
  ```
  ┌─────────────────────────────┐
  │  miércoles, 7 de mayo       │
  │  21:00hs                    │
  │  Fecha 3                    │
  └─────────────────────────────┘
  ```
- Funciones `formatMatchDate()` y `formatMatchTime()` con locale `es-ES`.
- Equipos ahora tienen `w-[110px]` para evitar que los nombres largos se desborden.

### Polla list — badges y filtros
- Cards ahora muestran badge "Admin" (ámbar) o "Jugador" (azul) según el rol del usuario en esa polla.
- Fecha de creación visible en cada card.
- Nuevo componente `PollaListFilters` (client-side) con filtros por rol (todas / soy admin / soy jugador) y por estado (active / open / finished / draft).
- Lista ordenada por `created_at DESC`.

### Tournament search — auto-confirmar
- **Antes:** Al seleccionar un torneo del buscador, aparecía pantalla intermedia con selector de temporada y botón "Confirmar selección".
- **Ahora:** Al clickear un torneo, se selecciona la temporada actual (o la más reciente disponible) y se guarda inmediatamente, sin pantalla intermedia.
- Si el torneo no tiene seasons disponibles, no hace nada (previene guardar datos inválidos).

### Prediction form — inputs mejorados
- Botones `<Minus>` y `<Plus>` flanqueando el input numérico.
- `onFocus → e.target.select()` para limpiar el 0 al empezar a tipear.
- `inputMode="numeric"` para mostrar teclado numérico en móvil.
- `active:scale-95` para feedback táctil en los botones.
- Botón `-` deshabilitado en 0, botón `+` deshabilitado en 20.

---

## 17. Pendientes Críticos (requieren acción manual en Supabase)

### Migraciones pendientes de aplicar en producción
Ir a Supabase SQL Editor y ejecutar en orden:

**0021 — Fix RLS polla_members SELECT:**
```sql
DROP POLICY IF EXISTS "Users can view own memberships" ON public.polla_members;
CREATE POLICY "Members can view all members of their pollas"
  ON public.polla_members FOR SELECT USING (
    public.is_polla_member(polla_id) OR public.is_polla_admin(polla_id)
  );
```

**0022 — Agregar email a profiles:**
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE p.id = u.id AND p.email IS NULL;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, alias, avatar_url, email)
  VALUES (NEW.id, NULL, NULL, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**0023 — Expandir CHECK de matches.status (CRÍTICO para cargar fixtures):**
```sql
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('NS','TBD','PST','1H','HT','2H','ET','BT','P','SUSP','INT','FT','AET','PEN','AFT','CANC','ABD','AWD','WO','LIVE'));
```

Los archivos `.sql` completos están en `/supabase/migrations/`.

---

## 13. Sistema de Settings y Rate Limiting

### system_settings — parámetros del sistema editables en caliente

La tabla `system_settings` permite editar parámetros operativos sin redesplegar la app. El admin del sistema (campo `profiles.is_system_admin = true`) accede vía `/admin/settings`.

**Categorías y valores:**
| Key | Categoría | Default | Qué controla |
|-----|-----------|---------|-------------|
| `rate_limit_load_fixtures` | rate_limit | `{"maxCount": 5, "intervalMinutes": 60}` | Cargas de fixtures por usuario/hora |
| `rate_limit_sync_fixtures` | rate_limit | `{"maxCount": 10, "intervalMinutes": 60}` | Sincronizaciones por usuario/hora |
| `rate_limit_search_leagues` | rate_limit | `{"maxCount": 20, "intervalMinutes": 10}` | Búsquedas de ligas por IP/10min |
| `rate_limit_get_rounds` | rate_limit | `{"maxCount": 10, "intervalMinutes": 60}` | Consultas de rounds por IP/hora |
| `rate_limit_recalculate_points` | rate_limit | `{"maxCount": 10, "intervalMinutes": 10}` | Recálculos por usuario/10min |
| `max_pollas_per_user` | game | `{"value": 10}` | Pollas que puede crear un usuario |
| `max_fixtures_load` | game | `{"value": 500}` | Partidos máximos por carga de la API |
| `cron_sync_interval_minutes` | cron | `{"value": 2}` | Frecuencia del cron (informativo) |
| `cron_fixture_sync_interval_hours` | cron | `{"value": 6}` | Intervalo entre auto-syncs de fixtures |
| `api_football_daily_limit` | api | `{"value": 7500}` | Límite diario de requests a la API |

**Cache:** `lib/settings.ts` cachea en memoria por 1 minuto. Después de guardar, `invalidateSettingsCache()` fuerza reload.

**Seguridad:** La server action `updateSystemSetting` verifica `is_system_admin` en el servidor, independientemente del layout. Doble check: layout + action.

### Rate limiting — cómo funciona

El rate limiting usa la tabla `api_usage_logs` y dos RPCs SECURITY DEFINER:
- `check_rate_limit(identifier, action, maxCount, intervalMinutes)` → `BOOLEAN`
- `log_api_usage(identifier, action, userId, metadata)` → `VOID`

**Identificador:** `user_id` para acciones autenticadas, `ip_` + IP para rutas públicas.

**Flujo en una acción:**
```typescript
const { allowed, retryAfterMinutes } = await checkRateLimit(userId, 'load_fixtures');
if (!allowed) return { error: `Límite alcanzado. Reintentá en ${retryAfterMinutes} min.` };
// ... ejecutar acción
await logApiUsage(userId, 'load_fixtures', userId);
```

### Dar permisos de admin del sistema
Para darle `is_system_admin = true` a un usuario, ejecutar en Supabase SQL Editor:
```sql
UPDATE profiles SET is_system_admin = true WHERE id = 'UUID_DEL_USUARIO';
```

---

## 14. Fixture List — Funcionalidades Visuales

La página de fixtures (`/pollas/[id]/fixture`) usa el Client Component `FixtureList` con:

### Contadores de resumen (fila de 4 chips)
- Total partidos del torneo
- Cerrados (plazo vencido)
- Sin predicción (abiertos sin predecir) — en rojo/ámbar como urgente
- Predichos — en verde

### Filtros
- **Barra de búsqueda:** por nombre de equipo, botón X para limpiar
- **Pills de estado:** Todos / Por predecir / Sin predicción / Predicho / Cerrado — toggle, se deselecciona al clickear el mismo
- **"Más filtros" (expandible):** año y mes. Muestra badge con cantidad de filtros activos de año/mes
- **Botón "Limpiar":** aparece solo cuando hay filtros activos
- **Ordenamiento:** Fecha ↑ / Fecha ↓ / Equipo / Fase — select dropdown

### Comportamiento
- Filtros sincronizados con URL query params (`?q=`, `?status=`, `?year=`, `?month=`, `?sort=`, `?showFilters=1`) — al volver de predicción, el filtro se restaura.
- Scroll position guardado en `sessionStorage` key `fixtureScrollY`, restaurado al montar el componente.
- Cuando se ordena por fecha: partidos agrupados bajo header de fecha. Con otros ordenamientos: lista plana.

### Cards de partido
- **Toda la tarjeta es un `<Link>`** — clickear en cualquier parte navega a la predicción del partido. `hover:bg-accent/50 active:scale-[0.99]` para feedback.
- Grid 3 columnas: equipo local | marcador/vs + hora + fase + badge | equipo visitante
- Logos de equipos (de API-Football)
- Marcador en **negrita** para partidos terminados o en vivo
- Penales: `(P) X - Y` debajo del marcador regular
- Winner highlighting en verde, empate en ámbar
- Badge `EN VIVO` en rojo para partidos en curso
- Badge visual de predicción (no es botón interactivo — la navegación la maneja el Link externo):
  - Sin predicción + abierto: "Predecir" (dark green span)
  - Con predicción + abierto: marcador predicho en verde con ícono lápiz
  - Con predicción + cerrado: marcador predicho en outline con ícono ojo
  - Sin predicción + cerrado: badge "Cerrado" (muted)
  - Badge X2/X3 en ámbar/púrpura si se usó comodín

---

## 13. API-Football — Limitaciones del Plan Gratuito

### Qué SÍ funciona en free plan
| Endpoint | Parámetros disponibles | Ejemplo |
|---|---|---|
| `/countries` | Sin filtros | 171 países |
| `/leagues` | `search`, `country`, `type`, `current`, `season` | 1,200+ ligas |
| `/leagues?current=true` | Sin filtros adicionales | 1,223 ligas activas |
| `/fixtures?league=X&season=YYYY` | `league` + `season` (2022-2024) | Fixtures completos de temporada |
| `/fixtures?date=YYYY-MM-DD` | `date` sin `league` | Partidos globales de ese día |

### Qué NO funciona en free plan
| Feature | Error típico |
|---|---|
| Fixtures de season 2025+ | `Free plans do not have access to this season, try from 2022 to 2024.` |
| Parámetro `last=N` | `Free plans do not have access to the Last parameter.` |
| Parámetro `next=N` | `Free plans do not have access to the Last parameter.` |
| Odds en vivo | Requiere plan Pro |
| Estadísticas históricas profundas | Requiere plan Pro |

### Estrategia para desarrollo
- **Para pruebas con datos reales:** usar temporadas **2022-2024** de ligas latinoamericanas (Colombia, Chile, Brasil, etc.).
- **Para el Mundial 2026:** en producción se necesitará plan Pro ($19/mes) o los fixtures se cargarán manualmente/parcialmente.
- **Límite de requests:** 100 requests/día. El buscador de torneos consume 1 request por búsqueda. Cargar fixtures de una liga consume 1 request.

### Temporadas disponibles probadas
| Liga | ID | Temporadas en free |
|---|---|---|
| Colombia Primera A | 239 | 2022, 2023, 2024 |
| Brasil Serie A | 71 | 2022, 2023, 2024 |
| Chile Primera División | 265 | 2022, 2023, 2024 |
| Perú Liga 1 | 281 | 2022, 2023, 2024 |
| México Liga MX | 262 | 2022, 2023, 2024 |
| Ecuador Liga Pro | 242 | 2022, 2023, 2024 |

---

## 11. Configuración SMTP y Email

### Método principal: Google OAuth
- Un click, sin contraseñas, sin emails.
- Es lo que usan el 99% de los usuarios.
- Magic link queda colapsado en el login como alternativa para quien no tenga Google.
- Email/contraseña fue **eliminado** — causaba errores confusos y requería SMTP bien configurado.

### SMTP configurado: Gmail
- **Cuenta:** devmostrodev@gmail.com
- **Host:** smtp.gmail.com — **Port: 587**
- **Username:** devmostrodev@gmail.com
- **Password:** App Password de Google (no la contraseña normal de Gmail)
  - Se genera en: myaccount.google.com/apppasswords
  - Requiere 2FA activo en la cuenta (ya está activo)
  - Copiar **sin espacios** — Gmail la muestra como `xxxx xxxx xxxx xxxx` pero va sin espacios
- **Sender name:** Golazo
- Se configura en: Supabase → Authentication → Settings → Enable Custom SMTP

### Errores comunes de SMTP y sus causas
| Error | Causa | Fix |
|-------|-------|-----|
| `429 Too Many Requests` | Rate limit de Supabase (4 emails/hora en plan gratis) | Esperar 1 hora o usar SMTP custom |
| `500 Internal Server Error` | Credenciales SMTP incorrectas | Verificar app password sin espacios, port 587 |
| Se queda "Enviando..." sin error | Puerto incorrecto (ej: 583) | Cambiar a 587 |

### Futuro: migrar a Resend con dominio propio
Cuando haya dominio propio (ej: golazo.app):
- Crear cuenta en resend.com → verificar dominio → obtener API key
- RESEND_API_KEY ya está en .env.local esperando
- Host: smtp.resend.com / Port: 465 / Username: resend / Password: re_xxxxx
- Sender: noreply@golazo.app

---

## 12. Perfil del Desarrollador y Preferencias de Trabajo

- Desarrollador solo, trabajando en Golazo como proyecto personal.
- Prefiere respuestas **cortas y directas** — sin tutoriales innecesarios.
- Quiere ver el **error exacto** antes de recibir un fix (screenshot de consola siempre ayuda).
- Diseño: **moderno, deportivo, amigable** — no minimalismo genérico. Header dark green, cards con sombra, elementos redondeados.
- Sin dominio propio ni servicios pagos — trabaja con herramientas 100% gratuitas.
- Gmail de desarrollo: devmostrodev@gmail.com

### Señales de alerta en debugging
- "No pasa nada" al hacer click en un form → sospechar de redirect loop silencioso.
- El form "parece funcionar" pero el usuario vuelve al mismo lugar → el dato no se guardó.
- Error invisible → revisar Network tab del browser para ver el status code real (429, 500, etc.).


## CONFIGURACIÓN DE POLLA — DETALLE COMPLETO

### Campos configurables (todos editables antes de iniciar, torneo se bloquea al iniciar)

**Torneo seleccionado**
- Se elige de lista traída desde API-Football
- Al dar "Iniciar polla" se escribe `locked = true` en base de datos
- No hay UI para cambiarlo después, ni el admin puede hacerlo

**Nombre de la polla**
- Texto libre, máximo 40 caracteres
- Sí editable después de iniciada la polla

**Tiempo límite para apostar**
- Opciones: 30 min, 1 hora, 2 horas, 6 horas, 24 horas antes del partido
- Default: 1 hora antes
- CRÍTICO: siempre se compara contra timestamp del servidor (Supabase), nunca del dispositivo del cliente

**Aprobación automática de jugadores**
- Toggle on/off
- Default: off (el admin aprueba manualmente cada jugador)

---

### Sistema de puntos — valores configurables con defaults

Todos los valores son configurables por el admin antes de iniciar la polla.
Después de iniciada la polla los valores quedan bloqueados.

| Evento | Puntos default | Rango permitido |
|---|---|---|
| Resultado correcto (gana / empata / pierde) | 1 pt | 0–100 |
| Goles equipo local exactos | 1 pt | 0–100 |
| Goles equipo visitante exactos | 1 pt | 0–100 |
| Marcador exacto (ej. 2-1) | 3 pts | 0–100 |
| Diferencia de goles exacta | 1 pt | 0–100 |
| Total de goles del partido exacto | 1 pt | 0–100 |
| Equipo clasificado fase de grupos | 2 pts | 0–100 |
| Cuartofinalistas correctos (cada uno) | 2 pts | 0–100 |
| Semifinalistas correctos (cada uno) | 3 pts | 0–100 |
| Finalista correcto | 5 pts | 0–100 |
| Tercer lugar correcto | 3 pts | 0–100 |
| Campeón del torneo (predicción inicial) | 10 pts | 0–100 |

**Nota:** El rango máximo es 100 — el admin decide libremente los valores. No hay tope fijo.

**Regla de acumulación de puntos (IMPORTANTE):**
Los puntos son acumulables entre sí. Ejemplo: si alguien acierta el marcador exacto 2-1, gana:
- Resultado correcto: +1
- Goles local exactos: +1
- Goles visitante exactos: +1
- Marcador exacto: +3
- Diferencia de goles exacta: +1
- Total de goles exacto: +1
- **Total: 8 puntos base** (antes de comodín)

---

### Sistema de comodines — detalle completo

El admin define al crear la polla cuántos comodines tiene cada jugador.

**Configuración:**
- Número de comodines x2: default 2, rango permitido 0–5
- Número de comodines x3: default 1, rango permitido 0–3

**Reglas de uso:**
- El jugador activa el comodín antes del cierre de apuestas del partido
- NO se puede activar una vez iniciado el partido
- El multiplicador aplica sobre el TOTAL de puntos acumulados en ese partido (incluyendo todas las acumulaciones)
- Si el jugador no gana ningún punto en ese partido, el comodín se consume y se pierde igual (esto es intencional para hacer el juego más estratégico)
- Cada jugador solo puede usar un comodín por partido
- Se muestra un ícono especial en el fixture para partidos donde se usó comodín, visible para todos después del pitazo inicial

---

## AVATARES DE PERFIL

### Implementación actual
- **Librería:** DiceBear pixel-art (`https://api.dicebear.com/9.x/pixel-art/svg`)
- **Cantidad:** 40 avatares predefinidos con seeds futboleros
- **Almacenamiento:** URL completa de DiceBear guardada en `profiles.avatar_url`
- **Sin upload de imágenes** — solo se guarda la URL, no hay archivos en Storage

### Categorías y seeds
| Categoría | Fondo | Seeds |
|---|---|---|
| Jugadores famosos | Amarillo `fef08a` | Messi, Ronaldo, Mbappe, Vinicius, Neymar, James, Falcao, Higuita, Valderrama, Suarez |
| Posiciones | Verde `bbf7d0` | Goalkeeper, Striker, Midfielder, Defender, Winger, Libero, Sweeper, Playmaker, Targetman, Captain |
| Términos de juego | Azul `bae6fd` | Corner, Penalty, FreeKick, Header, Volley, Dribble, Tackle, Assist, Hattrick, Offside |
| Roles del Mundial | Rojo `fecaca` | GoldenBoot, GoldenGlove, Champion, Finalist, TopScorer, Coach, Referee, Legend, Fan, Icon |

### URL correcta para DiceBear pixel-art v9
```
https://api.dicebear.com/9.x/pixel-art/svg?seed=SEED&backgroundColor=COLOR_HEX
```
⚠️ NO agregar `hair[]`, `beardProbability` ni otros params — rompen la URL en esta versión.

### Dónde se muestra el avatar
- Header del dashboard (esquina superior derecha junto al alias)
- Leaderboard de cada polla (al lado del alias en cada fila)
- Página de perfil (grande, encima del picker)

### Flujo de selección
1. Usuario entra a `/perfil`
2. Toca "Elegir avatar" → se despliega grilla de 8 columnas con los 40 avatares
3. Toca uno → se cierra la grilla y el avatar grande se actualiza al instante (estado local)
4. Guarda → se escribe la URL en `profiles.avatar_url` + `router.refresh()` actualiza el header

---

## PREDICCIONES ESPECIALES DE TORNEO

- Se hacen UNA SOLA VEZ antes del primer partido del torneo
- No hay segunda oportunidad ni modificación posterior
- Se validan automáticamente al final de cada fase

| Predicción | Puntos | Cuándo se valida |
|---|---|---|
| Campeón del torneo | 10 pts | Final del torneo |
| Finalista (subcampeón) | 5 pts | Final del torneo |
| Tercer lugar | 3 pts | Final del torneo |
| Equipos clasificados de cada grupo (c/u) | 2 pts | Final fase de grupos |
| Equipos en cuartos de final (c/u) | 2 pts | Final octavos |
| Equipos en semifinales (c/u) | 3 pts | Final cuartos |
| Máximo goleador | TBD fase 2 | Final del torneo |

---
## CAMBIOS RECIENTES (Abril 2026)

### 1. Filtrado por rondas (Apertura/Clausura)
**Problema:** Ligas latinoamericanas (Colombia, Chile, etc.) dividen la temporada en Apertura y Clausura. API-Football devuelve rondas como `Apertura - 1`, `Clausura - 1`. Sin filtrado, se cargan todos los partidos mezclados.

**Solución implementada:**
- Endpoint `/api/fixtures/rounds?league=X&season=Y` — consulta API-Football y devuelve `{ rounds: string[] }`
- Componente `RoundFilter` — selector de rondas con checkboxes, se muestra entre búsqueda de torneo y carga de partidos
- `loadFixtures` ahora acepta array de rondas seleccionadas: `loadFixtures(pollaId: string, rounds?: string[])`
- El servicio `getFixtures` ya soporta parámetro `round` en API-Football

**Flujo actualizado:**
1. Admin selecciona liga + temporada en `TournamentSearch`
2. Si la liga tiene rondas disponibles, aparece `RoundFilter` con lista de checkboxes
3. Admin selecciona las rondas deseadas (ej: solo "Apertura - 1" a "Apertura - 10")
4. "Cargar partidos" usa las rondas seleccionadas como filtro

### 2. Eliminación de pollas
**Problema:** No había forma de eliminar una polla creada por error.

**Solución implementada:**
- Server action `deletePolla(pollaId: string)` en `actions.ts` — verifica que el usuario sea admin
- Componente `DeletePollaButton` en lista de pollas — con diálogo de confirmación
- Limpieza de datos relacionados: se eliminan `polla_members`, `predictions`, y la polla misma
- Solo visible para pollas donde el usuario es admin

### 3. Fix CRÍTICO: UNIQUE constraint en tournaments
**Problema:** `tournaments.api_football_id` tenía `UNIQUE`, impidiendo que la misma liga tuviera múltiples temporadas. Al cambiar de temporada, se sobrescribía el mismo registro y los partidos antiguos persistían.

**Fix:**
- Migración `0013_tournaments_unique_api_season.sql`: reemplaza UNIQUE simple por compuesto `(api_football_id, season)`
- `selectTournament` ahora usa `.match({ api_football_id, season })` para upsert
- Cada combinación liga+temporada crea un registro único

### 4. Batch inserts para fixtures
**Problema:** Cargar ~452 partidos con inserciones individuales (~2260 queries) causaba carga infinita y timeout.

**Solución:**
- 3 queries totales para cualquier cantidad de fixtures:
  1. `SELECT id, api_football_id FROM teams WHERE api_football_id IN (...)` — equipos existentes
  2. `INSERT INTO teams` — equipos nuevos en batch
  3. `INSERT INTO matches` — todos los partidos en batch
- `MAX_FIXTURES` aumentado a 500 (era 50)

### 5. Patrón de refresh post-action
**Problema:** `revalidatePath` solo re-renderiza Server Components. Los Client Components que llaman server actions no se actualizan automáticamente.

**Patrón establecido:**
```typescript
startTransition(async () => {
  await serverAction(data);
  router.refresh(); // ← siempre después de server action desde Client Component
});
```

### 6. Upgrade a API-Football Pro
- Plan gratis solo permite temporadas 2022–2024
- Plan Pro desbloquea 2025/2026
- La app detecta `apiData.errors?.plan` y cae a mock fixtures con warning
- Ya se tiene acceso a datos Colombia 2026, Argentina 2025, etc.

### 7. Permisos de service_role
- Se agregó `GRANT DELETE ON public.matches TO service_role;` manualmente en SQL Editor
- Necesario para que `loadFixtures` pueda eliminar partidos antiguos antes de recargar

---

## CAMBIOS SESIÓN ACTUAL (Abril 2026)

### 1. Fix: Borrar polla
**Problema:** `deletePolla` usaba `createClient()` (RLS) sin permisos DELETE en `pollas` para `service_role`.

**Fix:**
- Cambiado a `createAdminClient()` en `src/app/(dashboard)/pollas/actions.ts`
- Limpieza manual previa: `predictions`, `special_predictions`, `match_points`, `ranking_history`, `polla_members`
- Cliente (`PollaCard`) ahora maneja errores con `alert()`
- Nueva migración `0014_grant_delete_permissions.sql`:
  ```sql
  GRANT DELETE ON TABLE public.pollas TO service_role;
  GRANT DELETE ON TABLE public.polla_members TO service_role;
  GRANT DELETE ON TABLE public.match_points TO service_role;
  GRANT DELETE ON TABLE public.ranking_history TO service_role;
  ```

### 2. Fix: Round filter en LoadFixturesButton
**Problema:** El modal de rondas se abría al hacer clic en "Cargar partidos", pero si la API devolvía error o array vacío, el flujo se trancaba.

**Fix:**
- Si hay rondas → abre modal con checkboxes
- Si no hay rondas (array vacío) → carga todos los partidos directamente
- Si hay error del endpoint → carga todos igual, mostrando warning
- Agregados botones **"Marcar todas"** / **"Desmarcar"** en el modal

### 3. Feedback al guardar configuración
**Problema:** El banner verde aparecía al principio del formulario (que está al final de la página) y desaparecía en 3 segundos.

**Fix:**
- Convertido a **toast fijo** (`position: fixed; top: 4`) con fondo verde sólido + texto blanco
- Scroll automático al tope (`window.scrollTo({ top: 0 })`)
- Duración aumentada a 5 segundos

### 4. Indicador de comodín en fixture
**Problema:** No se veía si una predicción usaba comodín (x2/x3) desde la lista de partidos.

**Fix:**
- Query de predicciones en fixture ahora trae `wildcard_used`
- Badge de color en el botón del partido: ámbar `x2` o púrpura `x3`

### 5. FIFA World Cup 2026 — búsqueda
**Problema:** La API-Football busca en inglés. "mundial" no devolvía nada. "world cup" devolvía 18 resultados y el principal se perdía.

**Fix:**
- **Traducción automática** en `/api/leagues/search`: términos español → inglés (`mundial` → `world cup`, `champions` → `champions league`, etc.)
- **Botones de torneos populares** en `TournamentSearch`: Mundial, Copa América, Champions, Premier, La Liga, Bundesliga, Serie A, Libertadores, Sudamericana, Europa League
- **Ordenamiento inteligente**: el torneo con nombre exacto aparece primero (ej: "World Cup" antes que "World Cup - Qualification Europe")

### 6. Sync fixtures para pollas activas
**Problema:** Torneos como el Mundial definen eliminatorias progresivamente. La polla ya está activa, pero faltan partidos. `loadFixtures` borra todo e inserta de nuevo, lo cual es peligroso porque `predictions` y `match_points` tienen `ON DELETE CASCADE` en `match_id`.

**Fix:**
- Nueva server action `syncFixtures(pollaId, selectedRounds?)` en `actions.ts`
- Consulta partidos existentes por `api_football_id`
- **Solo inserta los nuevos** (filtra los que ya existen)
- Nunca borra nada
- Sección "Sincronizar partidos" visible en configurar cuando la polla está `active`
- Botón `LoadFixturesButton` reutilizado, con feedback de éxito (verde) para mensajes tipo "Se agregaron 16 partidos nuevos"

### 7. Fix: Campos desbloqueándose al guardar en polla activa
**Problema:** Al guardar cambios en una polla activa, los campos bloqueados (sistema de puntos, comodines) se habilitaban visualmente.

**Causa raíz:** El `status` del formulario podía enviarse como `draft`/`open`, haciendo que `isLocked` pasara a `false`.

**Fix en 3 capas:**
1. **Servidor** (`updatePollaSettings`): protección contra rebajar status — si la polla está locked y el form envía `draft`/`open`, se fuerza `status = polla.status`
2. **Cliente** (`PollaSettingsForm`): select de status ahora tiene `disabled={isLocked}`
3. **Re-mount forzado**: `<PollaSettingsForm key={polla.status} />` — cuando cambia el status, React desmonta y vuelve a montar el componente, sincronizando todos los `defaultValue`

### 8. Fix: "Estado inválido" al guardar con select disabled
**Problema:** El select disabled no se envía en `FormData`, entonces `status` llegaba `null` al servidor.

**Fix:** El `<select>` ya no tiene `name="status"`. Se agregó `<input type="hidden" name="status" defaultValue={polla.status} />` que siempre envía el valor correcto.

### 9. FixtureList — filtros y ordenamiento
Nuevo componente Client (`src/components/features/dashboard/fixture-list.tsx`) que reemplaza el render estático de la página de fixture.

**Filtros:**
- **Búsqueda por equipo**: filtra dinámicamente por nombre (local o visitante)
- **Año**: select con años disponibles en los partidos
- **Mes**: select con meses disponibles
- **Estado**: Todos / Por predecir / Cerrado / Sin predicción / Predicho

**Ordenamiento:**
- Fecha ascendente (default, agrupada por día)
- Fecha descendente (agrupada por día)
- Equipo (lista plana, alfabético)
- Fase/Round (lista plana, alfabético)

**UI:**
- Botón "Filtros" expandible con badge de cantidad activa
- Botón "Limpiar" para resetear todos
- Contador: "Mostrando X de Y partidos"

### 10. Fix: texto superpuesto en select de ordenamiento
**Fix:** Agregado `pr-6` (padding-right) al select para evitar que el texto choque con la flecha nativa del navegador.

---

## CAMBIOS SESIÓN ABRIL 2026 (continuación)

### 1. Fix: Invitación por link directo + OAuth pierde el código
**Problema:** Usuario no logueado clickea `/pollas/unirse?code=XXXX`, hace login con Google, el callback redirige a `/pollas` perdiendo el código. Nunca se une.

**Fix en 4 capas:**
1. **Middleware** (`src/middleware.ts`): cuando un usuario no autenticado accede a ruta protegida (`/pollas/*`, `/perfil`, `/onboarding`), guarda la URL completa en cookie `redirect_to` y redirige a `/login`.
2. **Página de login** (`src/app/(auth)/login/page.tsx`): lee la cookie `redirect_to` y la pasa al `LoginForm` como prop.
3. **LoginForm** (`src/components/features/auth/login-form.tsx`): recibe `redirectTo` y lo incluye como query param en el callback URL de OAuth y magic links: `/api/auth/callback?redirectTo=/pollas/unirse%3Fcode%3DXXXX`.
4. **OAuth callback** (`src/app/api/auth/callback/route.ts`): lee `redirectTo` del query string (primera prioridad) o de la cookie `redirect_to` (fallback). Valida que sea path relativo (previene open redirects). Redirige al destino original post-login.

### 2. Fix: PendingMembersList — solicitudes no aparecen sin refrescar
**Problema:** Al entrar a configurar, las solicitudes pendientes no aparecían hasta dar F5. Next.js cacheaba el Server Component en navegación client-side.

**Fix en 3 capas:**
1. `export const dynamic = 'force-dynamic'` en `src/app/(dashboard)/pollas/[id]/configurar/page.tsx` para evitar cache estático.
2. Nueva server action `getPendingMembers(pollaId)` en `actions.ts`.
3. `PendingMembersList` ahora tiene `useEffect` que llama `getPendingMembers` al montar, actualizando el estado local con datos frescos.

### 3. Fix: Hydration error en PendingMembersList
**Problema:** `toLocaleDateString('es-AR')` produce output diferente en servidor vs cliente.
**Fix:** Cambiado a `'es-ES'`.

### 4. Feature: Popup de confirmación antes de iniciar polla
**Problema:** El admin podía iniciar la polla accidentalmente sin revisar la configuración.

**Fix:**
- `ActivatePollaButton` ahora es `type="button"` y maneja un modal de confirmación.
- Modal con icono de advertencia y mensaje: "Una vez iniciada, la polla queda activa y no se podrá modificar la configuración de puntos."
- Mensaje destacado en ámbar: "Recordá: si hiciste cambios en la configuración, primero tenés que guardarlos con el botón 'Guardar cambios' antes de iniciar la polla."
- Botón "Cancelar" cierra el popup. Botón "Confirmar e iniciar" llama a `activatePolla(pollaId)`.
- El `<form action={activatePollaAction}>` se reemplazó por un `<div>` simple.

### 5. Feature: Límites de comodines ampliados a 0–100
**Problema:** Los comodines x2 y x3 estaban limitados a 5 y 3 respectivamente. El usuario quería más flexibilidad.

**Fix:**
- `PollaSettingsForm`: `max={5}` → `max={100}` para x2, `max={3}` → `max={100}` para x3. Textos de rango actualizados.
- Server action `updatePollaSettings`: `clamp(formData, 'wc_x2', 0, 100)` y `clamp(formData, 'wc_x3', 0, 100)`.

---

## ANÁLISIS DE ESTADO — ¿DEPLOYAR O SEGUIR DESARROLLANDO?

### ✅ Lo que funciona (core sólido)
- Auth, onboarding, perfiles con avatares
- Crear/eliminar/unirse a pollas (código + link directo)
- Configurar polla: puntos, comodines, predicciones especiales
- Aprobación de miembros
- Selección de torneo + carga de fixtures + sync progresivo de partidos nuevos
- Predicciones de partidos con comodines x2/x3
- Anti-trampa (deadline validado server-side)
- Fixture con filtros, búsqueda, ordenamiento
- Leaderboard con avatares y medallas
- Cálculo automático de puntos + recálculo de ranking (sync cada 5 min)
- Predicciones especiales de torneo (6 tipos, editables antes del inicio)

### ❌ Lo que falta y se nota
| # | Qué falta | Impacto |
|---|---|---|
| 1 | ✅ **Scoring de predicciones especiales** | Implementado vía `tournament_special_results` + `calculateSpecialPoints`. El sync detecta automáticamente resultados de finales y calcula stats del torneo. |
| 2 | ✅ **Ver predicciones de otros** | Implementado en página de predicción. Se muestra lista con avatar, predicción, comodín y puntos cuando el partido cerró. |
| 3 | ✅ **Resultados en la UI** | Implementado en fixture y página de predicción. Muestra marcador, penales, indicador de ganador/empate. |
| 4 | **Notificaciones** | Nada de push ni emails. Los jugadores no saben cuándo cierra un partido ni cuándo hay resultados. |
| 5 | **Tests** | Carpeta `tests/` vacía. 0 tests. |
| 6 | **PWA service worker** | El `manifest.json` existe pero no hay SW. No es instalable como app. |
| 7 | **Modo racha, badges, gráficas** | Post-MVP, no urgente. |
| 8 | **Admin manual para resultados especiales (ligas)** | No hay UI para que el admin marque manualmente campeón/finalista en ligas sin partido "Final". |

### 🔧 Infra de deploy — lista
- Next.js config OK para Vercel
- CI/CD workflow básico (build + lint + typecheck)
- Supabase con RLS, 15 migraciones aplicadas
- `/api/sync` protegido por `CRON_SECRET`

### Recomendación: deployar YA
Los bloqueantes originales ya están resueltos:
1. ✅ Predicciones especiales suman puntos automáticamente.
2. ✅ Se ven las predicciones de otros después del pitazo.
3. ✅ Resultados de partidos visibles en fixture y página de predicción.

El MVP es usable para torneos con eliminatorias. Para ligas puras sin final, el admin no puede marcar manualmente el campeón todavía (limitación conocida). Todo lo demás (notificaciones, tests, PWA, badges) puede ir en iteraciones post-deploy.

---

## CAMBIOS SESIÓN ABRIL 2026 (scoring especiales + predicciones de otros)

### 6. Fix: Scoring de predicciones especiales
**Problema:** `calculate-points.ts` solo procesaba partidos. Las predicciones especiales (campeón, finalista, etc.) nunca sumaban puntos al ranking.

**Solución implementada:**
- Nueva migración `0016_tournament_special_results.sql`: tabla para guardar resultados reales del torneo (`champion`, `finalist`, `third_place`, `least_goals_against`, `worst_team`, `top_scorer_team`).
- `updateTournamentSpecialResults(tournamentId)`: detecta automáticamente desde partidos terminados:
  - `champion`/`finalist`: desde partido con round exactamente `"Final"`.
  - `third_place`: desde partido con round `"3rd Place"`, `"Third Place"`, etc.
  - Stats-based (`least_goals_against`, `worst_team`, `top_scorer_team`): calculados desde todos los partidos terminados del torneo (goles a favor/en contra).
- `calculateSpecialPoints(pollaId)`: compara `special_predictions` vs `tournament_special_results`, asigna puntos según `special_point_system`, actualiza `special_predictions.points`.
- `recalculateMemberTotalPoints(pollaId, userId)`: nueva función que recalcula `total_points = SUM(match_points) + SUM(special_predictions.points)`. Reemplaza el recálculo manual que existía en `calculateMatchPoints`.
- Sync (`/api/sync/route.ts`): después de calcular puntos de partidos, llama a `updateTournamentSpecialResults` y `calculateSpecialPoints` para cada polla afectada.
- Tipos de TypeScript actualizados: `special_predictions.type` a los 6 tipos nuevos, `pollas.special_point_system` agregado, `tournament_special_results` añadida a `Database`.

### 7. Feature: Ver predicciones de otros por partido
**Problema:** Después del pitazo, cada jugador solo veía su propia predicción. No había forma de ver quién más predijo qué.

**Solución implementada:**
- Nuevo componente `MatchPredictionsList` (`src/components/features/dashboard/match-predictions-list.tsx`):
  - Muestra avatar, alias, predicción (goles), comodín usado (badge x2/x3), badge "Exacto" si acertó marcador.
  - Si el partido terminó, muestra puntos obtenidos por cada jugador.
  - Ordenado por puntos (mayor a menor).
  - Destaca al usuario actual con fondo diferente.
- Página de predicción (`/pollas/[id]/prediccion/[matchId]`): cuando `!isOpen`, obtiene todas las predicciones de miembros aprobados usando admin client (RLS bloquea ver predicciones de otros) y renderiza `MatchPredictionsList` debajo del formulario.

### 8. Feature: Mostrar resultados de partidos en la UI
**Problema:** Los resultados reales de los partidos no aparecían en ninguna página. No se sabía quién ganó, si hubo penales, etc.

**Solución implementada:**
- Nueva migración `0017_match_penalties.sql`: agrega `home_penalty_goals` y `away_penalty_goals` a `matches`.
- Sync (`/api/sync/route.ts`): al actualizar partidos desde API-Football, guarda `fixture.score.penalty.home` y `.away` en las nuevas columnas.
- FixtureList (`src/components/features/dashboard/fixture-list.tsx`):
  - Muestra resultado real (`3 : 1`) para partidos terminados o en vivo.
  - Si hubo penales: muestra `(P) 4 - 2` debajo del resultado.
  - Indicador visual: checkmark ✓ al lado del equipo ganador, color verde para el ganador, color ámbar para empate.
  - Badge "Empate" debajo del marcador cuando aplica.
  - Badge "Pendiente" en ámbar para partidos con fecha pasada pero status NS (falta sincronizar).
  - Botón "Actualizar X resultados" que llama a `refreshFixtureResults(pollaId)` para sincronizar manualmente partidos atrasados.
- Página de predicción (`/pollas/[id]/prediccion/[matchId]`):
  - Muestra resultado real grande (`2 - 1`) cuando el plazo cerró.
  - Penales debajo si aplica.
  - Badge "Ganó X" / "Empate" con color verde/ámbar.
  - Equipo ganador resaltado en verde.

### 9. Fix: Cargar fixtures guarda resultados reales desde el primer momento
**Problema:** Al cargar fixtures de temporadas pasadas (ej: Colombia 2024), los partidos YA habían terminado pero se guardaban con `status: 'NS'` y `home_goals: null`. El usuario veía "vs" en lugar del resultado real.

**Solución implementada:**
- `loadFixtures` (`actions.ts`): ahora extrae `fixture.status.short`, `goals.home`, `goals.away`, `score.penalty.home` y `.away` de cada fixture de la API.
  - Si el partido ya terminó (`FT`/`AFT`), guarda los goles y penales reales.
  - Si el partido es futuro, guarda `status: 'NS'` como antes.
- Después de insertar, para cada partido terminado recién insertado, llama a `calculateMatchPoints(matchId)` para calcular puntos inmediatamente.
- Lo mismo aplica a `syncFixtures` (sincronización progresiva para pollas activas).

### Limitaciones conocidas

**Ligas sin eliminatorias (formato liga/puntos):**
El sync detecta `champion` automáticamente desde un partido con round `"Final"`. En una liga pura no hay final — el campeón se define por tabla de posiciones. Para esos casos, el admin debe marcar manualmente los resultados especiales. **No hay UI para eso todavía.** Si no se marca, las predicciones de especiales no suman puntos (no hay resultado real → no se asignan puntos). Esto es seguro pero incompleto para ligas.

**Predicciones especiales que no aplican al torneo:**
El admin configura `special_point_system` con los puntos por categoría. Si pone `0` para una categoría, esa predicción no suma puntos aunque se acierte. Pero la categoría sigue apareciendo en el formulario de predicciones especiales. La solución inmediata es que el admin ponga `0` en las categorías que no apliquen. Para ocultarlas del formulario se necesitaría más trabajo (no prioritario para MVP).

**Pollas iniciadas en medio del torneo:**
El sistema permite iniciar una polla en cualquier momento. Las predicciones especiales se validan contra el primer partido del torneo (`deadline = scheduled_at del primer match`). Si la polla se inicia después de que el torneo empezó, los jugadores no pueden hacer predicciones especiales (el plazo ya cerró). Esto es correcto: las predicciones especiales son "antes del inicio del torneo".

---

## ESTADO ACTUAL CONSOLIDADO (post-sesión)

### ✅ Todo implementado en esta sesión
| # | Feature / Fix | Estado |
|---|---|---|
| 1 | **OAuth preserva código de invitación** | Middleware guarda `redirect_to`, callback redirige al destino original post-login |
| 2 | **PendingMembersList sin F5** | `dynamic = 'force-dynamic'` + `getPendingMembers()` + `useEffect` al montar |
| 3 | **Hydration error fechas** | Locale `'es-AR'` → `'es-ES'` |
| 4 | **Popup confirmación iniciar polla** | Modal con advertencia de revisar/guardar cambios antes de iniciar |
| 5 | **Comodines 0–100** | Límites ampliados de 5/3 a 100 en x2 y x3 |
| 6 | **Scoring predicciones especiales** | `tournament_special_results` + `calculateSpecialPoints` + detección automática de finales y stats |
| 7 | **Ver predicciones de otros** | `MatchPredictionsList` en página de predicción cuando el partido cerró |
| 8 | **Resultados en UI** | Fixture y página de predicción muestran marcador, penales, indicador ganador/empate |
| 9 | **Cargar fixtures con resultados reales** | `loadFixtures` y `syncFixtures` guardan goles/penales/status reales desde la API si el partido ya terminó |

### ⚠️ Limitaciones conocidas (post-sesión)
- **Ligas sin eliminatorias:** No se detecta campeón automáticamente (no hay partido "Final"). Las especiales no suman puntos. Solución futura: UI para que el admin marque manualmente.
- **Categorías de especiales con 0 puntos:** Siguen visibles en el formulario. El admin las desactiva poniendo 0.
- **Pollas iniciadas en medio del torneo:** Funcionan correctamente. Las predicciones especiales se cierran al `scheduled_at` del primer partido.

### 🔮 Post-MVP
- UI para marcar campeón/finalista manualmente en ligas
- Ocultar campos de especiales que valen 0
- Notificaciones push/email
- Tests
- PWA service worker
- Modo racha, badges, gráficas de evolución

### 🔧 Infra de deploy
- Next.js config OK para Vercel
- CI/CD workflow básico (build + lint + typecheck)
- Supabase con RLS, 17 migraciones (0001–0017)
- `/api/sync` protegido por `CRON_SECRET` — listo para configurar cron-job.org
- **Build pasa limpio**

### Migraciones que deben correrse en Supabase (en orden)
1. `0016_tournament_special_results.sql`
2. `0017_match_penalties.sql`

### Recomendación: deployar YA
El MVP es usable para torneos con eliminatorias. Todo lo demás puede ir en iteraciones post-deploy.


---

## CAMBIOS SESIÓN ABRIL 2026 — Rate limiting, performance y arquitectura de sync

### Contexto previo a esta sesión
- `loadFixtures` llamaba `calculateMatchPoints()` en loop para cada partido terminado después de insertar. Con 190 partidos = ~2,000 queries a Supabase. Timeout.
- `loadFixtures` hacía `DELETE` de todos los partidos del torneo antes de insertar. Si dos pollas compartían el mismo torneo, una podía borrar los partidos de la otra.
- No había rate limiting en ninguna server action ni API route. Un usuario podía spamear "Cargar partidos" infinitamente.
- No había límite de pollas por usuario.
- El botón de sincronizar para pollas activas decía "Cargar partidos" en vez de "Sincronizar".
- Plan de API-Football: **$19/mes = 7,500 requests/día** (antes se asumía plan gratuito de 100/día).

### 1. Fix CRÍTICO: Performance de carga de fixtures
**Problema:** `loadFixtures` y `syncFixtures` llamaban `calculateMatchPoints()` secuencialmente para cada partido terminado. Cada llamada hacía ~10 queries. Con 190 partidos terminados = ~1,900 queries. El navegador hacía timeout.

**Fix:**
- Se **eliminó el loop** de `calculateMatchPoints` de `loadFixtures` y `syncFixtures`.
- Los fixtures se cargan **instantáneamente** ahora: solo insert/upsert batch de partidos con resultados reales preservados desde la API.
- Los puntos se calculan **después**, ya sea por el cron o manualmente.

### 2. Batch recalculation: `batchCalculateMatchPoints()`
**Problema:** Necesitábamos una forma de calcular puntos de todos los partidos terminados de una polla sin el loop lento.

**Solución:**
- Nueva función `batchCalculateMatchPoints(pollaId)` en `src/lib/sync/calculate-points.ts`.
- **Solo 5 queries totales** independientemente de cuántos partidos haya:
  1. Obtener polla
  2. Obtener partidos terminados sin calcular
  3. Obtener todas las predicciones de esos partidos
  4. Upsert batch de `match_points`
  5. Recalcular `total_points` para cada miembro aprobado
- Calcula todo en memoria. Procesa miles de predicciones en segundos.
- Exporta tipo `BatchResult` para tipado estricto.

### 3. Botón "Recalcular puntos" en configuración
**Problema:** Después de cargar fixtures históricos, los puntos quedaban en 0 hasta que alguien ejecutara algo.

**Solución:**
- Nueva server action `recalculatePoints(pollaId)` en `actions.ts` — verifica que el usuario sea admin, llama a `batchCalculateMatchPoints`.
- Nuevo componente `RecalculatePointsButton` en `action-buttons.tsx` — aparece en la config cuando la polla está `active` o `finished`.
- Feedback inmediato: "Puntos calculados: X predicciones en Y partidos" o "No había partidos pendientes."

### 4. Fix CRÍTICO: `loadFixtures` no borra partidos de otras pollas
**Problema:** `loadFixtures` hacía `DELETE FROM matches WHERE tournament_id = X` antes de insertar. Si dos pollas compartían el mismo torneo (misma liga+temporada), el admin de polla B le borraba los partidos al admin de polla A.

**Fix:**
- Eliminado el `DELETE`.
- Cambiado a `upsert(matches, { onConflict: 'api_football_id' })`.
- Inserta partidos nuevos, actualiza los existentes (horarios, resultados, venues), nunca borra.
- `matches.api_football_id` tiene constraint `UNIQUE` global, así que el upsert funciona correctamente.

### 5. Rate limiting con tabla en Supabase
**Problema:** Ninguna server action ni API route tenía rate limit. Un usuario podía:
- Crear infinitas pollas
- Spamear "Cargar partidos" 100 veces seguidas
- Spamear búsquedas de ligas

**Solución:**
- Nueva migración `0018_api_rate_limits.sql`:
  - Tabla `api_usage_logs` con columnas: `user_id`, `identifier` (para IPs), `action`, `metadata`, `created_at`.
  - Función RPC `check_rate_limit(identifier, action, max_count, interval_minutes)` → devuelve `boolean`.
  - Función RPC `log_api_usage(identifier, action, user_id, metadata)` → registra el uso.
- Nuevo helper `src/lib/rate-limit.ts`:
  - `checkRateLimit(identifier, action)` — devuelve `{ allowed, retryAfterMinutes, currentCount }`.
  - `logApiUsage(identifier, action, userId?, metadata?)` — registra en la tabla.
  - `getClientIdentifier(request)` — extrae IP de headers para usar en API routes.
  - Límites default configurados:
    - `load_fixtures`: 5 por hora
    - `sync_fixtures`: 10 por hora
    - `search_leagues`: 20 cada 10 min (por IP)
    - `get_rounds`: 10 por hora (por IP)
    - `recalculate_points`: 10 cada 10 min

**Dónde se aplicó:**
- `loadFixtures` — rate limit por `user.id` antes de llamar a la API
- `syncFixtures` — rate limit por `user.id`
- `recalculatePoints` — rate limit por `user.id`
- `/api/leagues/search` — rate limit por IP (`x-forwarded-for`)
- `/api/fixtures/rounds` — rate limit por IP

### 6. Límite de pollas por usuario
**Problema:** Un usuario podía crear infinitas pollas.

**Fix:**
- `MAX_POLLAS_PER_USER = 10` en `src/app/(dashboard)/pollas/nueva/actions.ts`.
- Antes de crear, cuenta las pollas existentes del usuario. Si >= 10, devuelve error: "Límite alcanzado: no podés crear más de 10 pollas."

### 7. Fix: Botón "Sincronizar" en pollas activas
**Problema:** El botón de `syncFixtures` decía "Cargar partidos" igual que `loadFixtures`, causando confusión.

**Fix:**
- `LoadFixturesButton` ahora acepta prop opcional `label`.
- En la página de configurar, cuando la polla está `active`, se pasa `label="Sincronizar"`.
- El botón sigue siendo naranja (`bg-amber-600`) con ícono de descarga.

### 8. Tipos de TypeScript actualizados
- `database.ts`: agregada tabla `api_usage_logs` y funciones RPC `check_rate_limit` / `log_api_usage`.

---

## PLAN DE IMPLEMENTACIÓN — Cron optimizado (pendiente de esta sesión)

### Objetivo
Hacer que los resultados se actualicen automáticamente apenas terminan los partidos, sin que el admin tenga que hacer nada.

### Arquitectura propuesta del cron (`/api/sync`)

**Frecuencia:** cada 2 minutos (cron-job.org)

**Consumo estimado con plan $19/mes (7,500 requests/día):**
| Escenario | Requests/ciclo | Requests/día | % del plan |
|---|---|---|---|
| Sin partidos en vivo | 1 (`live=all`) | 720 | 9.6% |
| Partidos en vivo + algunos terminados | 1-2 | ~900 | 12% |
| Sincronización fixtures nuevos (cada 6h) | ~5-20 | ~40 | 0.5% |
| **Total estimado** | — | **~1,000** | **~13%** |

**Queda ~6,500 requests libres por día para uso de usuarios.**

### Flujo del cron optimizado

```
Cada 2 minutos:
  1. Leer de BD: IDs de partidos que estaban en vivo en el ciclo anterior
     → (tabla temporal o caché en memoria del servidor)

  2. Request: fixtures?live=all
     → Trae TODOS los partidos en vivo del mundo
     → Filtramos los que son de nuestros torneos activos
     → Actualizamos goles, status, penales en BD

  3. Comparar: ¿Qué partidos del ciclo anterior ya no aparecen en live=all?
     → Esos probablemente terminaron (FT/AFT)
     → Request: getFixturesByIds(those) para obtener resultado final
     → Actualizamos BD con goles finales, status = FT/AFT

  4. Leer BD: partidos NS con fecha pasada (overdue)
     → Request: getFixturesByIds(overdue) en batches de 20
     → Actualizamos los que empezaron o se pospusieron

  5. Para cada partido que llegó a FT/AFT:
     → calculateMatchPoints(matchId)
     → Recalcular total_points de miembros
     → Marcar points_calculated = true

  6. Para cada torneo afectado:
     → updateTournamentSpecialResults(tournamentId)
     → calculateSpecialPoints(pollaId)

  7. Cada 6 horas (condicional):
     → Para cada torneo único activo:
       → getFixtures(leagueId, season)
       → syncFixtures automático (solo inserta los nuevos)
```

### Problema resuelto: "partidos recién terminados"
Sin el "ciclo de seguimiento", un partido que pasa de `2H` → `FT` entre ejecuciones del cron podría perderse (desaparece de `live=all`). La comparación con el ciclo anterior garantiza que siempre consultamos el resultado final de los partidos que dejaron de estar en vivo.

### Estado de implementación (todo completado)
1. ✅ Memoria actualizada
2. ✅ `/api/sync` implementado con `live=all`, ciclo de seguimiento, auto-sync de fixtures nuevos
3. ✅ Rate limiting aplicado en todas las acciones sensibles
4. ✅ Admin settings page operativa
5. ✅ Migraciones 0016–0020 aplicadas en producción

---

## Migraciones aplicadas en producción (todas — 0001 a 0020)
Estado: ✅ Todas aplicadas. No hay migraciones pendientes.

## Plan de API-Football (actualizado)
- **Plan actual:** $19/mes = 7,500 requests/día
- **Estrategia:** Usar `live=all` para el cron (1 request por ciclo), batches de 20 IDs (optimización sobre 10), sincronización cada 6h.
- **Temporadas disponibles:** todas (plan Pro desbloquea 2025/2026)
- **Límite configurable** desde `/admin/settings` key `api_football_daily_limit`

---

## CAMBIOS SESIÓN ABRIL 2026 — Persistencia de filtros, scroll restoration y UX del fixture

### Contexto previo a esta sesión
- Los filtros del fixture (estado, año, mes, búsqueda) se guardaban en `useState` local del Client Component.
- Al navegar a una predicción y volver (con "Atrás" del navegador o link "Volver al fixture"), los filtros se perdían y el usuario volvía a ver "Todos".
- Al guardar una predicción, el formulario redirigía con `router.push('/pollas/[id]/fixture')` sin query params, perdiendo filtros y mostrando datos cacheados (la predicción recién guardada no aparecía).
- El scroll position tampoco se restauraba al volver.

### 1. Filtros sincronizados con URL query params
**Archivo:** `src/components/features/dashboard/fixture-list.tsx`

**Cambio:** Todos los filtros ahora se leen y escriben en la URL:
- `?status=open` — filtro de estado (open, closed, missing, predicted)
- `?year=2024` — filtro de año
- `?month=5` — filtro de mes (0-indexado)
- `?q=argentina` — búsqueda por nombre de equipo
- `?sort=date-desc` — ordenamiento
- `?showFilters=1` — panel de "Más filtros" expandido

**Implementación:**
- Se usa `useSearchParams()` para leer filtros iniciales al montar el componente.
- Se usa `useRouter()` + `usePathname()` para actualizar la URL con `router.replace(..., { scroll: false })` cada vez que cambia un filtro.
- La función `updateUrl()` elimina parámetros con valor vacío/`null`/`'all'` para mantener la URL limpia.
- Los filtros son ahora bookmarkables y se mantienen al usar el botón "Atrás" del navegador.

### 2. Scroll restoration al volver de predicción
**Archivo:** `src/components/features/dashboard/fixture-list.tsx`

**Cambio:** Antes de navegar a la predicción, se guarda `window.scrollY` en `sessionStorage` bajo la clave `fixtureScrollY`. Al montar el fixture, un `useEffect` lee ese valor, hace `window.scrollTo()` y lo elimina.

**Flujo:**
1. Usuario hace clic en "Predecir" → se ejecuta `sessionStorage.setItem('fixtureScrollY', String(window.scrollY))`.
2. Usuario guarda predicción y vuelve al fixture.
3. `useEffect` en `FixtureList` restaura el scroll exacto donde estaba.

### 3. Link "Volver al fixture" preserva filtros
**Archivo nuevo:** `src/components/features/dashboard/back-to-fixture-link.tsx`

**Cambio:** Se creó un Client Component que lee la URL guardada en `sessionStorage` bajo `fixtureReturnUrl` y la usa como `href` del `Link`. Si no hay URL guardada, cae al fixture base.

**Archivo modificado:** `src/app/(dashboard)/pollas/[id]/prediccion/[matchId]/page.tsx`
- Se reemplazó el `Link` estático a `/pollas/[id]/fixture` por el nuevo `<BackToFixtureLink pollaId={params.id} />`.

**Flujo completo:**
1. Usuario filtra por "Por predecir" → URL: `/pollas/xxx/fixture?status=open`
2. Hace clic en "Predecir" → se guardan en `sessionStorage`:
   - `fixtureScrollY` = posición actual
   - `fixtureReturnUrl` = `/pollas/xxx/fixture?status=open`
3. En la página de predicción, el link "Volver al fixture" apunta a `/pollas/xxx/fixture?status=open`.

### 4. Fix: Predicción guardada no aparecía al volver
**Archivo:** `src/components/features/dashboard/prediction-form.tsx`

**Problema:** `router.push('/pollas/[id]/fixture')` navegaba con el caché del router de Next.js. El Server Component del fixture mostraba datos stale (sin la predicción recién guardada).

**Fix:**
```typescript
// Antes
router.push(`/pollas/${pollaId}/fixture`);

// Ahora
const returnUrl = sessionStorage.getItem('fixtureReturnUrl') || `/pollas/${pollaId}/fixture`;
window.location.href = returnUrl;
```

**Por qué funciona:** `window.location.href` fuerza un full reload del navegador. El Server Component se renderiza con datos frescos desde Supabase, mostrando la predicción recién guardada inmediatamente. La URL preserva los query params de los filtros gracias al `fixtureReturnUrl` guardado en `sessionStorage`.

### 5. Fix: Wildcard precedence bug (corregido en sesión previa, documentado ahora)
**Archivo:** `src/app/(dashboard)/pollas/[id]/prediccion/[matchId]/page.tsx`

**Problema:** La expresión `quantity || 2 - usedX2` se parseaba como `quantity || (2 - usedX2)` en lugar de `(quantity || 2) - usedX2`. Esto causaba que el conteo de comodines disponibles fuera incorrecto.

**Fix:** Se cambió a nullish coalescing con paréntesis explícitos:
```typescript
((polla.wildcards)?.find(w => w.type === 'x2')?.quantity ?? 2) - usedX2
```

### Estado consolidado de esta sesión

| # | Feature / Fix | Estado |
|---|---|---|
| 1 | **Filtros persistidos en URL** | ✅ Query params para status, year, month, q, sort |
| 2 | **Scroll restoration** | ✅ Guarda/restaura posición al volver de predicción |
| 3 | **Volver al fixture con filtros** | ✅ `BackToFixtureLink` lee URL de sessionStorage |
| 4 | **Predicción visible inmediatamente** | ✅ `window.location.href` fuerza reload con datos frescos |
| 5 | **Wildcard precedence bug** | ✅ Corregido con `??` y paréntesis |

---

---

## CAMBIOS SESIÓN MAYO 2026 — Prediction feedback, Admin plays toggle, Cron Vercel, PWA icons

### 1. Prediction result feedback
**Archivos:** `src/components/features/dashboard/fixture-list.tsx`, `src/app/(dashboard)/pollas/[id]/prediccion/[matchId]/page.tsx`

**Cambio:** Cuando un partido terminó (status FT/AFT), tanto la tarjeta del fixture como la página de predicción muestran feedback visual del resultado de la predicción del usuario:
- 🎯 **Exacto** — acertó el marcador exacto
- ✓ **Acertaste** — acertó el resultado (ganador/empate) pero no el marcador exacto
- ✗ **Fallaste** — no acertó el resultado

**Implementación en fixture card:**
- Badge visual alineado a la derecha, debajo de la predicción del usuario
- Color verde para Exacto/Acertaste, rojo para Fallaste
- Solo aparece cuando `isFinished && pred` (partido terminado + usuario tiene predicción)

**Implementación en página de predicción:**
- Bloque grande encima del formulario con el emoji + texto
- Calculado comparando `pred.home_goals`/`pred.away_goals` vs `match.home_goals`/`match.away_goals`

### 2. Admin plays toggle
**Archivos:** `src/components/features/dashboard/polla-settings-form.tsx`, `src/app/(dashboard)/pollas/[id]/configurar/actions.ts`, `src/app/(dashboard)/pollas/[id]/page.tsx`

**Cambio:** Nuevo toggle en Configurar → Configuración general: "El admin juega en el ranking".
- Default: `true` (el admin participa como cualquier miembro)
- Cuando está `false`: el admin se excluye del leaderboard query
- Persiste en columna `admin_plays BOOLEAN DEFAULT TRUE` en tabla `pollas`

**Implementación:**
- `polla-settings-form.tsx`: toggle con `useState(adminPlays)`, enviado como `fd.set('admin_plays', adminPlays ? 'true' : 'false')`
- `actions.ts`: lee `formData.get('admin_plays') !== 'false'`, incluye en `updateData`
- `page.tsx` (detalle de polla): `(polla as any).admin_plays ?? true`, si es `false` filtra al admin del array de miembros antes de renderizar el leaderboard

**Migración requerida:** `0024_admin_plays_column.sql`
```sql
ALTER TABLE public.pollas ADD COLUMN IF NOT EXISTS admin_plays BOOLEAN DEFAULT TRUE NOT NULL;
```

### 3. Cron Vercel
**Archivos:** `vercel.json`, `src/app/api/sync/route.ts`

**Cambio:** El cron ahora se ejecuta nativamente via Vercel Cron Jobs (gratis en plan Hobby para 1 job).
- `vercel.json`: configura `crons` con path `/api/sync` y schedule `*/5 * * * *` (cada 5 minutos)
- `/api/sync/route.ts`: ahora exporta tanto `GET` (para Vercel Cron) como `POST` (para cron-job.org legacy)
- Vercel Cron envía requests `GET` sin `CRON_SECRET`, por lo que la autenticación del cron usa `request.headers.get('x-vercel-signature')` como fallback

**Nota:** Vercel Cron en plan Hobby tiene cierta imprecisión (puede ejecutarse con ±1 min de delay). Para torneos en vivo esto es aceptable. Si se necesita precisión de 2 min, mantener cron-job.org como backup.

### 4. PWA Icons
**Archivos:** `public/icon-192x192.png`, `public/icon-512x512.png`

**Cambio:** Generados iconos PWA faltantes. Diseño: círculo verde (#16a34a) con pelota de fútbol blanca estilo hexágonos/pentágonos.
- `icon-192x192.png` — para homescreen en Android
- `icon-512x512.png` — para splash screen en Android

El `manifest.json` ya los referenciaba pero los archivos no existían. Ahora la PWA tiene todos los assets básicos (falta service worker para ser instalable).

---

## PENDIENTES CRÍTICOS (requieren acción manual)

### Migraciones en Supabase SQL Editor
Ejecutar en orden:

1. **0021** — Fix RLS polla_members SELECT (para que miembros vean ranking sin workaround de admin client)
2. **0022** — Agregar email a profiles (nice to have, no bloqueante)
3. **0023** — Expandir CHECK de matches.status (**CRÍTICO** — sin esto loadFixtures falla para Libertadores y otros torneos con partidos postergados)
4. **0024** — Agregar admin_plays a pollas (**CRÍTICO** — sin esto el toggle "El admin juega" falla al guardar)

### Post-MVP (no bloqueantes)
- PWA service worker (instalable)
- Tests (carpeta `tests/` vacía)
- Notificaciones push/email
- UI para marcar resultados especiales manualmente en ligas sin final
- Gráfica de evolución del ranking

---

---

## FIX POST-SESIÓN: Tipos de Supabase desactualizados (database.ts)

**Problema descubierto:** El toggle "El admin juega en el ranking" no aparecía en la UI a pesar de que el código y la migración 0024 estaban correctos.

**Causa raíz:** `src/types/database.ts` no tenía los campos nuevos de las migraciones 0022–0024:
- `profiles.email` — faltaba
- `pollas.admin_plays` — faltaba

Esto causaba que TypeScript no tipara correctamente los valores y en algunos flujos el campo no llegaba al Client Component.

**Fix:**
```typescript
// Agregado a profiles.Row / Insert / Update
email: string | null

// Agregado a pollas.Row / Insert / Update
admin_plays: boolean | null
```

También se limpiaron los casts `(polla as any).admin_plays` reemplazándolos por `polla.admin_plays`.

**Regla aprendida:** Cada vez que se aplica una migración que agrega/elimina/modifica columnas, hay que regenerar `database.ts` (o actualizarlo manualmente si no se tiene acceso al CLI de Supabase).

---

## PENDIENTES ACTUALIZADOS (Mayo 2026)

### ✅ Resueltos en esta sesión
- Prediction result feedback (🎯 Exacto / ✓ Acertaste / ✗ Fallaste)
- Admin plays toggle + fix de tipos
- Cron Vercel configurado
- Iconos PWA generados
- Tipos de Supabase actualizados (database.ts)

### ⏳ Post-MVP (no bloqueantes)
- PWA service worker (instalable)
- Tests (carpeta `tests/` vacía)
- Notificaciones push/email
- UI para marcar resultados especiales manualmente en ligas sin final
- Gráfica de evolución del ranking

---

---

## PENDIENTES GRANDES — Hoja de Ruta Post-MVP (definidos por el usuario)

### 1. Scripts de cálculo automático (no detallados ni desarrollados)

**Contexto:** Se habló de scripts automáticos que mantengan la integridad de datos sin intervención manual, pero nunca se detallaron ni implementaron completamente.

**Áreas a definir:**
- **Recálculo automático de puntos** cuando el admin cambia el sistema de puntos de una polla activa (actualmente hay botón manual "Recalcular puntos")
- **Validación de integridad** — script que detecte inconsistencias (ej: match_points sin predictions, predictions sin match_points, total_points desfasado vs suma real)
- **Limpieza de datos huérfanos** — eliminar predicciones de miembros rechazados, match_points de partidos borrados, etc.
- **Reporte de uso de API-Football** — alerta cuando se acerca al límite diario
- **Backup periódico** de tablas críticas (pollas, predictions, match_points)

**Estado:** ⏳ Pendiente de definir alcance y prioridad en sesión dedicada.

---

### 2. UX de la página Configurar

**Problema:** La página `/pollas/[id]/configurar` tiene toda la funcionalidad pero la experiencia puede ser confusa:
- 3 secciones colapsables con muchos campos
- El botón "Guardar cambios" está al final, lejos de donde se hacen cambios
- No hay feedback visual inmediato al cambiar un campo
- El orden de los campos no sigue el flujo mental del admin (¿qué configuro primero?)
- La sección de miembros pendientes aparece arriba, interrumpiendo el flujo de configuración
- El botón "Iniciar polla" es fácil de confundir con "Guardar cambios"

**Mejoras propuestas:**
1. **Wizard/Steps** — dividir en pasos: (1) Datos básicos, (2) Torneo + Fixtures, (3) Sistema de puntos, (4) Revisar e iniciar
2. **Auto-save** por sección en lugar de un botón global al final
3. **Preview en vivo** — mostrar cómo se verá la polla antes de iniciarla
4. **Reordenar secciones** — miembros pendientes en un tab/panel separado, no intercalado
5. **Feedback táctil** — toasts por sección, no un banner fijo al tope
6. **Validación inline** — mostrar errores al salir de un campo, no al hacer submit

**Estado:** ⏳ Pendiente diseño de wireframes y decisión de enfoque (wizard vs single-page mejorada).

---

### 3. Gráfica de evolución del ranking

**Descripción:** Línea de tiempo que muestra cómo sube/baja cada jugador en el ranking partido a partido.

**Datos necesarios:**
- Tabla `ranking_history` ya existe en schema pero no se utiliza actualmente
- Se necesita poblar `ranking_history` en cada cálculo de puntos: `polla_id, user_id, match_id, total_points_after, position, created_at`

**Visualización propuesta:**
- Gráfico de líneas con Recharts o Chart.js
- Eje X: partidos (fecha o número de partido)
- Eje Y: posición en el ranking (1 arriba, último abajo)
- Cada jugador es una línea de color distinto
- Hover muestra el marcador exacto de ese partido y los puntos ganados

**Estado:** ⏳ Pendiente. Requiere:
1. Modificar `calculate-points.ts` para escribir en `ranking_history`
2. Crear endpoint/API para traer datos históricos
3. Componente de gráfica en la página de detalle de polla

---

### 4. Modo racha y badges

**Descripción:** Sistema de logros que motiva a los jugadores y añade tensión social.

**Rachas (streaks) propuestas:**
- 🔥 Racha de aciertos: 3, 5, 10 partidos acertando resultado seguidos
- 🎯 Racha de exactos: 2, 3, 5 marcadores exactos seguidos
- 💀 Racha negativa: 5 partidos sin acertar (badge "En recuperación")

**Badges (logros únicos):**
- 🏆 Campeón de polla — ganar una polla
- 🥇 Primer lugar intermedio — liderar al menos una vez
- 🎲 Adivino — acertar marcador exacto en final
- 🃏 Comodín perfecto — usar x2/x3 en partido donde se acierta exacto
- 🔔 Nunca falta — predecir todos los partidos de una polla
- 🌟 Novato — primera predicción
- 👑 Legend — ganar 3 pollas

**Implementación:**
- Nueva tabla `player_badges` (`user_id`, `badge_id`, `earned_at`, `polla_id?`)
- Cálculo de rachas en `calculate-points.ts` (o función separada)
- UI: panel de badges en perfil + tooltip en leaderboard

**Estado:** ✅ IMPLEMENTADO (sesión 2026-05-05). Tablas `player_streaks` y `player_badges`, función `calculateAndUpdateStreaks`, función `awardBadgesFromMatch`, definición de 17 badges en `src/lib/badges.ts`. La lógica es correcta y tiene tests unitarios. **Pendiente aplicar migraciones 0026 y 0027 en Supabase prod.**

**Bug corregido (sesión 2026-05-05):** `calculateAndUpdateStreaks` usaba `.in('matches.status', ...)` y `.order('matches.scheduled_at')` sobre columnas de recursos embebidos en supabase-js. Eso NO funciona correctamente. Solución: filtrado y ordenamiento movidos a JS después de recibir los datos. También se agregó manejo defensivo por si `p.matches` viene como array en vez de objeto.

---

### 5. Plan de pruebas — Estado actual (2026-05-05)

#### Frente A — Tests unitarios de funciones puras ✅ COMPLETADO
- `src/lib/badges.test.ts` — `computeStreaks` y `determineBadges`: 20 tests, todos pasan.
- `src/lib/sync/random-predictions.test.ts` — `filterUsersWithoutPrediction` y `buildRandomPredictions`: 9 tests.

#### Frente B — Tests de integración contra Supabase real ✅ COMPLETADO
- `src/lib/test/integration.test.ts` — 4 tests contra DB real:
  - Cálculo exacto (8 puntos), total_points actualizado, ranking_history guardado, streaks correctos.
  - Predicción incorrecta (1 punto por away_goals), negative_streak = 1.
  - Batch calculation (múltiples partidos en una sola llamada).
  - Cálculo de predicciones especiales.
- `src/lib/test/factory.ts` — Helpers reutilizables: `createTestPolla`, `createTestMatches`, `createTestPredictions`, `cleanupAllTestData`.

**Estado del suite completo: 76/76 tests pasan** (`npx vitest run`).

#### Frente C — E2E smoke script (EN CURSO)
Script `scripts/e2e-smoke.ts` que simula la vida completa de una polla sin Playwright/Cypress y sin tocar API-Football.

**Escenarios a cubrir:**
1. Dos usuarios predicen un partido (A: 2-1 exacto, B: 0-0 incorrecto)
2. Partido avanza a FT con resultado real 2-1
3. `calculateMatchPoints` → verificar puntos A=8, B=1
4. **Idempotencia**: correr `calculateMatchPoints` de nuevo → puntos no cambian
5. **Comodín x2**: predicción con wildcard → verificar puntos × 2
6. **Cron flow completo**: partido pasa de `1H` a `FT` sin pasar por live=all (simula partido "desaparecido"), verificar que el sync lo detecta y calcula
7. Verificar: badge otorgado, ranking_history registrado, player_streaks actualizado

**Herramienta:** `tsx scripts/e2e-smoke.ts` usando `createAdminClient()` directamente.

---

## Resumen de pendientes por prioridad

| Prioridad | Pendiente | Estado |
|---|---|---|
| 🔴 CRÍTICO | Aplicar migraciones 0021–0024, 0026–0027 en Supabase prod | ⏳ Pendiente manual |
| 🔴 CRÍTICO | Configurar cron-job.org → POST /api/sync cada 5 min | ⏳ Pendiente |
| 🟡 Alta | Frente C: script e2e-smoke.ts | 🔨 En curso |
| 🟡 Alta | UI de badges y streaks en leaderboard/perfil | ⏳ Pendiente |
| 🟢 Media | Gráfica de evolución del ranking (datos ya se guardan en ranking_history) | ⏳ Pendiente |
| 🟢 Media | Notificaciones push/email (requiere dominio propio para Resend) | ⏳ Pendiente |
| ⚪ Baja | PWA service worker | ⏳ Pendiente |