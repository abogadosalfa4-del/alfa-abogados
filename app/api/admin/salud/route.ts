import { handleErrors, ok, requireRole } from '@/lib/http';
import { snapshotSalud } from '@/lib/salud';

export function GET() {
  return handleErrors(async () => {
    await requireRole('admin');
    return ok(snapshotSalud());
  });
}
