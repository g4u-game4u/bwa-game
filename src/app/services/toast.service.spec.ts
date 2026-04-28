import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      providers: [
        ToastService,
        { provide: MatSnackBar, useValue: spy }
      ]
    });

    service = TestBed.inject(ToastService);
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('success', () => {
    it('should display success message with default duration', () => {
      const message = 'Operation successful';
      service.success(message);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        message,
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-success'],
          duration: 2000
        })
      );
    });

    it('should display success message with custom duration', () => {
      const message = 'Operation successful';
      const duration = 5000;
      service.success(message, duration);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        message,
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-success'],
          duration: 5000
        })
      );
    });

    it('should handle empty message', () => {
      service.success();

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        '',
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-success']
        })
      );
    });
  });

  describe('error', () => {
    it('should display error message with default duration', () => {
      const message = 'Operation failed';
      service.error(message);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        message,
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-error'],
          duration: 5000
        })
      );
    });

    it('should handle empty message', () => {
      service.error();

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        '',
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-error']
        })
      );
    });

    it('should display error with longer duration than success', () => {
      service.error('Error message');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        jasmine.any(String),
        '',
        jasmine.objectContaining({
          duration: 5000
        })
      );
    });
  });

  describe('alert', () => {
    it('should display alert message', () => {
      const message = 'Important alert';
      service.alert(message);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        message,
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-alert']
        })
      );
    });

    it('should handle empty message', () => {
      service.alert();

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        '',
        '',
        jasmine.objectContaining({
          panelClass: ['snackbar-alert']
        })
      );
    });
  });

  describe('action', () => {
    it('should display action toast with label', () => {
      const message = 'Need action';
      const actionLabel = 'Do it';
      service.action(message, actionLabel);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        message,
        actionLabel,
        jasmine.objectContaining({
          duration: 8000,
        })
      );
    });
  });

  describe('configuration', () => {
    it('should use correct horizontal position', () => {
      service.success('test');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        jasmine.any(String),
        '',
        jasmine.objectContaining({
          horizontalPosition: 'end'
        })
      );
    });

    it('should use correct vertical position', () => {
      service.success('test');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        jasmine.any(String),
        '',
        jasmine.objectContaining({
          verticalPosition: 'top'
        })
      );
    });
  });
});
