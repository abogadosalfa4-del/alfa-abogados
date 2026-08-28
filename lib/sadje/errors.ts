/** El shape de la respuesta de e-SATJE no coincide con lo esperado (§5.2). */
export class SadjeSchemaError extends Error {
  constructor(
    message: string,
    readonly detalle?: unknown,
  ) {
    super(message);
    this.name = 'SadjeSchemaError';
  }
}

/** e-SATJE no responde (timeout, 4xx/5xx tras reintentos). */
export class SadjeUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'SadjeUnavailableError';
  }
}
