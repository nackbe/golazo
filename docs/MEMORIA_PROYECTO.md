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
| Framework | Next.js 14 + TypeScript | App Router, SSR para SEO, Server Components por defecto. |
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

## 3. Análisis del Documento de Diseño

**Calificación general: 8.5/10.** Excelente blueprint para un solo desarrollador.

### Fortalezas
- Stack moderno y apropiado para el problema.
- Arquitectura de 3 capas limpia (Vercel → Edge Functions → PostgreSQL + Mac Mini).
- Seguridad anti-trampa bien pensada (RLS + timestamps de servidor).
- Sistema de puntos balanceado y configurable por admin.
- Hoja de ruta realista (MVP en 4-6 semanas).
- Multi-torneo desde el inicio, no solo Mundial.

### Debilidades / Preguntas abiertas resueltas en esta memoria
- No contemplaba planes de contingencia para el Mac Mini.
- No definía estrategia de reintentos ante fallos de API-Football.
- Edge cases de eliminatorias pendientes de definición.
- "Asistente IA" marcado como diferenciador pero no es prioridad actual.

---

## 4. Recomendaciones Aplicadas y Decisiones Tomadas

### 4.1. Plan de contingencia para el Mac Mini (Aceptada)

**Problema:** El Mac Mini es un single point of failure físico (debe estar encendido, con internet, sin reinicios inesperados).

**Solución en capas:**
1. **Primaria:** Script Node.js (`scripts/sync-results.ts`) corriendo en Mac Mini con `node-cron` cada 5 minutos durante partidos activos.
2. **Secundaria:** Vercel Cron Jobs (una vez al día o cada hora según plan) como respaldo si el Mac Mini falla.
3. **Terciaria:** GitHub Actions con `schedule` (máx. cada 5 min es limitado, pero sirve para backfill).
4. **Backfill obligatorio:** Cada vez que el script inicia, debe reprocesar los últimos 10 partidos para cubrir cualquier gap por downtime.

**Acción técnica:** El webhook `/api/webhook/sync` ya está creado y listo para recibir triggers alternativos.

### 4.2. Estrategia de reintentos ante fallos de API-Football (Aceptada)

**Problema:** Si API-Football está caída durante un partido, se pueden perder resultados y no calcular puntos.

**Solución:**
- El script de sync debe implementar **exponential backoff** (reintentos: 1s, 2s, 4s, 8s, 16s).
- **Cola de reprocesamiento:** Si un fixture no se puede consultar, se agrega a una cola en memoria (o en una tabla `sync_queue` en Supabase) para reintentar en el siguiente ciclo.
- **Backfill al iniciar:** Como se mencionó arriba, siempre consultar los últimos N fixtures al arrancar el script.
- **Monitoreo:** Loggear cada request con timestamp, status code y response time. Alertar si hay >3 fallos consecutivos.

### 4.3. Edge cases en fase eliminatoria (Aceptada)

**Regla definida:**
- Si un equipo se retira **antes** de iniciar la fase: la predicción relacionada se anula (0 puntos, no negativo). El admin puede forzar el recálculo.
- Si un equipo se retira **durante** la fase: la predicción se considera "fallida" (0 puntos). No es culpa del jugador, pero tampoco es acierto.
- Penales: para el sistema de puntos, el marcador válido es el de los 90/120 minutos (sin penales). Esto debe quedar claro en la UI desde el inicio.

### 4.4. Asistente IA (Postergado)

**Decisión:** No se implementará en las fases 1 ni 2. Se deja como diferenciador futuro (Fase 4+) pero no es prioridad.

**Razón:** Agrega complejidad innecesaria al MVP, costo de API de IA, y no es un diferenciador crítico para el lanzamiento.

### 4.5. Notificaciones push + email fallback (Aceptada)

**Decisión:** Implementar ambos canales desde la Fase 2.

| Evento | Push | Email |
|--------|------|-------|
| Inicio oficial de polla | ✅ | ✅ |
| Recordatorio 24h antes de partido | ✅ | ✅ |
| Recordatorio 2h/1h antes si no apostó | ✅ | ✅ |
| Ranking actualizado tras partido | ✅ | — |
| Solicitud de jugador pendiente (admin) | ✅ | ✅ |
| Resultado final del torneo | ✅ | ✅ |

**Restricción técnica:** En iOS, Web Push solo funciona si la PWA está instalada en la pantalla de inicio (iOS 16.4+). La UI debe detectar esto y guiar al usuario a instalarla si quiere notificaciones push. Si no, email es el canal por defecto.

### 4.6. Escalabilidad del ranking en tiempo real (Aceptada)

**Decisión:** No calcular el ranking completo en tiempo real por cada gol. En su lugar:
- Actualizar resultados de partidos en tiempo real vía Realtime.
- El recálculo de puntos se dispara cuando el partido termina (status = FT/AFT).
- El ranking se recalcula batch y se almacena en `ranking_history` para mantener la evolución gráfica.
- La tabla de posiciones se lee desde `polla_members.total_points`, no se calcula on-the-fly.

---

## 5. Estructura de Carpetas Actual

```
golazo/
├── docs/
│   ├── polla_deportiva_diseno.pdf      ← Documento original
│   └── MEMORIA_PROYECTO.md             ← Este archivo
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   └── pollas/page.tsx
│   │   ├── api/
│   │   │   ├── auth/callback/route.ts
│   │   │   └── webhook/sync/route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── ui/button.tsx
│   ├── hooks/
│   │   └── useSupabase.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   └── utils.ts
│   ├── services/
│   │   └── api-football.ts
│   └── types/
│       ├── database.ts
│       └── index.ts
├── supabase/
│   ├── config.toml
│   └── migrations/0001_initial_schema.sql
├── scripts/
│   └── sync-results.ts
├── public/
│   └── manifest.json
├── .github/workflows/ci.yml
├── .env.example
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
└── README.md
```

---

## 6. Plan de Desarrollo Priorizado

### Orden recomendado de implementación

**Fase 0 — Fundación (1 semana)** ← Empezar aquí
1. Crear proyecto Supabase (producción).
2. Configurar OAuth Google en Supabase Auth.
3. Configurar Resend para emails.
4. Aplicar migración `0001_initial_schema.sql`.
5. Generar tipos de la base de datos (`npm run db:types`).
6. Configurar variables de entorno locales y en Vercel.
7. Probar flujo de autenticación end-to-end (Google + email magic link).

**Fase 1 — MVP Core (3-4 semanas)**
1. Perfil de usuario: elegir alias al primer login, foto de perfil.
2. Crear polla: nombre, torneo, configuración de puntos, comodines.
3. Sistema de invitación: link, código de 6 caracteres, QR.
4. Flujo de aprobación de jugadores (manual + automático).
5. Fixture: importar partidos desde API-Football al crear polla.
6. Predicción de marcadores por partido (con cierre automático X minutos antes).
7. Script de sincronización funcional en Mac Mini.
8. Cálculo básico de puntos al finalizar partido.
9. Ranking simple (tabla de posiciones).

**Fase 2 — Experiencia Completa (2-3 semanas)**
1. Sistema de comodines (x2, x3) con restricciones.
2. Notificaciones email y push.
3. Predicciones especiales de torneo (campeón, finalista, clasificados).
4. Vista comparativa de predicciones por partido.
5. Desglose de puntos por jugador.
6. Múltiples pollas por usuario (pantalla de selección).
7. Mejoras de seguridad: rate limiting, auditoría de cambios.

**Fase 3 — Diferenciadores (2-3 semanas)**
1. Gráfica de evolución del ranking (línea temporal).
2. Logros y badges.
3. Reacciones y comentarios por partido.
4. Modo racha (caliente/frío).
5. Modo espectador en vivo (quién va ganando puntos mientras corre el partido).

**Fase 4 — Futuro (post-Mundial 2026)**
- Mercado de comodines entre jugadores.
- Asistente IA (postergado indefinidamente).
- Soporte para ligas locales (Champions, Premier, etc.).
- App nativa (solo si la PWA no cubre necesidades).

---

## 7. Convenciones de Código

- **TypeScript estricto** (`strict: true`).
- **Server Components por defecto**; Client Components solo cuando se necesite interactividad o hooks.
- **App Router** obligatorio para todas las rutas.
- Supabase **RLS habilitado** en todas las tablas con datos sensibles.
- Prefijos: `on` para handlers de eventos, `handle` para funciones de utilidad.
- Alias `@/*` apunta a `./src/*`.
- Commits en español o ingl técnico, prefijos tipo: `feat:`, `fix:`, `refactor:`, `docs:`.

---

## 8. Variables de Entorno Críticas

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# API Football (RapidAPI)
API_FOOTBALL_KEY=
API_FOOTBALL_HOST=v3.football.api-sports.io

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# App
NEXT_PUBLIC_APP_URL=

# Mac Mini / Sync
SUPABASE_PROJECT_ID=
SUPABASE_DB_PASSWORD=
```

---

## 9. Notas para Próximas Sesiones

- El schema SQL inicial ya tiene tablas para `profiles`, `tournaments`, `teams`, `matches`, `pollas`, `polla_members`, `predictions`, `special_predictions`, `ranking_history`.
- El middleware de Next.js ya está configurado para refrescar la sesión de Supabase en cada request.
- El componente `Button` base ya existe (estilo shadcn/ui) para empezar a construir UI rápido.
- El README tiene instrucciones de getting started completas.
- El CI de GitHub Actions ya está listo para validar lint, format, types y build en cada push.

**Próximo paso sugerido:** Fase 0 — Configurar proyecto Supabase y flujo de autenticación.
