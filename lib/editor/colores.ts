/**
 * Color de cursor por usuario (PLAN §8.1): hash del userId sobre una paleta
 * fija. Determinista: el mismo usuario siempre tiene el mismo color.
 */
const PALETA = [
  '#2563eb', // azul
  '#dc2626', // rojo
  '#16a34a', // verde
  '#d97706', // ámbar
  '#7c3aed', // violeta
  '#0891b2', // cian
  '#db2777', // rosa
  '#4b5563', // gris
] as const;

export function colorDeUsuario(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  return PALETA[Math.abs(h) % PALETA.length]!;
}
