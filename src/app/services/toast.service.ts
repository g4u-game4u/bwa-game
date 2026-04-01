import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private defaultConfig = {
    horizontalPosition: 'end',
    verticalPosition: 'top',
    duration: 2000,
  } as MatSnackBarConfig;

  constructor(private _snackBar: MatSnackBar) {}

  success(message = '', duration = 2000) {
    this._snackBar.open(message, '', {
      panelClass: ['snackbar-success'],
      ...this.defaultConfig,
      duration,
    });
  }

  error(message = '', showContinuosMessage = true) {
    if (showContinuosMessage)
      message.concat(': Tente novamente ou contate o suporte!');

    this._snackBar.open(message, '', {
      panelClass: ['snackbar-error'],
      ...this.defaultConfig,
      duration: 5000,
    });
  }

  alert(message = '') {
    this._snackBar.open(message, '', {
      panelClass: ['snackbar-alert'],
      ...this.defaultConfig,
    });
  }

  warning(message = '') {
    this._snackBar.open(message, '', {
      panelClass: ['snackbar-warning'],
      ...this.defaultConfig,
      duration: 5000,
    });
  }
}
