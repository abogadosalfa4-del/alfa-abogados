import Link from 'next/link';
import { Users, Gavel, CalendarOff, BookText } from 'lucide-react';
import { EstadoDashboard } from '@/components/admin/estado-dashboard';

export const metadata = { title: 'Administración' };

const SECCIONES = [
  { href: '/admin/usuarios', icon: Users, titulo: 'Usuarios', desc: 'Crear cuentas del equipo y asignar roles.' },
  { href: '/admin/reglas', icon: Gavel, titulo: 'Reglas de plazo', desc: 'Motor de plazos COGEP: triggers, días y eventos generados.' },
  { href: '/admin/feriados', icon: CalendarOff, titulo: 'Feriados', desc: 'Días no hábiles para el cálculo de plazos.' },
  { href: '/admin/codigos', icon: BookText, titulo: 'Códigos legales', desc: 'Carga de PDFs para el asistente IA (Fase 6).' },
];

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-lg font-semibold">Administración</h1>
      <EstadoDashboard />
      <div className="grid gap-3 sm:grid-cols-2">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex gap-3 rounded-lg border bg-card p-4 hover:bg-accent/40"
          >
            <s.icon className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">{s.titulo}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
