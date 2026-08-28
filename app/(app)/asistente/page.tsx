import { IA_DISPONIBLE } from '@/lib/ai/gemini';
import { Asistente } from '@/components/chat/asistente';

export const metadata = { title: 'Asistente IA' };

export default function AsistentePage() {
  return <Asistente iaDisponible={IA_DISPONIBLE} />;
}
