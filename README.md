# Alfa Abogados — Sistema de gestión (Cuenca, Ecuador)

Aplicación interna para la oficina: calendario procesal, causas (con consulta a
e-SATJE), asistente jurídico con IA, tablero de tareas, editor colaborativo de
escritos y resumen de correos. Corre en **una PC de la oficina** y el resto del
equipo entra por el navegador en la red WiFi local.

La especificación completa está en **[PLAN.md](PLAN.md)**. El despliegue en la
oficina está en **[DEPLOY.md](DEPLOY.md)**.

## Stack

| Área | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) + servidor Node custom (`server.ts`) |
| Lenguaje | TypeScript estricto |
| Base de datos | SQLite (`better-sqlite3` + Drizzle ORM), modo WAL |
| Autenticación | Better Auth (email + contraseña, roles) |
| Tiempo real | Socket.IO (mismo proceso) |
| Editor colaborativo | Tiptap + Yjs + Hocuspocus (mismo proceso, ruta `/collab`) |
| IA | AI SDK de Vercel vía AI Gateway |
| UI | Tailwind v4 + shadcn/ui |
| Proceso | PM2 |

## Desarrollo

Requiere Node 20.11+ (recomendado 22 LTS).

```bash
npm install
cp .env.example .env      # completar BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run seed              # migraciones + usuario admin (pide credenciales)
npm run dev               # http://localhost:3000
```

### Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo (Next + Socket.IO + Hocuspocus, hot reload) |
| `npm run build` | build de producción de Next |
| `npm start` | servidor de producción |
| `npm run seed` | aplica migraciones y crea el admin inicial si no existe |
| `npm run db:generate` | genera una migración a partir de cambios en `lib/db/schema.ts` |
| `npm run db:migrate` | aplica migraciones pendientes |
| `npm run db:studio` | Drizzle Studio |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Estructura

```
server.ts              servidor Node: Next + Socket.IO + Hocuspocus
lib/
  db/                  Drizzle: schema, migraciones, conexión, pragmas
  auth.ts              Better Auth
  http.ts              helpers de route handlers (sesión, roles, Zod, idempotencia)
  realtime/            contrato y setup de Socket.IO (servidor y cliente)
  collab/              Hocuspocus (editor colaborativo)
  logger.ts  audit.ts  queue.ts  backups.ts
app/
  (auth)/login         pantalla de login
  (app)/               shell con sidebar/header + las 6 secciones
  api/                 route handlers
components/
  ui/                  primitivos shadcn
  shell/  auth/         layout de la app
```

## Roles

`admin` · `abogado` · `secretario` · `asistente`. Matriz de permisos en PLAN.md §3.
El registro público está deshabilitado: solo un admin crea usuarios.

## Estado de implementación

- [x] **Fase 1 — Fundaciones**: servidor custom (Next + Socket.IO + Hocuspocus),
      SQLite/Drizzle WAL, Better Auth + roles + seed, shell UI, pino, auditoría,
      backups nocturnos.
- [x] **Fase 2 — Calendario**: CRUD de eventos, vistas mes/semana/agenda, panel
      «próximos 7 días», encadenamiento evento→tarea, tiempo real, idempotencia.
- [x] **Fase 3 — Tablero de tareas**: kanban con drag & drop (@dnd-kit),
      ordering fraccional, automatizaciones (en proceso→documento, terminada→
      revisión), notificaciones.
- [x] **Fase 4 — Editor colaborativo**: Tiptap + Yjs + Hocuspocus, persistencia
      sin pérdida, hoja A4, exportar .docx, flujo enviar/aprobar.
- [x] **Fase 5 — Causas / SADJE**: búsqueda + expediente, cliente e-SATJE con
      fallback manual, motor de plazos COGEP + feriados + reglas, admin.
- [x] **Fase 6 — Asistente IA**: chat con RAG (sqlite-vec) sobre códigos y
      expedientes, tools, «abrir en editor», persistencia de conversaciones.
- [x] **Fase 7 — Outlook**: drop de `.msg`/`.eml` al calendario, resumen del
      buzón vía Microsoft Graph (device-code).
- [x] **Fase 8 — Endurecimiento**: avisos diarios de vencimientos, `/admin`
      completo, mantenimiento nocturno, revisión de índices, DEPLOY.md.

> Requiere `AI_GATEWAY_API_KEY` para la IA y una app de Entra ID para el resumen
> de correos; ambas cosas son opcionales y el resto funciona sin ellas.
