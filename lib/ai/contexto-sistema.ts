import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  causas,
  clientes,
  correosResumen,
  type Role,
} from '@/lib/db/schema';
import {
  buscarCausasLocal,
  causaPorNumero,
  expediente,
} from '@/lib/causas';
import { listarEventos, proximosEventos } from '@/lib/eventos';
import { listarTareasVivas } from '@/lib/tareas';
import {
  listarDocumentos,
  obtenerDocumentoDTO,
  obtenerSnapshot,
} from '@/lib/documentos';
import {
  abrirCorreoCasillero,
  listarCorreosCasillero,
} from '@/lib/outlook/casillero';
import { hoyISO, toYmd, fromYmd, addDays } from '@/lib/fechas';
import { textoDeTiptap } from '@/lib/ai/tiptap';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  abogado: 'Abogado/a',
  secretario: 'Secretario/a',
  asistente: 'Asistente',
};

export interface ActorContexto {
  userId: string;
  role: Role;
  userName: string;
}

function truncar(texto: string | null | undefined, max: number): string {
  if (!texto) return '—';
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Resumen compacto del sistema inyectado en cada turno del chat. */
export function contextoSistemaResumen(actor: ActorContexto): string {
  const hoy = hoyISO();
  const secciones: string[] = [
    '## Datos del sistema Alfa Abogados (tiempo real)',
    `Usuario: ${actor.userName} (${ROLE_LABEL[actor.role]}) · Fecha de hoy: ${hoy}`,
    '',
    resumenCausas(),
    '',
    resumenCalendario(),
    '',
    resumenTareas(actor),
    '',
    resumenDocumentos(),
    '',
    resumenCorreos(),
    '',
    'Usá las herramientas del sistema para consultar detalle (expediente completo, calendario por rango, tareas, documentos, correos). Los datos anteriores son un resumen; no inventes información que no esté aquí ni en el resultado de una herramienta.',
  ];
  return secciones.join('\n');
}

function resumenCausas(): string {
  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(causas)
    .where(isNull(causas.deletedAt))
    .get()?.n ?? 0;

  const recientes = db
    .select({
      id: causas.id,
      numeroJuicio: causas.numeroJuicio,
      materia: causas.materia,
      estado: causas.estado,
      clienteNombre: clientes.nombreCompleto,
    })
    .from(causas)
    .leftJoin(clientes, eq(clientes.id, causas.clienteId))
    .where(isNull(causas.deletedAt))
    .orderBy(desc(causas.updatedAt))
    .limit(15)
    .all();

  const lineas = recientes.map(
    (c) =>
      `  - [id:${c.id}] ${c.numeroJuicio} · ${c.clienteNombre ?? 'sin cliente'} · ${c.materia ?? '—'} · ${c.estado ?? '—'}`,
  );

  return [
    `### Causas (${total} activas)`,
    lineas.length ? lineas.join('\n') : '  (sin causas registradas)',
  ].join('\n');
}

function resumenCalendario(): string {
  const eventos = proximosEventos(14);
  const lineas = eventos.slice(0, 20).map((e) => {
    const hora = e.hora ? ` ${e.hora}` : '';
    const causa = e.causaNumero ? ` · ${e.causaNumero}` : '';
    const cliente = e.clienteNombre ? ` · ${e.clienteNombre}` : '';
    return `  - [id:${e.id}] ${e.fecha}${hora} (${e.tipo}) ${e.titulo}${causa}${cliente}`;
  });

  return [
    `### Calendario (próximos 14 días, ${eventos.length} eventos pendientes)`,
    lineas.length ? lineas.join('\n') : '  (sin eventos próximos)',
  ].join('\n');
}

function resumenTareas(actor: ActorContexto): string {
  const todas = listarTareasVivas().filter((t) => t.columna !== 'terminada');
  const mias = todas.filter((t) => t.asignadoA === actor.userId);
  const pendientes = todas.filter((t) => t.columna === 'por_hacer');
  const enProceso = todas.filter((t) => t.columna === 'en_proceso');

  const mostrar = [...mias, ...pendientes, ...enProceso]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .slice(0, 25);

  const lineas = mostrar.map((t) => {
    const limite = t.fechaLimite ? ` · vence ${t.fechaLimite}` : '';
    const causa = t.causaNumero ? ` · ${t.causaNumero}` : '';
    const asignado = t.asignadoNombre ? ` · ${t.asignadoNombre}` : ' · sin asignar';
    return `  - [id:${t.id}] [${t.columna}] ${t.titulo}${causa}${asignado}${limite}`;
  });

  return [
    `### Tareas (${pendientes.length} por hacer, ${enProceso.length} en proceso; ${mias.length} asignadas a ${actor.userName})`,
    lineas.length ? lineas.join('\n') : '  (sin tareas pendientes)',
  ].join('\n');
}

function resumenDocumentos(): string {
  const todos = listarDocumentos();
  const docs = todos.slice(0, 12);
  const lineas = docs.map(
    (d) =>
      `  - [id:${d.id}] «${d.titulo}» (${d.estado})${d.causaNumero ? ` · ${d.causaNumero}` : ''}${d.creadorNombre ? ` · ${d.creadorNombre}` : ''}`,
  );

  return [
    `### Documentos (${todos.length} activos; últimos ${docs.length})`,
    lineas.length ? lineas.join('\n') : '  (sin documentos)',
  ].join('\n');
}

function resumenCorreos(): string {
  const { correos, noLeidos } = listarCorreosCasillero();
  const recientes = correos.slice(0, 10);
  const lineas = recientes.map((c) => {
    const estado = c.leido ? '' : ' [NO LEÍDO]';
    const juicio = c.numeroJuicio ? ` · ${c.numeroJuicio}` : '';
    return `  - [id:${c.id}]${estado} ${c.receivedAt ?? '—'} · ${truncar(c.asunto, 80)} · ${truncar(c.remitente, 40)}${juicio}`;
  });

  const resumenDia = db
    .select({ resumenJson: correosResumen.resumenJson })
    .from(correosResumen)
    .where(eq(correosResumen.fecha, hoyISO()))
    .orderBy(desc(correosResumen.generadoAt))
    .get();

  let extra = '';
  if (resumenDia?.resumenJson) {
    const r = resumenDia.resumenJson as {
      grupos?: { categoria: string; cantidad: number }[];
    };
    if (r.grupos?.length) {
      extra = `\nResumen del día: ${r.grupos.map((g) => `${g.categoria} (${g.cantidad})`).join(', ')}`;
    }
  }

  return [
    `### Correos del casillero (${correos.length} importados, ${noLeidos} no leídos)${extra}`,
    lineas.length ? lineas.join('\n') : '  (sin correos importados)',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultas para herramientas del chat
// ─────────────────────────────────────────────────────────────────────────────

export function consultarCausasOficina(consulta: string) {
  const resultados = buscarCausasLocal(consulta.trim());
  return {
    total: resultados.length,
    causas: resultados.map((c) => ({
      id: c.id,
      numeroJuicio: c.numeroJuicio,
      cliente: c.clienteNombre,
      materia: c.materia,
      estado: c.estado,
      origen: c.origen,
      ultimaSincronizacion: c.ultimaSincronizacion,
    })),
  };
}

export function consultarExpediente(idOCNumero: string) {
  let causaId = idOCNumero.trim();
  const porNumero = causaPorNumero(idOCNumero);
  if (porNumero) causaId = porNumero.id;

  const exp = expediente(causaId);
  if (!exp) {
    const busqueda = buscarCausasLocal(idOCNumero);
    if (busqueda.length === 1) {
      const expUnico = expediente(busqueda[0]!.id);
      if (expUnico) return serializarExpediente(expUnico);
    }
    return {
      encontrado: false as const,
      sugerencias: busqueda.slice(0, 5).map((c) => ({
        id: c.id,
        numeroJuicio: c.numeroJuicio,
        cliente: c.clienteNombre,
      })),
    };
  }
  return serializarExpediente(exp);
}

function serializarExpediente(
  exp: NonNullable<ReturnType<typeof expediente>>,
) {
  return {
    encontrado: true as const,
    causa: exp.causa,
    partes: exp.partes.map((p) => ({
      tipo: p.tipo,
      nombre: p.nombre,
      representante: p.representante,
    })),
    actuaciones: exp.actuaciones.slice(0, 30).map((a) => ({
      fecha: a.fecha,
      tipo: a.tipo,
      detalle: truncar(a.detalle, 400),
      origen: a.origen,
    })),
    eventos: exp.eventos
      .filter((e) => e.estado === 'pendiente')
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        fecha: e.fecha,
        hora: e.hora,
        tipo: e.tipo,
        titulo: e.titulo,
        estado: e.estado,
      })),
    archivos: exp.archivos.map((a) => ({
      id: a.id,
      nombre: a.nombreOriginal,
      indexadoRag: a.indexadoRag,
    })),
    totales: {
      actuaciones: exp.actuaciones.length,
      eventos: exp.eventos.length,
      archivos: exp.archivos.length,
    },
  };
}

export function consultarCalendario(desde?: string, hasta?: string) {
  const inicio = desde?.trim() || hoyISO();
  const fin =
    hasta?.trim() || toYmd(addDays(fromYmd(inicio), 30));
  const eventos = listarEventos(inicio, fin);
  return {
    desde: inicio,
    hasta: fin,
    total: eventos.length,
    eventos: eventos.map((e) => ({
      id: e.id,
      fecha: e.fecha,
      hora: e.hora,
      tipo: e.tipo,
      titulo: e.titulo,
      descripcion: truncar(e.descripcion, 200),
      estado: e.estado,
      causaNumero: e.causaNumero,
      clienteNombre: e.clienteNombre,
      judicatura: e.judicatura,
    })),
  };
}

export function consultarTareas(filtros?: {
  columna?: 'por_hacer' | 'en_proceso' | 'terminada';
  soloMias?: boolean;
  causaId?: string;
  actor?: ActorContexto;
}) {
  let tareas = listarTareasVivas();
  if (filtros?.columna) {
    tareas = tareas.filter((t) => t.columna === filtros.columna);
  }
  if (filtros?.soloMias && filtros.actor) {
    tareas = tareas.filter((t) => t.asignadoA === filtros.actor!.userId);
  }
  if (filtros?.causaId) {
    tareas = tareas.filter((t) => t.causaId === filtros.causaId);
  }
  return {
    total: tareas.length,
    tareas: tareas.slice(0, 40).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      descripcion: truncar(t.descripcion, 200),
      columna: t.columna,
      fechaLimite: t.fechaLimite,
      causaNumero: t.causaNumero,
      asignadoNombre: t.asignadoNombre,
      tieneDocumento: t.tieneDocumento,
      documentoId: t.documentoId,
    })),
  };
}

export function consultarDocumentos(filtros?: {
  causaId?: string;
  estado?: 'borrador' | 'enviado' | 'aprobado';
  limite?: number;
}) {
  let docs = listarDocumentos();
  if (filtros?.causaId) docs = docs.filter((d) => d.causaId === filtros.causaId);
  if (filtros?.estado) docs = docs.filter((d) => d.estado === filtros.estado);
  const limite = filtros?.limite ?? 20;
  return {
    total: docs.length,
    documentos: docs.slice(0, limite).map((d) => ({
      id: d.id,
      titulo: d.titulo,
      estado: d.estado,
      causaNumero: d.causaNumero,
      creadorNombre: d.creadorNombre,
      updatedAt: d.updatedAt,
    })),
  };
}

export function leerDocumento(documentoId: string) {
  const doc = obtenerDocumentoDTO(documentoId);
  if (!doc) return { encontrado: false as const };
  const snapshot = obtenerSnapshot(documentoId);
  const texto = snapshot ? textoDeTiptap(snapshot) : '';
  return {
    encontrado: true as const,
    id: doc.id,
    titulo: doc.titulo,
    estado: doc.estado,
    causaNumero: doc.causaNumero,
    contenido: truncar(texto, 8000),
    vacio: !texto.trim(),
  };
}

export function consultarCorreos(filtros?: {
  soloNoLeidos?: boolean;
  limite?: number;
  correoId?: string;
}) {
  if (filtros?.correoId) {
    const detalle = abrirCorreoCasillero(filtros.correoId);
    if (!detalle) return { encontrado: false as const };
    return {
      encontrado: true as const,
      correo: {
        id: detalle.id,
        asunto: detalle.asunto,
        remitente: detalle.remitente,
        receivedAt: detalle.receivedAt,
        leido: detalle.leido,
        numeroJuicio: detalle.numeroJuicio,
        clienteNombre: detalle.clienteNombre,
        cuerpo: truncar(detalle.cuerpo, 6000),
      },
    };
  }

  const { correos, noLeidos } = listarCorreosCasillero();
  let lista = correos;
  if (filtros?.soloNoLeidos) lista = lista.filter((c) => !c.leido);
  const limite = filtros?.limite ?? 25;
  return {
    total: lista.length,
    noLeidos,
    correos: lista.slice(0, limite).map((c) => ({
      id: c.id,
      asunto: c.asunto,
      remitente: c.remitente,
      receivedAt: c.receivedAt,
      leido: c.leido,
      preview: c.preview,
      numeroJuicio: c.numeroJuicio,
      clienteNombre: c.clienteNombre,
      estado: c.estado,
    })),
  };
}
