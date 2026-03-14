import {Component, OnInit} from '@angular/core';
import {SessaoProvider} from "@providers/sessao/sessao.provider";
import {Router} from "@angular/router";
import {LoadingProvider} from "@providers/loading.provider";
import {ToastService} from "@services/toast.service";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {SystemParamsService} from "@services/system-params.service";
import { SystemParams } from '@model/system-params.model';
import {AuthProvider} from "@providers/auth/auth.provider";
import {AbstractControl, ValidationErrors} from "@angular/forms";
import {TranslateService} from "@ngx-translate/core";
import { LoginLogService } from '@services/login-log.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  clientLogoUrl: string | null = null;
  clientName: string = '';
  isLoading: boolean = false;
  loadingText: string = 'Entrando...';
  systemParams: SystemParams | null = null;

  private loadingTexts: string[] = [
    'Entrando...',
    'Preparando...',
    'Carregando...',
    'Quase lá...',
    'Aguarde...',
    'Processando...'
  ];
  private loadingTextInterval: any;
  loginBackgroundUrl: string | null = null;

  constructor(private sessao: SessaoProvider, private router: Router, private loadingProvider: LoadingProvider,
              private toastService: ToastService, private systemParamsService: SystemParamsService,
              private authProvider: AuthProvider, private translate: TranslateService,
              private loginLogService: LoginLogService) {
  }

  // Estado do fluxo: 'login' | 'reset-request' | 'reset-confirm'
  resetFlow: 'login' | 'reset-request' | 'reset-confirm' = 'login';
  resetEmail: string = '';

  form: FormGroup = new FormGroup({
    username: new FormControl('', Validators.required),
    password: new FormControl('', Validators.required)
  });

  resetRequestForm: FormGroup = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email])
  });

  resetConfirmForm: FormGroup = new FormGroup({
    code: new FormControl('', [Validators.required, Validators.minLength(6)]),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required])
  }, { validators: this.passwordMatchValidator });

  get username() {
    return this.form.get('username')?.value;
  }

  get password() {
    return this.form.get('password')?.value;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');
    
    if (!newPassword || !confirmPassword) {
      return null;
    }
    
    return newPassword.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  get resetRequestEmail() {
    return this.resetRequestForm.get('email')?.value;
  }

  get resetConfirmCode() {
    return this.resetConfirmForm.get('code')?.value;
  }

  get resetConfirmNewPassword() {
    return this.resetConfirmForm.get('newPassword')?.value;
  }

  get resetConfirmPasswordMatch() {
    return this.resetConfirmForm.errors?.['passwordMismatch'];
  }

  async ngOnInit() {
    try {
      // Inicializa os parâmetros do sistema no primeiro acesso
      // Isso carrega informações como logo, cores, etc. mesmo sem autenticação
      this.systemParams = await this.systemParamsService.initializeSystemParams();
            // Carrega informações específicas do cliente
      await this.loadClientInfo();
      // await this.setLoginBackgroundUrl();
    } catch (error) {
      // Apenas loga, não bloqueia o login
            this.clientLogoUrl = '/assets/images/game4u_logo.png';
      this.clientName = 'Game';
      // Se quiser, defina um fallback para o background também:
      // this.loginBackgroundUrl = null;
    }
  }

  /**
   * Carrega informações específicas do cliente (logo, nome, etc.)
   */
  private async loadClientInfo() {
    try {
      // Obtém o nome do cliente
      this.clientName = await this.systemParamsService.getParam<string>('client_name') || '';
      
      // Obtém a URL da logo (tenta logo claro primeiro, depois escuro)
      this.clientLogoUrl = await this.systemParamsService.getParam<string>('client_dark_logo_url') || null;
      
          } catch (error) {
          }
  }

  // private async setLoginBackgroundUrl() {
  //   let url = await this.systemParamsService.getParam<string>('client_login_background_url' as any) || null;
  //   if (typeof url === 'string' && url.trim() !== '') {
  //     this.loginBackgroundUrl = url;
  //   } else {
  //     this.loginBackgroundUrl = 'https://images.pexels.com/photos/12489125/pexels-photo-12489125.jpeg?_gl=1*1pp4j7i*_ga*MTMyMTg4NDMzOS4xNzUwOTY5MjQy*_ga_8JE65Q40S6*czE3NTA5NjkyNDEkbzEkZzEkdDE3NTA5NzA2MDEkajQzJGwwJGgw';
  //   }
  // }

  get maintenanceMode(): boolean {
    return !!environment.maintenanceMode;
  }

  async submit() {
    if (this.maintenanceMode) {
      this.toastService.error('Sistema em manutenção. Você será avisado pelos canais oficiais de comunicação quando terminar.');
      return;
    }

                if (this.username && this.password) {
      this.isLoading = true;
      this.form.disable(); // Disable form controls
      this.startLoadingTextAnimation();
      try {
                let user = await this.sessao.login(this.username, this.password);
                        if (user) {
          // Track login event in Vercel Analytics (non-blocking)
          this.loginLogService.logLogin(this.username).catch(error => {
            // Silently fail - don't block login if tracking fails
                      });
          
          // Wait a bit to ensure state is fully updated
          await new Promise(resolve => setTimeout(resolve, 100));
                    const navigationResult = await this.router.navigate(['/']);
                  } else {
          this.toastService.error("Usuário ou senha incorretos");
        }
      } catch (error: any) {
                // Check if it's a timeout error
        if (error?.name === 'TimeoutError' || error?.message?.includes('timeout')) {
          this.toastService.error("Tempo de conexão esgotado. Verifique sua conexão e tente novamente.");
        } else if (error?.status === 401 || error?.status === 403) {
          this.toastService.error("Usuário ou senha incorretos");
        } else if (error?.status === 0 || error?.message?.includes('Network')) {
          this.toastService.error("Erro de conexão. Verifique sua internet e tente novamente.");
        } else {
          this.toastService.error("Erro ao fazer login. Tente novamente.");
        }
      } finally {
        this.stopLoadingTextAnimation();
        this.isLoading = false;
        this.form.enable(); // Re-enable form controls
      }
    } else {
          }
  }

  private startLoadingTextAnimation() {
    let index = 0;
    this.loadingText = this.loadingTexts[0];
    this.loadingTextInterval = setInterval(() => {
      index = (index + 1) % this.loadingTexts.length;
      this.loadingText = this.loadingTexts[index];
    }, 1500);
  }

  private stopLoadingTextAnimation() {
    if (this.loadingTextInterval) {
      clearInterval(this.loadingTextInterval);
      this.loadingTextInterval = null;
    }
  }

  startPasswordReset() {
    this.resetFlow = 'reset-request';
    this.resetRequestForm.reset();
    this.resetRequestForm.enable(); // Ensure form is enabled
  }

  backToLogin() {
    this.resetFlow = 'login';
    this.form.enable(); // Ensure form is enabled
    this.resetRequestForm.reset();
    this.resetRequestForm.enable(); // Ensure form is enabled
    this.resetConfirmForm.reset();
    this.resetConfirmForm.enable(); // Ensure form is enabled
    this.resetEmail = '';
  }

  async requestResetCode() {
    if (this.resetRequestForm.valid && this.resetRequestEmail) {
            this.isLoading = true;
      this.resetRequestForm.disable(); // Disable form controls
      this.loadingText = this.translate.instant('LOADING_SENDING_CODE');
      try {
        await this.authProvider.requestPasswordReset(this.resetRequestEmail);
        this.resetEmail = this.resetRequestEmail;
        this.resetFlow = 'reset-confirm';
        this.resetConfirmForm.reset();
        this.toastService.success(this.translate.instant('MESSAGE_CODE_SENT'));
      } catch (error: any) {
        const errorMessage = error?.error?.message || this.translate.instant('ERROR_RESET_CODE_REQUEST');
        this.toastService.error(errorMessage);
      } finally {
        this.isLoading = false;
        this.resetRequestForm.enable(); // Re-enable form controls
      }
    }
  }

  async confirmResetPassword() {
    if (this.resetConfirmForm.valid && !this.resetConfirmForm.hasError('passwordMismatch')) {
      this.isLoading = true;
      this.resetConfirmForm.disable(); // Disable form controls
      this.loadingText = this.translate.instant('LOADING_RESETTING_PASSWORD');
      try {
        await this.authProvider.resetPassword(
          this.resetEmail,
          this.resetConfirmCode,
          this.resetConfirmNewPassword
        );
        this.toastService.success(this.translate.instant('MESSAGE_PASSWORD_RESET_SUCCESS'));
        this.backToLogin();
      } catch (error: any) {
        const errorMessage = error?.error?.message || this.translate.instant('ERROR_RESET_PASSWORD');
        this.toastService.error(errorMessage);
      } finally {
        this.isLoading = false;
        this.resetConfirmForm.enable(); // Re-enable form controls
      }
    }
  }

  // get loginBackgroundStyle() {
  //   return { backgroundImage: `url('${this.loginBackgroundUrl}')` };
  // }
}

