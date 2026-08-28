# PLAN MAESTRO DE IMPLEMENTACIÓN — Sistema de Gestión para Bufete de Abogados (Cuenca, Ecuador)

> Documento de especificación técnica completa. Está escrito para que un agente de código (Claude Code)
> lo implemente SIN tomar decisiones propias ni inventar detalles. Toda decisión de arquitectura,
> librería, esquema de datos, endpoint y comportamiento está definida aquí.
> Legislación de referencia: derecho ecuatoriano (COGEP, Código Civil, COIP, Código de la Niñez y Adolescencia, etc.).

---

## 0. DECISIONES GLOBALES (NO NEGOCIABLES)

| Decisión | Valor elegido | Justificación |
|---|---|---|
| Despliegue | **PC del secretario**, servida en la LAN WiFi de la oficina | Decisión del cliente. Todos acceden vía navegador por IP local. |
| Framework | **Next.js 15 (App Router) con servidor Node custom** (`server.ts`) | Un solo proceso sirve HTTP + WebSockets + Hocuspocus. |
| Lenguaje | **TypeScript estricto** (`"strict": true`) en todo el proyecto | Cero `any` salvo interop justificado con comentario. |
| Base de datos | **SQLite** con `better-sqlite3` + **Drizzle ORM**, modo **WAL** | Sin servidor de BD externo. Persistencia local, backups triviales, latencia < 1 ms en LAN. |
| Vectores (RAG) | **sqlite-vec** (extensión SQLite) | Búsqueda vectorial local sin servicios externos. |
| Autenticación | **Better Auth** (email + contraseña, sesiones con cookie) sobre el mismo SQLite vía adaptador Drizzle | Sin OAuth. Roles: `admin`, `abogado`, `asistente`, `secretario`. |
| Tiempo real (kanban, calendario, notificaciones) | **Socket.IO** montado en el mismo servidor Node | Evita polling; sincronización instantánea entre máquinas. |
| Editor colaborativo | **Tiptap 2 + Yjs + @hocuspocus/server** montado en el mismo proceso (ruta WS separada) | Colaboración simultánea real con cursores, CRDT sin conflictos. |
| IA | **AI SDK de Vercel** con AI Gateway, modelo `xai/grok-4` (chat) y `openai/text-embedding-3-small` (embeddings vía gateway) | Grok como redactor principal, según decisión del cliente. |
| SADJE | **Scraping/consulta al API interno público de e-SATJE + fallback manual** | Decisión del cliente ("ambos"). |
| Outlook | Doble vía: (a) **drag & drop de archivos `.msg`/`.eml`** al calendario, (b) **Microsoft Graph API** para el resumen de correos (Sección 6) | El drag directo desde Outlook clásico al navegador NO transfiere el correo completo; ver §4.4. |
| Drag & drop UI | **@dnd-kit/core + @dnd-kit/sortable** | Kanban y calendario. |
| Fetching cliente | **SWR** + invalidación por eventos Socket.IO | Nunca fetch dentro de useEffect. |
| Validación | **Zod** en TODOS los bordes (API routes, formularios, sockets) | Un schema compartido en `lib/schemas/` por entidad. |
| Fechas | **date-fns** + **date-fns-tz**, zona horaria fija `America/Guayaquil` | Todas las fechas se guardan en UTC ISO-8601; se muestran en Guayaquil. |
| UI | Tailwind v4 + shadcn/ui, tema claro profesional | Ver §12 (diseño). |
| Gestor de proceso | **PM2** (Windows) con `pm2-windows-startup` | Arranque automático al encender la PC del secretario. |

### 0.1 Reglas de calidad transversales (anti-lag, anti-pérdida de datos)

1. **SQLite en modo WAL** (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`) — escrituras concurrentes sin bloquear lecturas.
2. **Todas las escrituras multi-tabla van en transacción** (`db.transaction(...)` de better-sqlite3, que es síncrono y atómico).
3. **Nunca se borra data**: todas las tablas de negocio llevan `deleted_at` (soft delete) y `updated_at`. Borrar = marcar.
4. **Auditoría**: tabla `audit_log` registra cada create/update/delete con usuario, entidad, id, diff JSON y timestamp.
5. **Backups automáticos**: job nocturno (cron interno con `node-cron`, 02:00) que ejecuta `VACUUM INTO 'backups/bufete-YYYY-MM-DD.db'` y conserva los últimos 30. Además copia la carpeta `storage/` (documentos subidos).
6. **Optimistic UI + reconciliación**: mutaciones con SWR `mutate` optimista; si el servidor rechaza, rollback y toast de error. El evento Socket.IO posterior es la fuente de verdad.
7. **Índices obligatorios** en toda columna usada en WHERE/ORDER BY (detallados en el schema, §2).
8. **Paginación por cursor** (no offset) en toda lista que pueda crecer (>50 filas).
9. **Sin polling**: cualquier dato que cambie por otro usuario llega por Socket.IO (`room` por sección) y dispara `mutate()` del SWR key correspondiente.
10. **Trabajo pesado fuera del request**: scraping SADJE, ingestión de PDFs, parsing de `.msg`, y resúmenes de correo corren en una **cola interna** (`p-queue`, concurrencia 2) — el request encola y responde 202; el resultado llega por socket.
11. **Rate limit interno** al portal de la Función Judicial: máx. 1 request cada 2 segundos, con reintentos exponenciales (3 intentos) y caché de 12 h.
12. **Errores**: todo route handler envuelve en try/catch, loguea con `pino` a `logs/app.log` (rotación diaria con `pino-roll`) y responde `{ error: { code, message } }` tipado. Jamás stack traces al cliente.
13. **Idempotencia**: los endpoints de creación aceptan header `Idempotency-Key` (UUID generado en cliente); se guarda en tabla `idempotency_keys` con TTL 24 h para que un doble click o retry no duplique audiencias/tareas.

---

## 1. ESTRUCTURA DEL PROYECTO

```
bufete/
├── server.ts                     # Servidor Node custom: Next + Socket.IO + Hocuspocus
├── ecosystem.config.cjs          # PM2
├── drizzle.config.ts
├── data/
│   ├── bufete.db                 # SQLite (WAL)
│   └── backups/
├── storage/                      # Archivos subidos (docs de clientes, PDFs de códigos, .msg)
│   ├── clientes/<clienteId>/
│   ├── codigos/                  # PDFs de legislación
│   └── correos/
├── lib/
│   ├── db/
│   │   ├── index.ts              # instancia better-sqlite3 + drizzle + pragmas
│   │   ├── schema.ts             # TODO el schema Drizzle (§2)
│   │   └── migrations/
│   ├── auth.ts                   # Better Auth config
│   ├── auth-client.ts
│   ├── schemas/                  # Zod: evento.ts, causa.ts, tarea.ts, documento.ts, correo.ts...
│   ├── realtime/
│   │   ├── socket-server.ts      # setup Socket.IO + rooms + emisores tipados
│   │   └── socket-client.ts      # hook useSocket() singleton
│   ├── queue.ts                  # p-queue singleton
│   ├── sadje/
│   │   ├── client.ts             # fetchers al API de e-SATJE (§5.2)
│   │   ├── parser.ts
│   │   └── deadlines.ts          # motor de plazos COGEP (§5.4)
│   ├── outlook/
│   │   ├── msg-parser.ts         # .msg → { subject, from, date, body }
│   │   ├── eml-parser.ts
│   │   └── graph.ts              # Microsoft Graph (Sección 6)
│   ├── ai/
│   │   ├── rag.ts                # chunking, embeddings, retrieve
│   │   ├── ingest.ts             # ingestión de PDFs
│   │   └── tools.ts              # tools del chat (buscarCausa, buscarCodigo, web)
│   ├── feriados.ts               # feriados Ecuador + cálculo días hábiles
│   └── audit.ts
├── app/
│   ├── layout.tsx
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx            # shell: sidebar + header
│   │   ├── calendario/page.tsx           # Sección A/1
│   │   ├── causas/page.tsx               # Sección 2 (búsqueda)
│   │   ├── causas/[id]/page.tsx          # expediente del cliente
│   │   ├── asistente/page.tsx            # Sección 3 (chat IA)
│   │   ├── tareas/page.tsx               # Sección 4 (kanban)
│   │   ├── documentos/[docId]/page.tsx   # Sección 5 (editor)
│   │   └── correos/page.tsx              # Sección 6
│   └── api/
│       ├── auth/[...all]/route.ts
│       ├── eventos/route.ts + [id]/route.ts
│       ├── eventos/desde-correo/route.ts # drop de .msg/.eml
│       ├── causas/route.ts + [id]/route.ts
│       ├── causas/buscar-sadje/route.ts
│       ├── causas/[id]/sincronizar/route.ts
│       ├── causas/[id]/documentos/route.ts
│       ├── chat/route.ts                 # streaming IA
│       ├── tareas/route.ts + [id]/route.ts
│       ├── documentos/route.ts + [id]/route.ts + [id]/export/route.ts
│       └── correos/resumen/route.ts
└── components/
    ├── calendario/  causas/  chat/  tareas/  editor/  correos/  ui/
```

### 1.1 `server.ts` (contrato exacto)

- Crea `next({ dev })` + `http.createServer(handler)`.
- Adjunta **Socket.IO** en path `/socket.io` con middleware de auth que valida la cookie de sesión de Better Auth (rechaza conexión si no hay sesión).
- Adjunta **Hocuspocus** vía `WebSocketServer({ noServer: true })` manejando el evento `upgrade` para el path `/collab` (Socket.IO maneja su propio upgrade; discriminar por `req.url`).
- Hocuspocus: hook `onAuthenticate` valida sesión + permiso sobre el documento; extensión `Database` persiste el update binario de Yjs en tabla `documento_yjs` con **debounce de 2 s** y guarda también snapshot JSON del contenido (para búsqueda/export) cada 30 s.
- Escucha en `0.0.0.0:3000`.
- Graceful shutdown: SIGINT/SIGTERM → flush Hocuspocus → `db.close()`.

---

## 2. SCHEMA DE BASE DE DATOS (Drizzle, SQLite)

Convenciones: ids `text` (UUID v7 generado con `uuidv7` npm), timestamps `text` ISO UTC (`created_at`, `updated_at`, `deleted_at` nullable). Todas las FK con `references()`.

```
users            (gestiona Better Auth: user, session, account, verification)
  + columna extra en user: role text NOT NULL DEFAULT 'asistente'  -- 'admin'|'abogado'|'asistente'|'secretario'

clientes
  id, nombre_completo text NOT NULL, cedula text UNIQUE nullable, telefono, email, notas
  ÍNDICES: idx_clientes_nombre (nombre_completo COLLATE NOCASE)

causas
  id, numero_juicio text UNIQUE NOT NULL         -- formato ^\d{5}-\d{4}-\d{4,5}$ ej. 01204-2025-00334
  cliente_id → clientes, tipo_accion text, materia text, judicatura text,
  estado text, fecha_ingreso text, origen text NOT NULL  -- 'sadje' | 'manual'
  ultima_sincronizacion text nullable
  ÍNDICES: idx_causas_numero, idx_causas_cliente

partes_procesales
  id, causa_id →, tipo text ('actor'|'demandado'|'tercero'), nombre text, representante text
  ÍNDICE: idx_partes_causa

actuaciones
  id, causa_id →, fecha text, tipo text, detalle text, origen 'sadje'|'manual'
  UNIQUE(causa_id, fecha, tipo, detalle_hash)     -- dedup en re-sincronización
  ÍNDICE: idx_actuaciones_causa_fecha

eventos                                            -- Sección 1 (calendario)
  id, tipo text NOT NULL ('escrito'|'audiencia'|'diligencia'),
  titulo text NOT NULL, descripcion text,
  fecha text NOT NULL (YYYY-MM-DD), hora text nullable (HH:mm),
  causa_id → nullable, cliente_id → nullable,
  origen text NOT NULL ('manual'|'correo'|'sadje-regla'),
  regla_id → reglas_plazo nullable, correo_origen_id nullable,
  estado text DEFAULT 'pendiente' ('pendiente'|'cumplido'|'cancelado'),
  creado_por → user
  ÍNDICES: idx_eventos_fecha, idx_eventos_causa

reglas_plazo                                       -- motor de plazos (§5.4)
  id, nombre text, actuacion_trigger text,         -- substring a detectar, ej. 'CALIFICACIÓN' + tipo_proceso
  tipo_proceso text ('ordinario'|'sumario'|'ejecutivo'|'monitorio'|'niñez'|'*'),
  dias int NOT NULL, tipo_dias text ('habiles'|'calendario'),
  evento_tipo text, evento_titulo_template text,   -- ej. 'Vence contestación demanda — {cliente}'
  activo int DEFAULT 1

feriados
  fecha text PRIMARY KEY (YYYY-MM-DD), nombre text  -- seed §5.4.2

tareas                                             -- Sección 4
  id, titulo text NOT NULL, descripcion text, color text DEFAULT 'blue',
  columna text NOT NULL DEFAULT 'por_hacer' ('por_hacer'|'en_proceso'|'terminada'),
  orden real NOT NULL,                             -- ordering fraccional (§7.3)
  causa_id → nullable, evento_id → nullable,
  asignado_a → user nullable, creado_por → user,
  documento_id → documentos nullable,
  fecha_limite text nullable
  ÍNDICES: idx_tareas_columna_orden, idx_tareas_asignado

documentos                                         -- Sección 5
  id, titulo text NOT NULL, tarea_id → nullable, causa_id → nullable,
  estado text DEFAULT 'borrador' ('borrador'|'enviado'|'aprobado'),
  creado_por → user
documento_yjs
  documento_id PRIMARY KEY →, estado_binario blob NOT NULL, snapshot_json text, updated_at

archivos                                           -- adjuntos del expediente (Sección 2)
  id, causa_id →, nombre_original text, ruta_relativa text, mime text, tamano int,
  subido_por → user, indexado_rag int DEFAULT 0

rag_chunks
  id, fuente_tipo text ('codigo'|'archivo_causa'), fuente_id text,   -- archivo o código legal
  causa_id text nullable,                          -- null para códigos (contexto global)
  titulo_fuente text, contenido text NOT NULL, embedding blob        -- vec en tabla virtual
+ tabla virtual: CREATE VIRTUAL TABLE rag_vec USING vec0(chunk_id text primary key, embedding float[1536])

conversaciones / mensajes                          -- Sección 3
  conversaciones: id, titulo, causa_id → nullable, user_id →
  mensajes: id, conversacion_id →, role text, parts_json text, created_at
  ÍNDICE: idx_mensajes_conv

correos_resumen                                    -- Sección 6 (caché)
  id, fecha text, resumen_json text, generado_at

sadje_cache
  clave text PRIMARY KEY,                          -- 'causa:<numero>' | 'busqueda:<hash>'
  payload_json text, expira_at text

audit_log
  id, user_id, entidad text, entidad_id text, accion text, diff_json text, created_at

idempotency_keys
  key text PRIMARY KEY, respuesta_json text, expira_at text
```

Migraciones con `drizzle-kit generate` + `migrate()` ejecutado al boot en `server.ts`.

---

## 3. AUTENTICACIÓN Y ROLES

- Better Auth, email+password, adaptador Drizzle SQLite. `BETTER_AUTH_SECRET` en `.env` (generar con `openssl rand -base64 32`). `trustedOrigins`: `http://localhost:3000` y `http://<IP-LAN>:3000`.
- Registro público **deshabilitado**: solo `admin` crea usuarios (página `/admin/usuarios`, visible solo para admin). Seed inicial: script `pnpm seed` crea admin `admin@bufete.local` con contraseña pedida por stdin.
- Matriz de permisos (aplicada en middleware de cada route handler con helper `requireRole()`):

| Acción | admin | abogado | secretario | asistente |
|---|---|---|---|---|
| CRUD eventos calendario | ✔ | ✔ | ✔ | solo leer |
| CRUD causas / sincronizar SADJE | ✔ | ✔ | ✔ | leer |
| Subir archivos a expediente | ✔ | ✔ | ✔ | ✔ |
| Chat IA | ✔ | ✔ | ✔ | ✔ |
| Crear/editar tareas | ✔ | ✔ | ✔ | solo mover columna y editar las asignadas |
| Editor de documentos | ✔ | ✔ | ✔ | ✔ (los suyos + compartidos) |
| Resumen de correos | ✔ | ✔ | ✔ | ✖ |
| Gestión de usuarios / reglas de plazo | ✔ | ✖ | ✖ | ✖ |

- `proxy.ts` (middleware Next) redirige a `/login` cualquier ruta `(app)` sin sesión.

---

## 4. SECCIÓN 1 — CALENDARIO

### 4.1 UI (`/calendario`)
- Vista mensual por defecto (grid 7×5/6 con CSS Grid), toggle Mes/Semana/Agenda. Header: mes + año, botones ‹ hoy ›.
- Cada celda-día muestra hasta 3 eventos como "chips" compactos + badge `+N más` (popover con lista completa). Chip: hora (si hay) + título truncado.
- **Codificación visual fija**: `escrito` = rojo (`--destructive`, es lo que pierde juicios), `audiencia` = azul primario, `diligencia` = ámbar. Leyenda visible bajo el header.
- Click en día vacío → dialog "Nuevo evento" (formulario Zod: tipo, título, fecha prellenada, hora, causa/cliente con combobox de búsqueda, descripción). Click en chip → dialog detalle con editar / marcar cumplido / cancelar.
- Panel lateral derecho fijo "Próximos 7 días" ordenado cronológicamente, escritos primero, con nombre de cliente y número de juicio.
- Datos: `useSWR('/api/eventos?desde&hasta')` por rango visible del mes. Socket room `calendario`: eventos `evento:creado|actualizado|eliminado` → `mutate` de la key del rango.

### 4.2 API
- `GET /api/eventos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máx. 62 días por request).
- `POST /api/eventos` (Zod `eventoCreateSchema`, Idempotency-Key), `PATCH/DELETE /api/eventos/[id]`.
- Toda mutación: transacción → audit_log → `io.to('calendario').emit(...)` → si `tipo==='escrito'` y no existe, crear tarea vinculada (§7.4).

### 4.3 Encadenamiento automático con Sección 4
Al crear un evento `tipo='escrito'` (por cualquier origen), en la MISMA transacción se crea una tarea en `por_hacer`: título `Preparar: {titulo}`, `fecha_limite = fecha del evento`, `evento_id` vinculado, color rojo. Si el evento se cancela, la tarea vinculada pendiente se marca cancelada (soft delete).

### 4.4 Input desde Outlook (drag & drop) — comportamiento exacto
**Limitación real que se debe comunicar en la UI**: Outlook clásico de escritorio no entrega el correo completo al navegador en un drag directo (solo texto plano en el mejor caso). El flujo soportado y documentado en un tooltip/onboarding del calendario es:

1. **Vía principal**: la abogada arrastra el correo de Outlook **al escritorio** (Windows genera un `.msg`) y luego arrastra ese `.msg` (o un `.eml`) **sobre la celda del día** en el calendario. También funciona arrastrar directamente desde el "nuevo Outlook"/OWA si el navegador recibe un archivo.
2. La celda entra en estado visual "drop target" (`onDragOver` con borde punteado) cuando `dataTransfer.types` incluye `Files`.
3. `onDrop`: se sube el archivo a `POST /api/eventos/desde-correo` (multipart: file + fecha de la celda).
4. Servidor: valida extensión/mime (`.msg` → `@kenjiuno/msgreader`; `.eml` → `mailparser`), extrae `{subject, from, receivedAt, bodyText}`. Guarda el archivo en `storage/correos/`.
5. **Heurística de clasificación** (regex sobre subject+body, en `lib/outlook/clasificador.ts`):
   - Extraer número de juicio con `/\d{5}-\d{4}-\d{4,5}/` → vincular causa si existe.
   - Palabras `audiencia|convócase|señala.*audiencia` → tipo `audiencia`; intentar extraer fecha/hora del cuerpo con regex de fechas es-EC (`dd/MM/yyyy`, `d de <mes> de yyyy`, `HH:mm`); si se extrae fecha del cuerpo, esa manda sobre la celda.
   - Palabras `término|contestar|traslado` → tipo `escrito`.
   - Sin match → tipo `diligencia`.
6. Respuesta 200 con el evento **en estado borrador**: el cliente abre el dialog de nuevo evento PRE-LLENADO (título=subject limpio, tipo, fecha, causa) para que la abogada confirme con un click. **Nunca se guarda sin confirmación humana.**
7. Si también hay `text/plain` en el drop (drag directo sin archivo), usar ese texto como cuerpo y seguir el mismo flujo.

---

## 5. SECCIÓN 2 — CAUSAS / SADJE

### 5.1 UI (`/causas`)
- Barra de búsqueda grande con dos modos autodetectados: si el input matchea `^\d{5}-\d{4}-\d{4,5}$` → búsqueda por número de juicio; si no → por nombre (busca primero en clientes/causas locales con `LIKE NOCASE`, botón secundario "Buscar en SADJE por cédula/nombre").
- Resultados locales instantáneos (SWR) + sección "Resultados SADJE" (spinner, llega por socket cuando la cola termina).
- `/causas/[id]`: tabs **Resumen** (partes, judicatura, estado, botón "Sincronizar ahora" con `ultima_sincronizacion`), **Actuaciones** (timeline descendente, virtualizada con `@tanstack/react-virtual` si >100), **Archivos** (upload drag&drop, lista, botón "Usar en IA" que encola ingestión RAG §6.3), **Fechas** (eventos vinculados + plazos generados).

### 5.2 Cliente SADJE (`lib/sadje/client.ts`)
- Endpoints del API público interno de e-SATJE (los que usa el propio portal `procesos.funcionjudicial.gob.ec`; base `https://api.funcionjudicial.gob.ec`):
  - `POST /EXPEL-CONSULTA-CAUSAS-SERVICE/api/consulta-causas/informacion/buscarCausas?page=1&size=10` — body con `numeroCausa` o cédula actor/demandado.
  - `GET /EXPEL-CONSULTA-CAUSAS-SERVICE/api/informacion-juicio/{idJuicio}` — detalle y partes.
  - `POST /EXPEL-CONSULTA-CAUSAS-SERVICE/api/consulta-causas-clex/informacion/actuacionesJudiciales` — actuaciones.
- **IMPORTANTE (instrucción para Claude Code)**: al implementar, verificar los paths y shapes reales abriendo el portal con DevTools o con requests de prueba, porque la Función Judicial los cambia sin aviso. Encapsular TODO en `client.ts` + tipos Zod en `parser.ts`; si el shape no valida, lanzar `SadjeSchemaError` y activar el flujo manual.
- Headers: `Content-Type: application/json`, `User-Agent` de navegador real. Timeout 15 s. Reintentos: 3 con backoff 2s/4s/8s. Rate limit global: token bucket 1 req/2 s (compartido vía singleton).
- Caché: `sadje_cache` TTL 12 h; "Sincronizar ahora" ignora caché.
- Todo corre en la cola `p-queue`; el route handler responde `202 {jobId}` y el resultado se emite por socket `sadje:resultado` al room del usuario.

### 5.3 Fallback manual
Si SADJE falla (timeout, 4xx/5xx, `SadjeSchemaError`) el cliente recibe `sadje:error` y la UI muestra banner "SADJE no disponible — registrar manualmente" con formulario completo de causa (número, tipo, materia, judicatura, partes dinámicas, actuaciones iniciales). `origen='manual'`. Una causa manual puede re-sincronizarse después (merge por `UNIQUE` de actuaciones, nunca sobrescribe campos editados manualmente: merge solo-agregar).

### 5.4 Motor de plazos → calendario (input 3 de la Sección 1)
`lib/sadje/deadlines.ts`:
1. Tras cada sincronización, por cada actuación **nueva**, evaluar `reglas_plazo` activas: match si `actuacion.tipo/detalle` contiene `actuacion_trigger` (case/acentos-insensitive, normalizar con `.normalize('NFD')`) y `tipo_proceso` coincide o es `*`.
2. Calcular vencimiento: `dias` **término = días hábiles** (saltar sábados, domingos y tabla `feriados`) o `plazo` = calendario, empezando a contar **desde el día hábil siguiente** a la citación/notificación (regla COGEP art. 73).
3. Crear evento `tipo` según regla, `origen='sadje-regla'`, título por template, vinculado a causa/cliente, **más la tarea encadenada** (§4.3). Dedup: no crear si ya existe evento con misma `regla_id+causa_id+fecha`.
4. Emitir `evento:creado` + notificación toast a todos.

#### 5.4.1 Seed de reglas (insertar en migración; editable por admin en `/admin/reglas`)
| Trigger (contiene) | Tipo proceso | Días | Tipo | Evento generado |
|---|---|---|---|---|
| `CITACIÓN` / `CITACION` | ordinario | 30 | hábiles | escrito: "Vence contestación demanda — {cliente}" |
| `CITACIÓN` | sumario | 15 | hábiles | escrito: "Vence contestación (sumario) — {cliente}" |
| `CITACIÓN` | ejecutivo | 15 | hábiles | escrito: "Vence contestación (ejecutivo) — {cliente}" |
| `CONVOCA A AUDIENCIA` / `SEÑALA.*AUDIENCIA` | * | 0 | — | audiencia en la fecha extraída del texto (regex fechas); si no se extrae, tarea "Verificar fecha de audiencia" |
| `SENTENCIA` | * | 10 | hábiles | escrito: "Vence término apelación — {cliente}" |
| `AUTO INTERLOCUTORIO` | * | 3 | hábiles | escrito: "Vence término recurso — {cliente}" |

(El admin puede corregir los días; los valores legales exactos los define el bufete, la app solo provee el motor + estos defaults documentados como "verificar con COGEP vigente".)

#### 5.4.2 Seed feriados Ecuador (recurrentes + puente configurable por admin)
1 ene, Carnaval (lun-mar, fechas anuales cargadas 2025-2027), Viernes Santo, 1 may, 24 may, 10 ago, 9 oct, 2 nov, 3 nov (Cuenca), 25 dic; + 12 abr (Fundación de Cuenca, local). Tabla editable en `/admin/feriados`.

---

## 6. SECCIÓN 3 — CHAT IA (estilo NotebookLM)

### 6.1 UI (`/asistente`)
- Layout dos columnas: izquierda lista de conversaciones (+ nueva), derecha el chat. Selector superior "Contexto: [Ninguno | Causa X…]" (combobox de causas) — define el scope RAG.
- Chat con AI SDK (`useChat` de `@ai-sdk/react`), streaming token a token, markdown renderizado (`react-markdown` + `rehype-highlight`), bloque de "Fuentes consultadas" bajo cada respuesta (chips con título del código/archivo y # de artículo si aplica).
- Botones de acción rápida sobre el input: "Redactar contestación de demanda", "Redactar demanda", "Analizar expediente" → insertan prompts plantilla.
- Botón en cada respuesta: **"Abrir en editor"** → crea `documento` con el contenido (markdown → Tiptap JSON) y navega a la Sección 5.

### 6.2 Backend (`POST /api/chat`)
- AI SDK `streamText` con modelo **`xai/grok-4`** vía AI Gateway (cero config de API key en Vercel/preview; en la PC del secretario se define `AI_GATEWAY_API_KEY` en `.env` — documentar en README de despliegue).
- **System prompt fijo** (archivo `lib/ai/system-prompt.ts`): "Eres el asistente jurídico interno de un bufete de Cuenca, Ecuador. Respondes SIEMPRE conforme al derecho ecuatoriano vigente (COGEP, Código Civil, COIP, CONA…). Citas artículos textuales solo desde el contexto recuperado; si el contexto no contiene la norma, lo dices explícitamente y NUNCA inventas números de artículo. Redactas escritos con la estructura forense ecuatoriana (designación de juez, comparecencia, fundamentos de hecho, fundamentos de derecho, pretensión, cuantía, procedimiento, casillero judicial y firma)."
- **Pipeline por request**:
  1. Recuperación RAG: embedding de la pregunta → top-8 de `rag_vec` filtrado por (`fuente_tipo='codigo'` siempre) + (`causa_id = contexto` si hay causa seleccionada), umbral de distancia 0.6.
  2. Si hay causa en contexto: inyectar además ficha estructurada (partes, tipo, estado, últimas 10 actuaciones, próximos eventos) serializada compacta.
  3. `tools` (AI SDK tool calling): `buscarCausaSadje({numeroJuicio})` (reusa §5.2), `buscarEnCodigos({consulta})` (RAG adicional bajo demanda), `busquedaWeb({query})` (implementada con el provider de búsqueda del gateway/xAI live search si disponible; si no, deshabilitada con flag `WEB_SEARCH_ENABLED=false` — no bloquear el resto).
  4. `stopWhen: stepCountIs(6)`, `maxOutputTokens: 8000`.
- Persistencia: al `onFinish`, guardar mensajes en `mensajes` (transacción). Al abrir conversación, `initialMessages` desde BD.
- Timeout de request: 120 s; errores del modelo → mensaje de error amable en el stream.

### 6.3 Ingestión RAG (`lib/ai/ingest.ts`)
1. **Códigos legales**: el admin sube PDFs (COGEP, Código Civil, COIP, CONA, Constitución, LOGJCC…) en `/admin/codigos`. Parsing con `unpdf` (extract text). **Chunking por artículo**: split con regex `/(?=Art(?:ículo|\.)\s*\d+)/i`; cada chunk = un artículo (si >1500 tokens, sub-split por párrafo con overlap 100). Metadata: `titulo_fuente='COGEP'`, artículo detectado.
2. **Archivos de causa**: PDF (unpdf), DOCX (`mammoth`), TXT. Chunks de 800 tokens, overlap 150, `causa_id` seteado.
3. Embeddings: AI SDK `embedMany`, modelo de embeddings del gateway, batch de 64, insertados en `rag_chunks` + `rag_vec` en transacción. Todo en la cola `p-queue`; progreso por socket (`rag:progreso {archivoId, pct}`) mostrado en la tab Archivos.
4. Re-ingestión idempotente: borrar chunks previos de la fuente antes de reinsertar.

---

## 7. SECCIÓN 4 — TABLERO DE TAREAS (Kanban)

### 7.1 UI (`/tareas`)
- 3 columnas fijas: **Por hacer / En proceso / Terminada**, cabecera con contador. Tarjeta: barra de color, título, descripción (2 líneas clamp), avatar del asignado, badge de fecha límite (rojo si ≤2 días), link a causa si existe, icono de documento si tiene doc vinculado.
- Drag & drop con `@dnd-kit` (sortable dentro de columna, droppable entre columnas). Animaciones con la API de dnd-kit, sin librerías extra.
- "Nueva tarea" (roles con permiso): dialog con título, descripción, color (6 opciones fijas del tema), asignado (select de usuarios activos), fecha límite, causa opcional.
- Filtros en header: por asignado, por color, "solo mías".

### 7.2 Tiempo real y consistencia
- `useSWR('/api/tareas')` + socket room `tareas`: `tarea:creada|movida|actualizada|eliminada`.
- Mover tarjeta: mutación optimista inmediata → `PATCH /api/tareas/[id]` `{columna, orden}` → si falla, rollback + toast. El emit del servidor incluye `updated_at`; el cliente descarta eventos más viejos que su estado (last-write-wins por timestamp).

### 7.3 Ordering fraccional
`orden` es `real`: insertar al final = `maxOrden + 1000`; entre A y B = `(A.orden + B.orden)/2`. Job de renormalización (en el cron nocturno) si algún gap < 0.0001.

### 7.4 Automatizaciones
- Evento `escrito` creado (cualquier origen) → tarea automática (§4.3), asignada a nadie (los abogados la asignan).
- Tarea movida a **En proceso** por primera vez y sin `documento_id` → el servidor crea `documento` (título = título de la tarea, `tarea_id` vinculado) y responde con `documentoId`; el cliente muestra toast con botón "Abrir documento" y navega a `/documentos/[id]` (Sección 5). Esto implementa el flujo "poner en proceso abre hoja tipo Word".
- Tarea movida a **Terminada** con documento vinculado → `documentos.estado='enviado'` + notificación socket `documento:enviado` a todos los roles abogado/admin (toast persistente con link "Revisar documento").

---

## 8. SECCIÓN 5 — EDITOR COLABORATIVO (estilo Google Docs)

### 8.1 Stack exacto
- **Tiptap 2** (`@tiptap/react`, `@tiptap/starter-kit`) + extensiones: `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `underline`, `text-align`, `font-family` (custom TextStyle), `font-size` (custom), `table` (+row/cell/header), `image` (upload a storage), `placeholder`, `character-count`.
- **Yjs + @hocuspocus/provider** conectando a `ws://<host>:3000/collab?doc=<documentoId>` con token de sesión.
- Cursores remotos con nombre y color por usuario (color derivado de hash del userId sobre paleta fija).

### 8.2 UI (`/documentos/[id]`)
- Toolbar fija: fuente (Times New Roman por defecto — estándar forense —, Arial, Georgia), tamaño (10–16pt), B/I/U, alineación, listas, tabla, interlineado 1.0/1.5/2.0, deshacer/rehacer.
- Página con aspecto A4 (ancho máx. 21cm, sombra, fondo gris alrededor) — familiar tipo Word.
- Barra superior: título editable inline, avatares de conectados (awareness de Yjs), estado "Guardado hace Xs" (del debounce de persistencia), estado del documento (borrador/enviado/aprobado).
- Botones: **Enviar a revisión** (asistente → estado `enviado` + notificación), **Aprobar** (abogado/admin), **Imprimir** (`window.print()` con CSS `@media print` que oculta todo salvo la hoja), **Exportar .docx** (`GET /api/documentos/[id]/export` — servidor convierte snapshot Tiptap JSON → docx con la librería `docx`), **Exportar PDF** (print-to-PDF del navegador, no server-side).

### 8.3 Persistencia sin pérdida
- Fuente de verdad = update binario Yjs en `documento_yjs` (debounce 2 s en Hocuspocus `Database.store`). Al abrir, `Database.fetch` devuelve el binario.
- Snapshot JSON cada 30 s para export/preview/búsqueda.
- Si el servidor cae, los clientes conservan el doc en memoria y **IndexedDB local** (`y-indexeddb` como provider secundario) y re-sincronizan al reconectar — cero pérdida por corte de WiFi.

---

## 9. SECCIÓN 6 — RESUMEN DE CORREOS (Outlook / Microsoft Graph)

### 9.1 Conexión
- **Microsoft Graph API** con flujo **device code** (`@azure/msal-node`, scopes `Mail.Read offline_access`) — evita configurar redirect URIs en una app LAN. El admin registra una app en Entra ID (multi-tenant o del tenant del bufete) y pone `MSGRAPH_CLIENT_ID` y `MSGRAPH_TENANT_ID` en `.env`; README de despliegue documenta el registro paso a paso.
- Página `/correos`: si no hay token, muestra el código de dispositivo y URL `microsoft.com/devicelogin` para que la abogada vincule su buzón una sola vez. Tokens (refresh) cifrados con `AES-256-GCM` (clave = `ENCRYPTION_KEY` de `.env`) en tabla `graph_tokens`.
- Si el bufete no puede registrar app en Entra: la sección muestra estado "No configurado" con instrucciones — **el resto del sistema no depende de esto**.

### 9.2 Funcionamiento
- Job cada 30 min (node-cron) + botón "Actualizar ahora": `GET /me/messages?$top=50&$filter=receivedDateTime ge <hoy 00:00 Guayaquil>` → solo `subject, from, receivedDateTime, bodyPreview`.
- Clasificación en dos pasos: (1) regex/domino del remitente (`@funcionjudicial.gob.ec` → SADJE, `@fiscalia.gob.ec` → Fiscalía, match con emails de `clientes` → nombre del cliente, resto → Otros); (2) un solo request a `xai/grok-4` con `generateObject` (schema Zod: `{grupos: [{categoria, cantidad, correos: [{asunto, remitente, resumen_1_linea, requiere_accion: boolean, numero_juicio?: string}]}]}`).
- Render exactamente como pidió la abogada: "3 correos de Fiscalía / 1 de SADJE / 2 del cliente Romeo…", grupos colapsables con detalle. Correos con `requiere_accion` y `numero_juicio` muestran botón "Crear evento" → abre el dialog del calendario prellenado (mismo flujo §4.4.6).
- Caché del resumen en `correos_resumen` por fecha; regenerar solo si hay correos nuevos.

---

## 10. TIEMPO REAL — CONTRATO SOCKET.IO

Rooms: `calendario`, `tareas`, `causas`, `user:<id>`. Eventos tipados en `lib/realtime/events.ts` (un union TypeScript compartido cliente/servidor):

```ts
type ServerEvent =
  | { t: 'evento:creado'|'evento:actualizado'|'evento:eliminado'; evento: Evento }
  | { t: 'tarea:creada'|'tarea:movida'|'tarea:actualizada'|'tarea:eliminada'; tarea: Tarea }
  | { t: 'causa:sincronizada'; causaId: string; nuevasActuaciones: number }
  | { t: 'sadje:resultado'; jobId: string; ok: boolean; data?: unknown; error?: string }
  | { t: 'rag:progreso'; archivoId: string; pct: number }
  | { t: 'documento:enviado'; documentoId: string; titulo: string; por: string }
  | { t: 'notificacion'; nivel: 'info'|'warn'; mensaje: string };
```

Cliente: hook `useRealtime(room, onEvent)` — singleton de socket, reconexión automática (Socket.IO default), al `reconnect` hace `mutate()` global de las keys del room (garantiza consistencia tras cortes de WiFi).

---

## 11. NOTIFICACIONES INTERNAS

- Toasts (sonner) para eventos en vivo.
- Campana en el header con dropdown: persiste en tabla `notificaciones (id, user_id nullable=broadcast, tipo, mensaje, link, leida, created_at)`. Se crean junto con: evento escrito próximo (job diario 07:00 revisa eventos a ≤3 días hábiles y notifica), documento enviado, tarea asignada, fallo de SADJE.

---

## 12. DISEÑO VISUAL

- **Dirección**: interfaz profesional jurídica, sobria y densa en información pero limpia. Tema claro por defecto (oficina, impresión), dark opcional.
- **Colores (5 máx., tokens en globals.css)**: fondo blanco hueso neutro; texto gris muy oscuro; **primario azul marino profundo** (confianza jurídica); acento **rojo** reservado EXCLUSIVAMENTE para plazos de escritos y vencimientos (significado consistente en todo el sistema); ámbar para diligencias/avisos.
- **Tipografía**: `Geist` (UI) + dentro del editor las fuentes de documento (Times New Roman etc. vía font stack del sistema, no webfonts). Máx. 2 familias en la UI.
- Shell: sidebar izquierda fija con las 6 secciones (iconos lucide: CalendarDays, Scale, MessagesSquare, KanbanSquare, FileText, Mail) + header con búsqueda global de causas y campana.
- Layout con flexbox; grid solo en el calendario. Espaciado con `gap-*`. `bg-background` en `<html>`.

---

## 13. VARIABLES DE ENTORNO (`.env` — plantilla `.env.example` obligatoria)

```
DATABASE_PATH=./data/bufete.db
BETTER_AUTH_SECRET=            # openssl rand -base64 32
BETTER_AUTH_URL=http://192.168.X.X:3000
AI_GATEWAY_API_KEY=            # para producción en la PC (en previews Vercel no hace falta)
MSGRAPH_CLIENT_ID=             # opcional (Sección 6)
MSGRAPH_TENANT_ID=common
ENCRYPTION_KEY=                # 32 bytes hex, para tokens Graph
WEB_SEARCH_ENABLED=false
PORT=3000
```

---

## 14. DESPLIEGUE EN LA PC DEL SECRETARIO (Windows, LAN WiFi)

Documentar en `DEPLOY.md` con estos pasos exactos:
1. Instalar Node.js 22 LTS y pnpm (`corepack enable`).
2. Clonar/copiar el proyecto; `pnpm install`; crear `.env` desde `.env.example`.
3. `pnpm build` (Next standalone: `output: 'standalone'` en next.config) — el server custom se compila con `tsx`/`tsc` a `dist/server.js`.
4. **IP fija**: reservar la IP de la PC en el router (DHCP reservation) o IP estática, ej. `192.168.1.50`. Actualizar `BETTER_AUTH_URL`.
5. **Firewall de Windows**: regla de entrada TCP 3000 solo para perfil "Red privada".
6. `pm2 start ecosystem.config.cjs && pm2 save && npx pm2-windows-startup install` — arranque automático, restart on crash, `max_memory_restart: 1G`.
7. Configurar el plan de energía de Windows: nunca suspender (solo apagar pantalla).
8. Los demás acceden desde su navegador a `http://192.168.1.50:3000`. Crear acceso directo en cada escritorio.
9. Backups: verificar carpeta `data/backups/` tras la primera noche; adicionalmente recomendar copiar semanalmente esa carpeta a un USB/OneDrive.
10. **Advertencia documentada**: si la PC del secretario se apaga, el sistema no está disponible; los documentos abiertos no se pierden (y-indexeddb) y se re-sincronizan al volver.

---

## 15. ORDEN DE IMPLEMENTACIÓN (fases con criterios de aceptación)

**Fase 1 — Fundaciones**: proyecto Next 15 + server.ts (Next+Socket.IO+Hocuspocus vacíos), SQLite+Drizzle+migraciones+pragmas, Better Auth+roles+seed admin+login, shell UI (sidebar/header), pino, audit, backups cron.
✔ Acepta: login funciona desde otra máquina de la LAN; `pm2 logs` limpio; backup nocturno genera archivo.

**Fase 2 — Sección 1 (calendario manual)**: CRUD eventos + vista mes/semana/agenda + panel próximos 7 días + tiempo real + tarea encadenada.
✔ Acepta: dos navegadores ven el mismo evento en <1 s sin refrescar; crear escrito genera tarea.

**Fase 3 — Sección 4 (kanban)**: CRUD tareas, dnd, tiempo real, ordering fraccional, filtros.
✔ Acepta: mover tarjeta en máquina A se refleja en B en <1 s; sin saltos con 2 usuarios moviendo a la vez.

**Fase 4 — Sección 5 (editor)**: Hocuspocus persistente, Tiptap completo, y-indexeddb, imprimir, export docx, flujo enviar/aprobar + automatizaciones §7.4.
✔ Acepta: 2 usuarios escriben simultáneo con cursores; matar el server y reiniciar no pierde ni un carácter; docx abre en Word.

**Fase 5 — Sección 2 (SADJE)**: client+parser+cola+caché+rate limit, búsqueda, expediente, fallback manual, archivos, motor de plazos+feriados+reglas seed, admin de reglas.
✔ Acepta: buscar un número de juicio real muestra partes y actuaciones; caída simulada de red activa el formulario manual; actuación de citación genera evento+tarea en la fecha hábil correcta.

**Fase 6 — Sección 3 (IA)**: ingestión de códigos + RAG + chat streaming + tools + "abrir en editor" + persistencia de conversaciones.
✔ Acepta: pregunta sobre plazos COGEP cita artículo del PDF ingerido con fuente visible; con causa en contexto la redacción incluye partes reales; respuesta transformable en documento editable.

**Fase 7 — Outlook**: drop `.msg`/`.eml` al calendario con dialog prellenado; Graph device-code + resumen agrupado + "crear evento".
✔ Acepta: arrastrar un `.msg` de prueba a una celda abre el dialog con asunto/fecha/causa detectados; `/correos` muestra "N de Fiscalía / N de SADJE / N de cliente X".

**Fase 8 — Endurecimiento**: notificaciones diarias de vencimientos, `/admin` completo (usuarios, reglas, feriados, códigos), pruebas de reconexión WiFi, revisión de índices con `EXPLAIN QUERY PLAN` en las 10 queries más usadas, DEPLOY.md final.

---

## 16. LO QUE CLAUDE CODE **NO** DEBE HACER

- No usar localStorage para datos de negocio (solo y-indexeddb para el buffer del editor).
- No usar ORMs adicionales, Prisma, ni Postgres: el stack de datos es exactamente better-sqlite3+Drizzle.
- No inventar endpoints de SADJE distintos sin verificarlos; ante duda, implementar el fallback manual primero.
- No guardar eventos de correo sin confirmación humana (§4.4.6).
- No hacer polling (setInterval de fetch) en ninguna vista.
- No exponer el puerto fuera de la LAN ni desactivar la auth "para probar".
- No citar artículos legales desde el conocimiento del modelo: solo desde RAG (system prompt lo fuerza).
- No usar `any`, no dejar TODOs sin issue, no saltarse Zod en un solo endpoint.
