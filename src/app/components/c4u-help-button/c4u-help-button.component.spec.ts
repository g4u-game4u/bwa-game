import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HelpButtonComponent } from './c4u-help-button.component';

describe('HelpButtonComponent', () => {
  let component: HelpButtonComponent;
  let fixture: ComponentFixture<HelpButtonComponent>;
  let httpMock: HttpTestingController;

  const webhookUrl =
    'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpButtonComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(HelpButtonComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('Renderização do botão', () => {
    it('should render the "?" button when the form is closed', () => {
      const btn = fixture.nativeElement.querySelector('.help-fab');
      expect(btn).toBeTruthy();
      expect(btn.textContent.trim()).toBe('?');
      expect(component.isOpen).toBeFalse();
    });
  });

  describe('Abertura e fechamento do formulário', () => {
    it('should open the form when the button is clicked', () => {
      const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.help-fab');
      btn.click();
      fixture.detectChanges();

      expect(component.isOpen).toBeTrue();
      const overlay = fixture.nativeElement.querySelector('.help-overlay');
      expect(overlay).toBeTruthy();
    });

    it('should close the form when the close button is clicked', () => {
      component.isOpen = true;
      fixture.detectChanges();

      const closeBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.help-close-btn');
      expect(closeBtn).toBeTruthy();
      closeBtn.click();
      fixture.detectChanges();

      expect(component.isOpen).toBeFalse();
      const overlay = fixture.nativeElement.querySelector('.help-overlay');
      expect(overlay).toBeFalsy();
    });

    it('should close the form when clicking outside (on the overlay)', () => {
      component.isOpen = true;
      fixture.detectChanges();

      const overlay: HTMLElement = fixture.nativeElement.querySelector('.help-overlay');
      overlay.click();
      fixture.detectChanges();

      expect(component.isOpen).toBeFalse();
    });

    it('should close the form when Escape key is pressed', () => {
      component.isOpen = true;
      fixture.detectChanges();

      const overlay: HTMLElement = fixture.nativeElement.querySelector('.help-overlay');
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      overlay.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.isOpen).toBeFalse();
    });
  });

  describe('Campos do formulário', () => {
    beforeEach(() => {
      component.isOpen = true;
      fixture.detectChanges();
    });

    it('should contain nome, e-mail and descrição fields with Portuguese labels', () => {
      const labels = fixture.nativeElement.querySelectorAll('label');
      const labelTexts = Array.from(labels).map((l: any) => l.textContent.trim());

      expect(labelTexts).toContain('Nome');
      expect(labelTexts).toContain('E-mail');
      expect(labelTexts).toContain('Descrição do Problema');

      expect(fixture.nativeElement.querySelector('#help-nome')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#help-email')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#help-descricao')).toBeTruthy();
    });
  });

  describe('Validação do formulário', () => {
    beforeEach(() => {
      component.isOpen = true;
      fixture.detectChanges();
    });

    it('should disable the submit button when the form is invalid', () => {
      const submitBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.help-submit-btn');
      expect(submitBtn.disabled).toBeTrue();
    });

    it('should show validation messages for empty required fields when touched', () => {
      const nomeCtrl = component.helpForm.get('nome')!;
      const emailCtrl = component.helpForm.get('email')!;
      const descricaoCtrl = component.helpForm.get('descricao')!;

      nomeCtrl.markAsTouched();
      emailCtrl.markAsTouched();
      descricaoCtrl.markAsTouched();
      fixture.detectChanges();

      const validationMessages = fixture.nativeElement.querySelectorAll('.help-validation span');
      const texts = Array.from(validationMessages).map((el: any) => el.textContent.trim());

      expect(texts).toContain('Nome é obrigatório');
      expect(texts).toContain('E-mail é obrigatório');
      expect(texts).toContain('Descrição é obrigatória');
    });

    it('should show validation message for invalid email format', () => {
      const emailCtrl = component.helpForm.get('email')!;
      emailCtrl.setValue('invalid-email');
      emailCtrl.markAsTouched();
      fixture.detectChanges();

      const emailValidation = fixture.nativeElement.querySelectorAll('.help-validation span');
      const texts = Array.from(emailValidation).map((el: any) => el.textContent.trim());

      expect(texts).toContain('Formato de e-mail inválido');
    });
  });

  describe('Envio do formulário', () => {
    beforeEach(() => {
      component.isOpen = true;
      fixture.detectChanges();
    });

    it('should clear the form and show success message on successful submit', fakeAsync(() => {
      component.helpForm.setValue({
        nome: 'João Silva',
        email: 'joao@example.com',
        descricao: 'Problema encontrado na página de login'
      });
      fixture.detectChanges();

      component.onSubmit();
      tick();

      const req = httpMock.expectOne(webhookUrl);
      expect(req.request.method).toBe('POST');
      req.flush({ success: true });
      tick();
      fixture.detectChanges();

      expect(component.submitSuccess).toBeTrue();
      expect(component.submitError).toBeFalse();
      expect(component.helpForm.get('nome')!.value).toBeFalsy();
      expect(component.helpForm.get('email')!.value).toBeFalsy();
      expect(component.helpForm.get('descricao')!.value).toBeFalsy();

      const successMsg = fixture.nativeElement.querySelector('.help-success');
      expect(successMsg).toBeTruthy();
      expect(successMsg.textContent).toContain('Reporte enviado com sucesso!');
    }));

    it('should preserve form data and show error message on failed submit', fakeAsync(() => {
      component.helpForm.setValue({
        nome: 'Maria Souza',
        email: 'maria@example.com',
        descricao: 'Erro ao carregar dashboard de gamificação'
      });
      fixture.detectChanges();

      component.onSubmit();
      tick();

      const req = httpMock.expectOne(webhookUrl);
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      tick();
      fixture.detectChanges();

      expect(component.submitError).toBeTrue();
      expect(component.submitSuccess).toBeFalse();
      expect(component.helpForm.get('nome')!.value).toBe('Maria Souza');
      expect(component.helpForm.get('email')!.value).toBe('maria@example.com');
      expect(component.helpForm.get('descricao')!.value).toBe('Erro ao carregar dashboard de gamificação');

      const errorMsg = fixture.nativeElement.querySelector('.help-error');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain('Erro ao enviar. Tente novamente.');
    }));
  });

  describe('Acessibilidade', () => {
    it('should have aria-label on the "?" button', () => {
      const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.help-fab');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      expect(btn.getAttribute('aria-label')).toBe('Abrir formulário de ajuda');
    });

    it('should have role="dialog" and aria-labelledby on the form overlay', () => {
      component.isOpen = true;
      fixture.detectChanges();

      const overlay: HTMLElement = fixture.nativeElement.querySelector('.help-overlay');
      expect(overlay.getAttribute('role')).toBe('dialog');
      expect(overlay.getAttribute('aria-labelledby')).toBe('help-form-title');

      const title = fixture.nativeElement.querySelector('#help-form-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toContain('Reportar Problema');
    });

    it('should move focus to the first field (nome) when the form opens', fakeAsync(() => {
      const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.help-fab');
      btn.click();
      fixture.detectChanges();
      tick(100);
      fixture.detectChanges();

      const nomeInput = fixture.nativeElement.querySelector('#help-nome');
      expect(document.activeElement).toBe(nomeInput);
    }));
  });
});
