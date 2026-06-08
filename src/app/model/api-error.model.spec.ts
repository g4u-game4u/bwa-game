import { HttpErrorResponse } from '@angular/common/http';
import {
  ApiError,
  SNOWFLAKE_UNAVAILABLE_MESSAGE,
  getSnowflakeUnavailableMessage,
  isSnowflakeUnavailable,
  toApiError
} from './api-error.model';

describe('api-error.model', () => {
  it('isSnowflakeUnavailable detects HttpErrorResponse 503', () => {
    const err = new HttpErrorResponse({
      status: 503,
      error: {
        statusCode: 503,
        message: SNOWFLAKE_UNAVAILABLE_MESSAGE
      }
    });
    expect(isSnowflakeUnavailable(err)).toBe(true);
  });

  it('isSnowflakeUnavailable detects message constant without status', () => {
    const err = new HttpErrorResponse({
      status: 500,
      error: {
        statusCode: 500,
        message: SNOWFLAKE_UNAVAILABLE_MESSAGE
      }
    });
    expect(isSnowflakeUnavailable(err)).toBe(true);
  });

  it('isSnowflakeUnavailable is false for 401', () => {
    const err = new HttpErrorResponse({
      status: 401,
      error: { statusCode: 401, message: 'Unauthorized' }
    });
    expect(isSnowflakeUnavailable(err)).toBe(false);
  });

  it('toApiError wraps HttpErrorResponse', () => {
    const err = new HttpErrorResponse({
      status: 503,
      error: {
        statusCode: 503,
        message: SNOWFLAKE_UNAVAILABLE_MESSAGE,
        path: '/game/reports/user-actions'
      }
    });
    const apiError = toApiError(err);
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.statusCode).toBe(503);
    expect(apiError.isSnowflakeUnavailable).toBe(true);
    expect(apiError.body?.path).toContain('user-actions');
  });

  it('getSnowflakeUnavailableMessage falls back to constant', () => {
    const err = new HttpErrorResponse({ status: 503, error: {} });
    expect(getSnowflakeUnavailableMessage(err)).toBe(SNOWFLAKE_UNAVAILABLE_MESSAGE);
  });
});
