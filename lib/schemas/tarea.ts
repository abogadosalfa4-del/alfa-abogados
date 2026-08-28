import { z } from 'zod';

export const COLUMNAS = ['por_hacer', 'en_proceso', 'terminada'] as const;
export type Columna = (typeof COLUMNAS)[number];

export const COLUMNA_LABEL: Record<Columna, string> = {
  por_hacer: 'Por hacer',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
};

/** 6 colores fijos del tema (PLAN §7.1). */
export const COLORES = ['blue', 'red', 'green', 'amber', 'violet', 'slate'] as const;
export type Color = (typeof COLORES)[number];

export const COLOR_BARRA: Record<Color, string> = {
  blue: 'bg-primary',
  red: 'bg-destructive',
  green: 'bg-emerald-600',
  amber: 'bg-warning',
  violet: 'bg-violet-600',
  slate: 'bg-slate-500',
};

const fechaYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD')
  .optional()
  .nullable();

export const tareaCreateSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(200),
  descripcion: z.string().trim().max(4000).optional().nullable(),
  color: z.enum(COLORES).default('blue'),
  columna: z.enum(COLUMNAS).default('por_hacer'),
  causaId: z.string().uuid().optional().nullable(),
  asignadoA: z.string().optional().nullable(),
  fechaLimite: fechaYmd,
});
export type TareaCreate = z.infer<typeof tareaCreateSchema>;

export const tareaUpdateSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  descripcion: z.string().trim().max(4000).optional().nullable(),
  color: z.enum(COLORES).optional(),
  causaId: z.string().uuid().optional().nullable(),
  asignadoA: z.string().optional().nullable(),
  fechaLimite: fechaYmd,
});
export type TareaUpdate = z.infer<typeof tareaUpdateSchema>;

/** Movimiento en el tablero: columna destino + orden fraccional. */
export const tareaMoverSchema = z.object({
  columna: z.enum(COLUMNAS),
  orden: z.number().finite(),
});
export type TareaMover = z.infer<typeof tareaMoverSchema>;
