import {NgModule} from '@angular/core';
import {SeasonComponent} from './season.component';
import {SharedModule} from "../../../shared.module";
import {C4uCardModule} from "../../../components/c4u-card/c4u-card.module";
import {C4uNivelTemporadaModule} from "../../../components/c4u-nivel-temporada/c4u-nivel-temporada.module";
import {DatePipe} from "@angular/common";
import {LottieModule} from "ngx-lottie";
import {ModalPendingQuestsModule} from "../../../modals/modal-pending-quests/modal-pending-quests.module";
import {C4uSpinnerModule} from "../../../components/c4u-spinner/c4u-spinner.module";
import {C4uAnimacaoCidModule} from "../../../components/c4u-animacao-cid/c4u-animacao-cid.module";
import {ModalDetalheExecutorComponent} from "./modal-detalhe-executor/modal-detalhe-executor.component";

import {C4uModalModule} from "../../../components/c4u-modal/c4u-modal.module";
import {ModalGerenciarPontosAvulsosModule} from "../../../modals/modal-gerenciar-pontos-avulsos/modal-gerenciar-pontos-avulsos.module";
import {ModalSeasonFaqModule} from "../../../modals/modal-season-faq/modal-season-faq.module";

@NgModule({
  declarations: [
    SeasonComponent,
    ModalDetalheExecutorComponent,
  ],
  exports: [
    SeasonComponent
  ],
  imports: [
    ModalPendingQuestsModule,
    SharedModule,
    C4uCardModule,
    C4uNivelTemporadaModule,
    LottieModule,
    C4uSpinnerModule,
    C4uAnimacaoCidModule,
    C4uModalModule,
    ModalGerenciarPontosAvulsosModule,
    ModalSeasonFaqModule,
  ],
  providers: [
    DatePipe
  ]
})
export class SeasonModule {
}
