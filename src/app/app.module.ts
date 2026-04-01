import { NgModule, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
// import {ToastrModule} from 'ngx-toastr';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './layout/app/app.component';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { MainModule } from './layout/main/main.module';
import { CustomTranslateLoader } from './providers/custom-translate-loader';
import { Chart, registerables } from 'chart.js';
import { LottieModule } from 'ngx-lottie';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { SemPermissaoComponent } from './layout/sem-permissao/sem-permissao.component';
import { SharedModule } from './shared.module';
import { BreveComponent } from './layout/breve/breve.component';
import { C4uAnimacaoCidModule } from './components/c4u-animacao-cid/c4u-animacao-cid.module';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { C4uSpinnerModule } from '@components/c4u-spinner/c4u-spinner.module';
import { AuthInterceptor } from './providers/auth.interceptor';
import { NotificationService } from './services/notification.service';
import { OverlayModule } from '@angular/cdk/overlay';

Chart.register(...registerables);

@NgModule({
  declarations: [AppComponent, SemPermissaoComponent, BreveComponent],
  imports: [
    BrowserAnimationsModule,
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useClass: CustomTranslateLoader,
      },
      defaultLanguage: 'pt-BR',
    }),
    MainModule,
    LottieModule.forRoot({player: () => import('lottie-web')}),
    NgbModule,
    SharedModule,
    C4uAnimacaoCidModule,
    MatSnackBarModule,
    C4uSpinnerModule,
    OverlayModule,
    // ToastrModule.forRoot({
    //   timeOut: 5000,
    //   positionClass: 'toast-top-right',
    //   preventDuplicates: true,
    //   closeButton: true,
    //   progressBar: true,
    //   progressAnimation: 'decreasing',
    //   enableHtml: true,
    //   newestOnTop: true,
    //   tapToDismiss: true
    // })
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: LOCALE_ID,
      useValue: 'pt-BR'
    },
    NotificationService
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
