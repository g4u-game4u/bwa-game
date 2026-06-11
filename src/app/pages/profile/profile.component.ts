import { Component, OnInit } from '@angular/core';
import { AuthProvider } from '@providers/auth/auth.provider';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from '@services/toast.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  userEmail = '';
  isLoading = false;

  constructor(
    private sessao: SessaoProvider,
    private authProvider: AuthProvider,
    private toastService: ToastService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.userEmail = this.sessao.usuario?.email ?? '';
  }

  async sendPasswordResetLink(): Promise<void> {
    const email = this.userEmail?.trim();
    if (!email) {
      this.toastService.error(this.translate.instant('ERROR_PROFILE_EMAIL_UNAVAILABLE'));
      return;
    }

    this.isLoading = true;
    try {
      await this.authProvider.requestPasswordReset(email);
      this.toastService.success(this.translate.instant('MESSAGE_PASSWORD_RESET_EMAIL_SENT'));
    } catch (error: any) {
      const errorMessage =
        error?.error?.message || this.translate.instant('ERROR_RESET_CODE_REQUEST');
      this.toastService.error(errorMessage);
    } finally {
      this.isLoading = false;
    }
  }
}
