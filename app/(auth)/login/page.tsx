import { redirect } from 'next/navigation';

export const metadata = { title: 'Iniciar sesión' };

/** El despacho corre sin login; /login redirige al calendario. */
export default function LoginPage() {
  redirect('/calendario');
}
