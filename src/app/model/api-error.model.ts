import { HttpErrorResponse } from '@angular/common/http';

/** Corpo JSON de erro exposto pelo backend (`HttpExceptionFilter`). */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  path?: string;
  timestamp?: string;
  errors?: string[];
}

/** Mensagem do backend quando o lake (Snowflake) está temporariamente indisponível. */
export const SNOWFLAKE_UNAVAILABLE_MESSAGE =
  'Não foi possível carregar os dados agora. Tente novamente em instantes.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: ApiErrorBody
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isSnowflakeUnavailable(): boolean {
    return this.statusCode === 503;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}

export function parseApiErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }

  const body = error.error;
  if (body && typeof body === 'object' && 'statusCode' in body) {
    return body as ApiErrorBody;
  }

  const message =
    body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : error.message;

  return {
    statusCode: error.status,
    message
  };
}

/** Identifica indisponibilidade temporária do lake (preferir `statusCode === 503`). */
export function isSnowflakeUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isSnowflakeUnavailable;
  }

  if (error instanceof HttpErrorResponse && error.status === 503) {
    return true;
  }

  const body = parseApiErrorBody(error);
  if (body?.statusCode === 503) {
    return true;
  }

  return body?.message === SNOWFLAKE_UNAVAILABLE_MESSAGE;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    const body = parseApiErrorBody(error);
    const statusCode = body?.statusCode ?? error.status;
    const message = body?.message ?? error.message ?? `HTTP ${error.status}`;
    return new ApiError(message, statusCode, body);
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 0);
  }

  return new ApiError('Algo deu errado. Tente novamente.', 0);
}

export function getSnowflakeUnavailableMessage(error: unknown): string {
  const body = parseApiErrorBody(error);
  const message = body?.message?.trim();
  return message || SNOWFLAKE_UNAVAILABLE_MESSAGE;
}
