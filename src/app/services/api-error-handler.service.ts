import { Injectable } from '@angular/core';
import {
  getSnowflakeUnavailableMessage,
  isSnowflakeUnavailable,
  toApiError
} from '@model/api-error.model';
import { ToastService } from './toast.service';

/**
 * Tratamento centralizado de erros HTTP da API Game4U.
 * 503 (lake/Snowflake) → aviso amigável, sem logout; 401 → fluxo existente de sessão.
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorHandlerService {
  private static readonly SNOWFLAKE_TOAST_DEDUP_MS = 4000;
  private snowflakeToastShownAt = 0;

  constructor(private toast: ToastService) {}

  handleApiError(error: unknown): void {
    if (isSnowflakeUnavailable(error)) {
      this.showSnowflakeUnavailableToast(error);
      return;
    }

    const apiError = toApiError(error);
    if (apiError.isUnauthorized) {
      return;
    }

    if (apiError.statusCode >= 400 && apiError.message) {
      this.toast.error(apiError.message, false);
      return;
    }

    this.toast.error('Algo deu errado. Tente novamente.', false);
  }

  /** Toast de aviso (amarelo) com deduplicação — não confundir com sessão expirada. */
  showSnowflakeUnavailableToast(error: unknown): void {
    const now = Date.now();
    if (now - this.snowflakeToastShownAt < ApiErrorHandlerService.SNOWFLAKE_TOAST_DEDUP_MS) {
      return;
    }

    this.snowflakeToastShownAt = now;
    this.toast.warning(getSnowflakeUnavailableMessage(error), 6000);
  }
}
