import { TIPO_META } from '@/components/calendario/meta';
import { TIPOS_EVENTO } from '@/lib/schemas/evento';

/** Leyenda de colores, visible bajo el header (PLAN §4.1). */
export function Leyenda() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {TIPOS_EVENTO.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: TIPO_META[t].color }}
          />
          {TIPO_META[t].label}
        </span>
      ))}
    </div>
  );
}
