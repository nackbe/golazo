# Golazo — Polla Deportiva

La polla deportiva multijugador para el **Mundial 2026** y más allá. Predice resultados, compite con amigos y demuestra quién es el verdadero experto.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Estilos | Tailwind CSS + shadcn/ui |
| Backend / BaaS | Supabase (Auth, PostgreSQL, Realtime, Edge Functions, Storage) |
| Hosting | Vercel |
| API Deportiva | API-Football (RapidAPI) |
| Emails | Resend |
| Notificaciones Push | Web Push API |
| Sincronización | Node.js + node-cron (Mac Mini) |
| Estado Global | Zustand + React Query |

## Estructura del Proyecto

```
golazo/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Rutas de autenticación (grupo sin layout compartido)
│   │   ├── (dashboard)/        # Rutas protegidas con layout de navegación
│   │   ├── api/                # API Routes y webhooks
│   │   ├── layout.tsx          # Layout raíz (metadata, PWA)
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # Componentes base (shadcn/ui)
│   │   └── features/           # Componentes de dominio
│   ├── hooks/                  # Custom React hooks
│   ├── lib/
│   │   ├── supabase/           # Clientes y middleware de Supabase
│   │   └── utils.ts            # Utilidades (cn, formatDate, etc.)
│   ├── services/               # Lógica de API clients y negocio
│   ├── types/                  # Tipos TypeScript y tipos de DB
│   └── styles/                 # Estilos globales
├── supabase/
│   ├── migrations/             # Migraciones SQL de PostgreSQL
│   └── functions/              # Edge Functions (Denos/Node)
├── scripts/
│   └── sync-results.ts         # Script de sincronización para Mac Mini
├── public/                     # Assets estáticos y manifest PWA
├── tests/                      # Tests unitarios e integración
└── .github/workflows/          # CI/CD en GitHub Actions
```

## Primeros Pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia el archivo de ejemplo y rellena tus credenciales:

```bash
cp .env.example .env.local
```

Variables necesarias:
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (desde tu proyecto Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor / edge functions)
- `API_FOOTBALL_KEY` (desde RapidAPI)
- `RESEND_API_KEY` (para emails transaccionales)

### 3. Inicializar base de datos

Desde tu proyecto Supabase, aplica la migración inicial:

```bash
supabase db push
```

O ejecuta el contenido de `supabase/migrations/0001_initial_schema.sql` en el SQL Editor.

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### 5. Script de sincronización (Mac Mini)

El script en `scripts/sync-results.ts` consulta API-Football y actualiza resultados en Supabase.

```bash
npm install node-cron axios dotenv
npx tsx scripts/sync-results.ts
```

Recomendación: configurar como servicio de sistema (`launchd` en macOS o `systemd` en Linux).

## Hoja de Ruta

- **Fase 1 — MVP (4-6 semanas):** Auth, creación de pollas, fixture, predicciones básicas, ranking simple, sync script.
- **Fase 2 — Experiencia completa (3-4 semanas):** Comodines, notificaciones, aprobación de jugadores, predicciones especiales.
- **Fase 3 — Diferenciadores (2-3 semanas):** Gráficas de evolución, logros, reacciones, racha de aciertos, asistente IA.

## Convenciones

- **TypeScript estricto** activado (`strict: true`).
- **App Router** de Next.js para todas las rutas.
- **Server Components** por defecto; Client Components solo cuando sea necesario (interactividad, hooks).
- Supabase **RLS** habilitado en todas las tablas sensibles.
- Prefijo `on` para handlers de eventos, `handle` para funciones de utilidad.
- Alias `@/*` apunta a `./src/*`.

## Licencia

Privado — Proyecto personal.
