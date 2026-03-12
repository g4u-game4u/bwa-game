import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Reward } from '../rewards-store/rewards-store.component';
import { SessaoProvider } from 'src/app/providers/sessao/sessao.provider';
import { NotificationService } from 'src/app/services/notification.service';
import { RecompensasService, PurchaseRequest } from 'src/app/services/recompensas.service';

@Component({
  selector: 'app-reward-redeem-modal',
  templateUrl: './reward-redeem-modal.component.html',
  styleUrls: ['./reward-redeem-modal.component.scss']
})
export class RewardRedeemModalComponent {
  @Input() reward!: Reward;
  currentStep = 1;
  isProcessing = false;

  constructor(
    private activeModal: NgbActiveModal,
    private sessao: SessaoProvider,
    private notificationService: NotificationService,
    private recompensasService: RecompensasService
  ) {
    }

  close() {
    this.activeModal.close();
  }

  nextStep() {
    // Verifica se o usuÃ¡rio tem moedas suficientes
    const currentCoins = parseFloat(localStorage.getItem('coins') || '0');
    if (currentCoins >= this.reward.cost) {
      this.currentStep = 2;
    } else {
      this.notificationService.showSuccess(`Moedas insuficientes! VocÃª tem ${currentCoins} moedas e precisa de ${this.reward.cost} moedas.`, false);
    }
  }

  previousStep() {
    this.currentStep = 1;
  }

  confirmRedeem() {
    if (this.isProcessing) {
      return; // Evita mÃºltiplas chamadas
    }

    this.isProcessing = true;

    // ObtÃ©m o saldo atual de moedas
    const currentCoins = parseFloat(localStorage.getItem('coins') || '0');
    if (currentCoins < this.reward.cost) {
      this.notificationService.showSuccess(`Moedas insuficientes! VocÃª tem ${currentCoins} moedas e precisa de ${this.reward.cost} moedas.`, false);
      this.isProcessing = false;
      return;
    }

    // ObtÃ©m o e-mail do usuÃ¡rio
    const userEmail = this.sessao.usuario?.email || 'unknown';
    // Prepara o payload para a API
    const purchaseRequest: PurchaseRequest = {
      player: userEmail,
      item: this.reward.id
    };

    // Chama a API para criar a compra
    this.recompensasService.createPurchase(purchaseRequest).subscribe({
      next: (response) => {
        
        if (response.status === 'OK') {
          // Atualiza o saldo de moedas no localStorage
          const newCoins = currentCoins - this.reward.cost;
          localStorage.setItem('coins', newCoins.toString());

          // Registra o histÃ³rico de resgates no localStorage (para compatibilidade)
          const redeemHistory = JSON.parse(localStorage.getItem('redeem_history') || '[]');
          redeemHistory.push({
            rewardId: this.reward.id,
            rewardName: this.reward.title,
            userEmail: userEmail,
            redeemedAt: new Date().toISOString(),
            coinsSpent: this.reward.cost,
            apiResponse: response
          });
          localStorage.setItem('redeem_history', JSON.stringify(redeemHistory));

          // Atualiza a lista de recompensas resgatadas
          this.updateRedeemedRewards(userEmail);

          this.notificationService.showSuccess(`ParabÃ©ns! VocÃª resgatou ${this.reward.title} com sucesso!`);
          
          // Fecha o modal com sucesso
          this.activeModal.close('redeemed');
        } else {
          console.error('Erro na API:', response.status);
          this.notificationService.showSuccess(`Erro ao resgatar recompensa: ${response.status || 'Erro desconhecido'}`, false);
        }
      },
      error: (error) => {
        console.error('Erro na requisiÃ§Ã£o:', error);
        this.notificationService.showSuccess('Erro ao conectar com o servidor. Tente novamente.', false);
      },
      complete: () => {
        this.isProcessing = false;
      }
    });
  }

  private updateRedeemedRewards(userEmail: string) {
    // ObtÃ©m a lista atual de recompensas resgatadas
    const redeemedRewards = JSON.parse(localStorage.getItem('redeemed_rewards') || '[]');
    
    // Procura se a recompensa jÃ¡ foi resgatada antes
    const existingRewardIndex = redeemedRewards.findIndex((r: Reward) => r.id === this.reward.id);

    if (existingRewardIndex >= 0) {
      // Se jÃ¡ foi resgatada, incrementa a quantidade
      redeemedRewards[existingRewardIndex].owned += 1;
    } else {
      // Se Ã© a primeira vez, adiciona Ã  lista com quantidade 1
      const redeemedReward: Reward = {
        id: this.reward.id,
        title: this.reward.title,
        description: this.reward.description,
        cost: this.reward.cost,
        imageUrl: this.reward.imageUrl,
        category: this.reward.category,
        amount: this.reward.amount,
        owned: 1,
        redeemedAt: new Date().toISOString(),
        userEmail: userEmail,
        requires: this.reward.requires
      };
      redeemedRewards.push(redeemedReward);
    }

    // Salva a lista atualizada de recompensas resgatadas
    localStorage.setItem('redeemed_rewards', JSON.stringify(redeemedRewards));
  }
}

@Component({
  selector: 'app-confirm-redeem-modal',
  template: `
    <div class="modal-header">
      <h4 class="modal-title">Confirmar Resgate</h4>
      <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
    </div>
    <div class="modal-body">
      <p>VocÃª tem certeza que deseja trocar {{coinCost}} moedas por {{reward.title}}? Esta aÃ§Ã£o serÃ¡ definitiva e nÃ£o poderÃ¡ ser desfeita.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="close()">NÃ£o</button>
      <button type="button" class="btn btn-primary" (click)="confirm()">Sim</button>
    </div>
  `
})
export class ConfirmRedeemModalComponent {
  reward!: Reward;
  coinCost!: number;

  constructor(private activeModal: NgbActiveModal) {}

  close() {
    this.activeModal.dismiss();
    }

  confirm() {
    this.activeModal.close('confirmed');
  }
} 