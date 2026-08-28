import { sql } from 'drizzle-orm';
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { uuidv7 } from 'uuidv7';

// ─────────────────────────────────────────────────────────────────────────────
// Convenciones (PLAN §2):
//  - ids: text, UUID v7 (`uuidv7`)
//  - timestamps de negocio: text ISO-8601 UTC (created_at, updated_at, deleted_at)
//  - Better Auth gestiona sus 4 tablas con timestamps propios (integer epoch).
//  - Nunca se borra data: soft delete con deleted_at.
// ─────────────────────────────────────────────────────────────────────────────

const id = () => text('id').primaryKey().$defaultFn(() => uuidv7());
const nowIso = () => new Date().toISOString();
const createdAt = () => text('created_at').notNull().$defaultFn(nowIso);
const updatedAt = () =>
  text('updated_at')
    .notNull()
    .$defaultFn(nowIso)
    .$onUpdateFn(nowIso);
const deletedAt = () => text('deleted_at');

export const ROLES = ['admin', 'abogado', 'secretario', 'asistente'] as const;
export type Role = (typeof ROLES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH  (user / session / account / verification)
// ─────────────────────────────────────────────────────────────────────────────

// Better Auth guarda sus timestamps como epoch en milisegundos.
const BA_NOW = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  // Columnas extra del proyecto (PLAN §2 / §3).
  role: text('role', { enum: ROLES }).notNull().default('asistente'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(BA_NOW),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(BA_NOW)
    .$onUpdateFn(() => new Date()),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW)
      .$onUpdateFn(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(BA_NOW)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────────────────────────────────────

export const clientes = sqliteTable(
  'clientes',
  {
    id: id(),
    nombreCompleto: text('nombre_completo').notNull(),
    cedula: text('cedula').unique(),
    telefono: text('telefono'),
    email: text('email'),
    notas: text('notas'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('idx_clientes_nombre').on(t.nombreCompleto)],
);

// ─────────────────────────────────────────────────────────────────────────────
// CAUSAS  (SADJE / manual)
// ─────────────────────────────────────────────────────────────────────────────

export const causas = sqliteTable(
  'causas',
  {
    id: id(),
    // ^\d{5}-\d{4}-\d{4,5}$   ej. 01204-2025-00334
    numeroJuicio: text('numero_juicio').notNull().unique(),
    clienteId: text('cliente_id').references(() => clientes.id),
    tipoAccion: text('tipo_accion'),
    materia: text('materia'),
    judicatura: text('judicatura'),
    estado: text('estado'),
    fechaIngreso: text('fecha_ingreso'),
    origen: text('origen', { enum: ['sadje', 'manual'] }).notNull(),
    ultimaSincronizacion: text('ultima_sincronizacion'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  // numero_juicio ya lleva índice único implícito por .unique()
  (t) => [index('idx_causas_cliente').on(t.clienteId)],
);

export const partesProcesales = sqliteTable(
  'partes_procesales',
  {
    id: id(),
    causaId: text('causa_id')
      .notNull()
      .references(() => causas.id),
    tipo: text('tipo', { enum: ['actor', 'demandado', 'tercero'] }).notNull(),
    nombre: text('nombre').notNull(),
    representante: text('representante'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('idx_partes_causa').on(t.causaId)],
);

export const actuaciones = sqliteTable(
  'actuaciones',
  {
    id: id(),
    causaId: text('causa_id')
      .notNull()
      .references(() => causas.id),
    fecha: text('fecha').notNull(),
    tipo: text('tipo').notNull(),
    detalle: text('detalle').notNull(),
    // sha256 de detalle normalizado, para dedup en re-sincronización
    detalleHash: text('detalle_hash').notNull(),
    origen: text('origen', { enum: ['sadje', 'manual', 'correo'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('idx_actuaciones_causa_fecha').on(t.causaId, t.fecha),
    uniqueIndex('uq_actuaciones_dedup').on(
      t.causaId,
      t.fecha,
      t.tipo,
      t.detalleHash,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// REGLAS DE PLAZO  (motor de plazos, PLAN §5.4)
// ─────────────────────────────────────────────────────────────────────────────

export const reglasPlazo = sqliteTable('reglas_plazo', {
  id: id(),
  nombre: text('nombre').notNull(),
  // substring a detectar en la actuación, ej. 'CITACIÓN'
  actuacionTrigger: text('actuacion_trigger').notNull(),
  tipoProceso: text('tipo_proceso', {
    enum: ['ordinario', 'sumario', 'ejecutivo', 'monitorio', 'niñez', '*'],
  }).notNull(),
  dias: integer('dias').notNull(),
  tipoDias: text('tipo_dias', { enum: ['habiles', 'calendario'] }).notNull(),
  eventoTipo: text('evento_tipo', {
    enum: ['escrito', 'audiencia', 'diligencia'],
  }),
  eventoTituloTemplate: text('evento_titulo_template'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const feriados = sqliteTable('feriados', {
  // YYYY-MM-DD
  fecha: text('fecha').primaryKey(),
  nombre: text('nombre').notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS  (Sección 1 — calendario)
// ─────────────────────────────────────────────────────────────────────────────

export const eventos = sqliteTable(
  'eventos',
  {
    id: id(),
    tipo: text('tipo', {
      enum: ['escrito', 'audiencia', 'diligencia'],
    }).notNull(),
    titulo: text('titulo').notNull(),
    descripcion: text('descripcion'),
    fecha: text('fecha').notNull(), // YYYY-MM-DD
    hora: text('hora'), // HH:mm
    causaId: text('causa_id').references(() => causas.id),
    clienteId: text('cliente_id').references(() => clientes.id),
    origen: text('origen', {
      enum: ['manual', 'correo', 'sadje-regla'],
    }).notNull(),
    reglaId: text('regla_id').references(() => reglasPlazo.id),
    correoOrigenId: text('correo_origen_id'),
    estado: text('estado', {
      enum: ['pendiente', 'cumplido', 'cancelado'],
    })
      .notNull()
      .default('pendiente'),
    creadoPor: text('creado_por')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('idx_eventos_fecha').on(t.fecha),
    index('idx_eventos_causa').on(t.causaId),
    index('idx_eventos_regla_causa_fecha').on(t.reglaId, t.causaId, t.fecha),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// TAREAS  (Sección 4 — kanban)
// ─────────────────────────────────────────────────────────────────────────────

export const tareas = sqliteTable(
  'tareas',
  {
    id: id(),
    titulo: text('titulo').notNull(),
    descripcion: text('descripcion'),
    color: text('color').notNull().default('blue'),
    columna: text('columna', {
      enum: ['por_hacer', 'en_proceso', 'terminada'],
    })
      .notNull()
      .default('por_hacer'),
    orden: real('orden').notNull(), // ordering fraccional (PLAN §7.3)
    causaId: text('causa_id').references(() => causas.id),
    eventoId: text('evento_id').references(() => eventos.id),
    asignadoA: text('asignado_a').references(() => user.id),
    creadoPor: text('creado_por')
      .notNull()
      .references(() => user.id),
    documentoId: text('documento_id'),
    fechaLimite: text('fecha_limite'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('idx_tareas_columna_orden').on(t.columna, t.orden),
    index('idx_tareas_asignado').on(t.asignadoA),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS  (Sección 5 — editor colaborativo)
// ─────────────────────────────────────────────────────────────────────────────

export const documentos = sqliteTable('documentos', {
  id: id(),
  titulo: text('titulo').notNull(),
  tareaId: text('tarea_id').references(() => tareas.id),
  causaId: text('causa_id').references(() => causas.id),
  estado: text('estado', {
    enum: ['borrador', 'enviado', 'aprobado'],
  })
    .notNull()
    .default('borrador'),
  creadoPor: text('creado_por')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const documentoYjs = sqliteTable('documento_yjs', {
  documentoId: text('documento_id')
    .primaryKey()
    .references(() => documentos.id),
  estadoBinario: blob('estado_binario').notNull(),
  snapshotJson: text('snapshot_json'),
  updatedAt: updatedAt(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVOS  (adjuntos del expediente, Sección 2)
// ─────────────────────────────────────────────────────────────────────────────

export const archivos = sqliteTable(
  'archivos',
  {
    id: id(),
    causaId: text('causa_id')
      .notNull()
      .references(() => causas.id),
    nombreOriginal: text('nombre_original').notNull(),
    rutaRelativa: text('ruta_relativa').notNull(),
    mime: text('mime').notNull(),
    tamano: integer('tamano').notNull(),
    subidoPor: text('subido_por')
      .notNull()
      .references(() => user.id),
    indexadoRag: integer('indexado_rag', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('idx_archivos_causa').on(t.causaId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// RAG  (Sección 3 / 6)
//  El índice vectorial vive en la tabla virtual `rag_vec` (vec0), creada en
//  lib/db/post-migrate.ts porque Drizzle no modela tablas virtuales.
// ─────────────────────────────────────────────────────────────────────────────

export const ragChunks = sqliteTable(
  'rag_chunks',
  {
    id: id(),
    fuenteTipo: text('fuente_tipo', {
      enum: ['codigo', 'archivo_causa'],
    }).notNull(),
    fuenteId: text('fuente_id').notNull(),
    causaId: text('causa_id'),
    tituloFuente: text('titulo_fuente'),
    contenido: text('contenido').notNull(),
    embedding: blob('embedding'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_rag_chunks_fuente').on(t.fuenteTipo, t.fuenteId),
    index('idx_rag_chunks_causa').on(t.causaId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// CHAT IA  (Sección 3)
// ─────────────────────────────────────────────────────────────────────────────

export const conversaciones = sqliteTable('conversaciones', {
  id: id(),
  titulo: text('titulo').notNull(),
  causaId: text('causa_id').references(() => causas.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const mensajes = sqliteTable(
  'mensajes',
  {
    id: id(),
    conversacionId: text('conversacion_id')
      .notNull()
      .references(() => conversaciones.id),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    partsJson: text('parts_json', { mode: 'json' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_mensajes_conv').on(t.conversacionId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 6 — resumen de correos + tokens de Graph
// ─────────────────────────────────────────────────────────────────────────────

export const correosResumen = sqliteTable('correos_resumen', {
  id: id(),
  fecha: text('fecha').notNull(),
  resumenJson: text('resumen_json', { mode: 'json' }).notNull(),
  generadoAt: text('generado_at').notNull().$defaultFn(nowIso),
});

export const graphTokens = sqliteTable('graph_tokens', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  // refresh token cifrado con AES-256-GCM (ENCRYPTION_KEY)
  refreshTokenCifrado: text('refresh_token_cifrado').notNull(),
  homeAccountId: text('home_account_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Buzón IMAP de la oficina (Gmail) al que se reenvía el casillero. Una fila. */
export const imapCasillero = sqliteTable('imap_casillero', {
  id: text('id').primaryKey(), // 'oficina'
  host: text('host').notNull(),
  port: integer('port').notNull(),
  usuario: text('usuario').notNull(),
  passwordCifrado: text('password_cifrado').notNull(),
  configuradoPor: text('configurado_por')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Dedup de mails del casillero electrónico importados desde Outlook. */
export const correosCasillero = sqliteTable(
  'correos_casillero',
  {
    id: id(),
    graphMessageId: text('graph_message_id').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    causaId: text('causa_id').references(() => causas.id),
    internetMessageId: text('internet_message_id'),
    receivedAt: text('received_at'),
    asunto: text('asunto'),
    remitente: text('remitente'),
    cuerpo: text('cuerpo'),
    numeroJuicio: text('numero_juicio'),
    leido: integer('leido', { mode: 'boolean' }).notNull().default(false),
    leidoAt: text('leido_at'),
    estado: text('estado', { enum: ['ingestado', 'omitido', 'error'] }).notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('idx_correos_casillero_user').on(t.userId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ SADJE
// ─────────────────────────────────────────────────────────────────────────────

export const sadjeCache = sqliteTable('sadje_cache', {
  clave: text('clave').primaryKey(), // 'causa:<numero>' | 'busqueda:<hash>'
  payloadJson: text('payload_json', { mode: 'json' }).notNull(),
  expiraAt: text('expira_at').notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA / IDEMPOTENCIA / NOTIFICACIONES
// ─────────────────────────────────────────────────────────────────────────────

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    userId: text('user_id'),
    entidad: text('entidad').notNull(),
    entidadId: text('entidad_id').notNull(),
    accion: text('accion', { enum: ['create', 'update', 'delete'] }).notNull(),
    diffJson: text('diff_json', { mode: 'json' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_audit_entidad').on(t.entidad, t.entidadId),
    index('idx_audit_created').on(t.createdAt),
  ],
);

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  respuestaJson: text('respuesta_json', { mode: 'json' }),
  expiraAt: text('expira_at').notNull(),
});

export const notificaciones = sqliteTable(
  'notificaciones',
  {
    id: id(),
    userId: text('user_id').references(() => user.id), // null = broadcast
    tipo: text('tipo').notNull(),
    mensaje: text('mensaje').notNull(),
    link: text('link'),
    leida: integer('leida', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_notif_user_leida').on(t.userId, t.leida),
    index('idx_notif_created').on(t.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Tipos derivados
// ─────────────────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Causa = typeof causas.$inferSelect;
export type ParteProcesal = typeof partesProcesales.$inferSelect;
export type Actuacion = typeof actuaciones.$inferSelect;
export type Evento = typeof eventos.$inferSelect;
export type ReglaPlazo = typeof reglasPlazo.$inferSelect;
export type Feriado = typeof feriados.$inferSelect;
export type Tarea = typeof tareas.$inferSelect;
export type Documento = typeof documentos.$inferSelect;
export type Archivo = typeof archivos.$inferSelect;
export type RagChunk = typeof ragChunks.$inferSelect;
export type Conversacion = typeof conversaciones.$inferSelect;
export type Mensaje = typeof mensajes.$inferSelect;
export type Notificacion = typeof notificaciones.$inferSelect;
export type CorreoResumen = typeof correosResumen.$inferSelect;

export const schema = {
  user,
  session,
  account,
  verification,
  clientes,
  causas,
  partesProcesales,
  actuaciones,
  reglasPlazo,
  feriados,
  eventos,
  tareas,
  documentos,
  documentoYjs,
  archivos,
  ragChunks,
  conversaciones,
  mensajes,
  correosResumen,
  graphTokens,
  correosCasillero,
  sadjeCache,
  auditLog,
  idempotencyKeys,
  notificaciones,
};
