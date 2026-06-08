import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig, MatSnackBarRef } from '@angular/material/snack-bar';
import { take } from 'rxjs/operators';

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
    if (showContinuosMessage) {
      message = `${message}: Tente novamente ou contate o suporte!`;
    }

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

  /**
   * Toast com ação (ex.: "Trocar senha") de forma não invasiva.
   */
  action(
    message: string,
    actionLabel: string,
    options?: {
      duration?: number;
      panelClass?: string[];
      horizontalPosition?: MatSnackBarConfig['horizontalPosition'];
      verticalPosition?: MatSnackBarConfig['verticalPosition'];
      dismissOnOutsideClick?: boolean;
      showProgress?: boolean;
    }
  ) {
    const duration = options?.duration ?? 8000;
    const showProgress = options?.showProgress ?? duration > 0;

    const ref = this._snackBar.open(message, actionLabel, {
      ...this.defaultConfig,
      duration,
      panelClass: options?.panelClass ?? ['snackbar-alert'],
      horizontalPosition: options?.horizontalPosition ?? this.defaultConfig.horizontalPosition,
      verticalPosition: options?.verticalPosition ?? this.defaultConfig.verticalPosition,
    });

    if (options?.dismissOnOutsideClick) {
      this.attachDismissOnOutsideClick(ref);
    }

    if (showProgress) {
      this.attachProgressBar(ref, duration);
    }

    return ref;
  }

  private attachProgressBar(ref: MatSnackBarRef<unknown>, duration: number): void {
    ref.afterOpened().pipe(take(1)).subscribe(() => {
      const surfaces = document.querySelectorAll(
        '.mat-mdc-snack-bar-container .mdc-snackbar__surface, .mat-snack-bar-container .mat-simple-snackbar'
      );
      const surface = surfaces[surfaces.length - 1] as HTMLElement | undefined;
      if (!surface) {
        return;
      }

      surface.classList.add('snackbar-surface-with-progress');
      surface.style.setProperty('--snackbar-duration', `${duration}ms`);

      ref.afterDismissed().pipe(take(1)).subscribe(() => {
        surface.classList.remove('snackbar-surface-with-progress');
        surface.style.removeProperty('--snackbar-duration');
      });
    });
  }

  private attachDismissOnOutsideClick(ref: MatSnackBarRef<unknown>): void {
    let clickHandler: ((event: MouseEvent) => void) | null = null;

    const cleanup = () => {
      if (clickHandler) {
        document.removeEventListener('click', clickHandler, true);
        clickHandler = null;
      }
    };

    clickHandler = (event: MouseEvent) => {
      const target = event.target as Node;
      const containers = document.querySelectorAll(
        '.mat-mdc-snack-bar-container, .mat-snack-bar-container'
      );

      for (const container of Array.from(containers)) {
        if (container.contains(target)) {
          return;
        }
      }

      ref.dismiss();
      cleanup();
    };

    setTimeout(() => {
      if (clickHandler) {
        document.addEventListener('click', clickHandler, true);
      }
    }, 0);

    ref.afterDismissed().pipe(take(1)).subscribe(() => cleanup());
  }
}
