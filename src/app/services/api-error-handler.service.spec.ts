import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorHandlerService } from './api-error-handler.service';
import { ToastService } from './toast.service';
import { SNOWFLAKE_UNAVAILABLE_MESSAGE } from '@model/api-error.model';

describe('ApiErrorHandlerService', () => {
  let service: ApiErrorHandlerService;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    toast = jasmine.createSpyObj('ToastService', ['warning', 'error']);

    TestBed.configureTestingModule({
      providers: [
        ApiErrorHandlerService,
        { provide: ToastService, useValue: toast }
      ]
    });

    service = TestBed.inject(ApiErrorHandlerService);
  });

  it('showSnowflakeUnavailableToast uses warning with backend message', () => {
    const err = new HttpErrorResponse({
      status: 503,
      error: { statusCode: 503, message: SNOWFLAKE_UNAVAILABLE_MESSAGE }
    });

    service.showSnowflakeUnavailableToast(err);
    service.showSnowflakeUnavailableToast(err);

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(SNOWFLAKE_UNAVAILABLE_MESSAGE, 6000);
  });

  it('handleApiError does not toast on 401', () => {
    const err = new HttpErrorResponse({
      status: 401,
      error: { statusCode: 401, message: 'Unauthorized' }
    });

    service.handleApiError(err);

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleApiError shows generic error for unknown failures', () => {
    service.handleApiError(new Error('boom'));

    expect(toast.error).toHaveBeenCalledWith('boom', false);
  });
});
