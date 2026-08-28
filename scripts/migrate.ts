import { runMigrations } from '@/lib/db/migrate';

runMigrations();
console.log('✓ Migraciones aplicadas');
process.exit(0);
