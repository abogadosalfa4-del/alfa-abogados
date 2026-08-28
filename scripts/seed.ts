import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { runMigrations } from '@/lib/db/migrate';
import { crearUsuario, existeAlgunAdmin } from '@/lib/auth-admin';
import { seedFeriados } from '@/lib/feriados';
import { seedReglasPlazo } from '@/lib/sadje/reglas-seed';

/**
 * `npm run seed` (PLAN §3): aplica migraciones, siembra feriados + reglas de
 * plazo por defecto, y crea el usuario admin inicial.
 *
 * Credenciales: por stdin, o vía env para uso no interactivo:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */

async function ask(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

async function main() {
  console.log('▸ Aplicando migraciones…');
  runMigrations();

  const fer = seedFeriados();
  const reg = seedReglasPlazo();
  console.log(`▸ Feriados sembrados: ${fer} · reglas de plazo: ${reg}`);

  if (await existeAlgunAdmin()) {
    console.log('✓ Ya existe al menos un usuario admin. No se crea otro.');
    return;
  }

  console.log('\nNo hay usuarios admin. Vamos a crear el primero.\n');

  const envEmail = process.env.SEED_ADMIN_EMAIL;
  const envPass = process.env.SEED_ADMIN_PASSWORD;
  const envName = process.env.SEED_ADMIN_NAME;

  const email = envEmail ?? (await ask('Correo del admin', 'admin@bufete.local'));
  const name = envName ?? (await ask('Nombre completo', 'Administrador'));
  let password = envPass ?? '';
  if (!password) {
    password = await ask('Contraseña (mín. 8 caracteres)', '');
    const repeat = await ask('Repetir contraseña', '');
    if (password !== repeat) {
      console.error('✖ Las contraseñas no coinciden.');
      process.exit(1);
    }
  }
  if (password.length < 8) {
    console.error('✖ La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const nuevo = await crearUsuario({ nombre: name, email, password, role: 'admin' });
  console.log(`\n✓ Admin creado: ${nuevo.email} (${nuevo.id})`);
  console.log('  Iniciá sesión en /login y creá el resto del equipo desde /admin/usuarios.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✖ Error en el seed:', err);
    process.exit(1);
  });
