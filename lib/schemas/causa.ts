import { z } from 'zod';

/** Con guiones, letra final opcional (penal/violencia: `01571-2026-00963G`). */
export const NUMERO_JUICIO_RE = /^\d{5}-\d{4}-\d{4,5}[A-Za-z]?$/;

/**
 * Id compacto que usa el API: `01333202609535` o `01571202600963G`.
 * Acepta también la forma con guiones.
 */
export function compactarNumeroJuicio(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  const dashed = t.match(/^(\d{5})-(\d{4})-(\d{4,5})([A-Z])?$/);
  if (dashed) return `${dashed[1]}${dashed[2]}${dashed[3]}${dashed[4] ?? ''}`;
  const compact = t.match(/^(\d{13,14})([A-Z])?$/);
  if (!compact) return null;
  const digits = compact[1]!;
  const anio = Number(digits.slice(5, 9));
  if (anio < 1980 || anio > 2100) return null;
  return `${digits}${compact[2] ?? ''}`;
}

export function formatearNumeroJuicio(id: string): string {
  const t = id.trim().toUpperCase();
  const letra = /[A-Z]$/.test(t) ? t.slice(-1) : '';
  const d = t.replace(/\D/g, '');
  if (d.length >= 13) return `${d.slice(0, 5)}-${d.slice(5, 9)}-${d.slice(9)}${letra}`;
  return t;
}

export function clasificarConsultaCausa(raw: string): {
  tipo: 'juicio' | 'cedula' | 'nombre';
  valor: string;
} {
  const t = raw.trim();
  const juicio = compactarNumeroJuicio(t);
  if (juicio) return { tipo: 'juicio', valor: juicio };
  const digits = t.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 13) {
    return { tipo: 'cedula', valor: digits };
  }
  return { tipo: 'nombre', valor: t };
}

const parteSchema = z.object({
  tipo: z.enum(['actor', 'demandado', 'tercero']),
  nombre: z.string().trim().min(1).max(300),
  representante: z.string().trim().max(300).optional().nullable(),
});

const actuacionInicialSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.string().trim().min(1).max(200),
  detalle: z.string().trim().min(1).max(20_000),
});

export const causaManualSchema = z.object({
  numeroJuicio: z.string().regex(NUMERO_JUICIO_RE, 'Formato: 01204-2025-00334 o 01571-2026-00963G'),
  clienteId: z.string().uuid().optional().nullable(),
  clienteNombre: z.string().trim().max(300).optional().nullable(),
  tipoAccion: z.string().trim().max(200).optional().nullable(),
  materia: z.string().trim().max(200).optional().nullable(),
  judicatura: z.string().trim().max(300).optional().nullable(),
  estado: z.string().trim().max(200).optional().nullable(),
  fechaIngreso: z.string().trim().max(30).optional().nullable(),
  partes: z.array(parteSchema).max(30).default([]),
  actuaciones: z.array(actuacionInicialSchema).max(50).default([]),
});
export type CausaManual = z.infer<typeof causaManualSchema>;

export const causaUpdateSchema = z.object({
  clienteId: z.string().uuid().optional().nullable(),
  tipoAccion: z.string().trim().max(200).optional().nullable(),
  materia: z.string().trim().max(200).optional().nullable(),
  judicatura: z.string().trim().max(300).optional().nullable(),
  estado: z.string().trim().max(200).optional().nullable(),
});
export type CausaUpdate = z.infer<typeof causaUpdateSchema>;

export const buscarSadjeSchema = z
  .object({
    numeroJuicio: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? compactarNumeroJuicio(s) ?? undefined : undefined)),
    cedula: z.string().trim().min(5).max(20).optional(),
    nombre: z.string().trim().min(3).max(120).optional(),
  })
  .transform((v) => {
    if (v.numeroJuicio || v.cedula || !v.nombre) return v;
    const comoJuicio = compactarNumeroJuicio(v.nombre);
    if (comoJuicio) return { numeroJuicio: comoJuicio, cedula: undefined, nombre: undefined };
    const digits = v.nombre.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 13) {
      return { numeroJuicio: undefined, cedula: digits, nombre: undefined };
    }
    return v;
  })
  .refine((v) => v.numeroJuicio || v.cedula || v.nombre, {
    message: 'Indicá número de juicio, cédula o nombre',
  });
export type BuscarSadje = z.infer<typeof buscarSadjeSchema>;
