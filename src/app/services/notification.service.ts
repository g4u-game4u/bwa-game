import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor() {
  }

  showSuccess(message: string, showConfetti: boolean = true) {
    alert(message);
    if (showConfetti) {
      this.createConfetti();
      this.playSuccessSound();
    }
  }

  private createConfetti() {
    
    try {
      // Cria o container de confetes
      const confettiContainer = document.createElement('div');
      confettiContainer.className = 'confetti-container';
      document.body.appendChild(confettiContainer);

      // Cria os confetes
      for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        // Posiciona o confete aleatoriamente no topo da tela
        const startPositionX = Math.random() * window.innerWidth;
        const startPositionY = -20; // Começa acima da tela
        
        // Define a posição final aleatória
        const endPositionX = startPositionX + (Math.random() * 200 - 100); // Variação de -100px a +100px
        const endPositionY = window.innerHeight + 20; // Cai até abaixo da tela
        
        // Define a rotação aleatória
        const rotation = Math.random() * 720; // 0 a 720 graus
        
        // Define o atraso aleatório para cada confete
        const delay = Math.random() * 2; // 0 a 2 segundos
        
        // Define a duração aleatória da animação
        const duration = 2 + Math.random() * 2; // 2 a 4 segundos
        
        // Aplica os estilos
        confetti.style.cssText = `
          position: fixed;
          width: 10px;
          height: 10px;
          background-color: ${this.getRandomColor()};
          opacity: 0.8;
          left: ${startPositionX}px;
          top: ${startPositionY}px;
          transform-origin: center;
          animation: confetti-fall-${i} ${duration}s linear ${delay}s forwards;
        `;
        
        // Adiciona a animação específica para este confete
        const style = document.createElement('style');
        style.textContent = `
          @keyframes confetti-fall-${i} {
            0% {
              transform: translate(0, 0) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translate(${endPositionX - startPositionX}px, ${endPositionY - startPositionY}px) rotate(${rotation}deg);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
        
        confettiContainer.appendChild(confetti);
      }

      // Remove o container após a animação
      setTimeout(() => {
        if (document.body.contains(confettiContainer)) {
          document.body.removeChild(confettiContainer);
        }
      }, 6000); // Aumentado para 6 segundos para garantir que todas as animações terminem
    } catch (error) {
      console.error('Erro ao criar confetes:', error);
    }
  }

  private getRandomColor() {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeead', '#ff9999', '#99cc99'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private playSuccessSound() {
    try {
      const audio = new Audio('assets/sounds/success-plim.mp3');
      audio.volume = 0.5;
      audio.play();
    } catch (e) {
      console.warn('Não foi possível tocar o áudio de sucesso:', e);
    }
  }
} 