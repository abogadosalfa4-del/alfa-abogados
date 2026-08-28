/**
 * Errores tipados de dominio (PLAN §0.1.12). Sin dependencias de Next para que
 * los servicios (`lib/*.ts`) y el servidor custom puedan importarlos sin
 * arrastrar `next/headers`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errores = {
  noAutenticado: () => new HttpError(401, 'no_autenticado', 'Iniciá sesión.'),
  sinPermiso: () =>
    new HttpError(403, 'sin_permiso', 'No tenés permiso para esta acción.'),
  noEncontrado: (que = 'recurso') =>
    new HttpError(404, 'no_encontrado', `No se encontró el ${que}.`),
  validacion: (msg: string) => new HttpError(422, 'validacion', msg),
  conflicto: (msg: string) => new HttpError(409, 'conflicto', msg),
};
