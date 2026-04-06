import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HelpButtonComponent } from './c4u-help-button.component';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for HelpButtonComponent
 *
 * These tests verify universal properties of the HelpButtonComponent
 * using fast-check to generate random test cases.
 */
describe('HelpButtonComponent Property-Based Tests', () => {
  let component: HelpButtonComponent;
  let fixture: ComponentFixture<HelpButtonComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpButtonComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(HelpButtonComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.ngOnInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Property 1: Round-trip de abertura/fechamento
   * **Validates: Requirements 2.1, 2.3**
   *
   * Para qualquer sequência aleatória de ações (toggle, close, clickOutside, escape),
   * o estado final do componente (isOpen) deve ser consistente com a aplicação
   * sequencial dessas ações.
   */
  describe('Property 1: Round-trip de abertura/fechamento', () => {
    type Action = 'toggle' | 'close' | 'clickOutside' | 'escape';

    const actionArb = fc.constantFrom<Action>('toggle', 'close', 'clickOutside', 'escape');
    const actionSequenceArb = fc.array(actionArb, { minLength: 1, maxLength: 30 });

    function applyAction(comp: HelpButtonComponent, action: Action): void {
      switch (action) {
        case 'toggle':
          comp.toggle();
          break;
        case 'close':
          comp.close();
          break;
        case 'clickOutside':
          if (comp.isOpen) {
            comp.onOverlayClick(new MouseEvent('click'));
          }
          break;
        case 'escape':
          if (comp.isOpen) {
            comp.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
          }
          break;
      }
    }

    function computeExpectedState(actions: Action[]): boolean {
      let isOpen = false;
      for (const action of actions) {
        switch (action) {
          case 'toggle':
            isOpen = !isOpen;
            break;
          case 'close':
            isOpen = false;
            break;
          case 'clickOutside':
            if (isOpen) { isOpen = false; }
            break;
          case 'escape':
            if (isOpen) { isOpen = false; }
            break;
        }
      }
      return isOpen;
    }

    it('should have final isOpen state consistent with the applied action sequence', () => {
      fc.assert(
        fc.property(
          actionSequenceArb,
          (actions) => {
            // Reset component state before each run
            component.isOpen = false;

            // Apply all actions to the component
            for (const action of actions) {
              applyAction(component, action);
            }

            // Compute expected state from the same sequence
            const expectedIsOpen = computeExpectedState(actions);

            expect(component.isOpen).toBe(expectedIsOpen);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always be closed after a close action regardless of prior state', () => {
      fc.assert(
        fc.property(
          actionSequenceArb,
          (actions) => {
            component.isOpen = false;

            // Apply all actions
            for (const action of actions) {
              applyAction(component, action);
            }

            // Now apply a close action
            component.close();

            expect(component.isOpen).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should toggle isOpen on each toggle action', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (toggleCount) => {
            component.isOpen = false;

            for (let i = 0; i < toggleCount; i++) {
              component.toggle();
            }

            // After N toggles starting from false, isOpen should be true if N is odd
            const expectedIsOpen = toggleCount % 2 === 1;
            expect(component.isOpen).toBe(expectedIsOpen);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Formulário inválido mantém botão desabilitado
   * **Validates: Requirements 4.1, 4.4**
   *
   * Para qualquer combinação de valores dos campos nome, e-mail e descrição
   * onde pelo menos um campo obrigatório está vazio/inválido, o formulário
   * deve ser inválido (helpForm.invalid === true).
   */
  describe('Property 2: Formulário inválido mantém botão desabilitado', () => {

    // Generators for invalid field values
    // Angular's Validators.required rejects empty/null, Validators.minLength(2) rejects length < 2
    // Note: Angular does NOT trim whitespace by default, so "  " (2 spaces) passes both validators
    const invalidNome = fc.oneof(
      fc.constant(''),                          // empty: fails required
      fc.constantFrom('a', 'b', 'x', '1', ' ') // single char: fails minLength(2)
    );

    const validNome = fc.string({ minLength: 2, maxLength: 50 }).filter((s: string) => s.length >= 2);

    const invalidEmail = fc.oneof(
      fc.constant(''),
      fc.constant('noatsign'),
      fc.constant('missing@'),
      fc.constant('@nodomain'),
      fc.constant('spaces in@email.com'),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s: string) => !s.includes('@'))
    );

    const validEmail = fc.tuple(
      fc.string({ minLength: 2, maxLength: 10 }).map((s: string) => s.replace(/[^a-z0-9]/g, 'a') || 'ab'),
      fc.string({ minLength: 2, maxLength: 8 }).map((s: string) => s.replace(/[^a-z]/g, 'a') || 'ab')
    ).map(([local, domain]: [string, string]) => `${local}@${domain}.com`);

    const invalidDescricao = fc.oneof(
      fc.constant(''),                          // empty: fails required
      fc.string({ minLength: 1, maxLength: 9 }) // length < 10: fails minLength(10)
    );

    const validDescricao = fc.string({ minLength: 10, maxLength: 200 }).filter((s: string) => s.length >= 10);

    /**
     * Helper: checks if a given combination should make the form invalid
     * based on Angular's Validators.required, minLength, and email rules.
     * Note: Angular does NOT trim whitespace by default.
     */
    function isFieldCombinationInvalid(nome: string, email: string, descricao: string): boolean {
      const nomeInvalid = !nome || nome.length < 2;
      const emailInvalid = !email || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
      const descricaoInvalid = !descricao || descricao.length < 10;
      return nomeInvalid || emailInvalid || descricaoInvalid;
    }

    it('should have helpForm.invalid === true when nome is invalid', () => {
      fc.assert(
        fc.property(
          invalidNome,
          validEmail,
          validDescricao,
          (nome, email, descricao) => {
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            expect(component.helpForm.invalid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have helpForm.invalid === true when email is invalid', () => {
      fc.assert(
        fc.property(
          validNome,
          invalidEmail,
          validDescricao,
          (nome, email, descricao) => {
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            expect(component.helpForm.invalid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have helpForm.invalid === true when descricao is invalid', () => {
      fc.assert(
        fc.property(
          validNome,
          validEmail,
          invalidDescricao,
          (nome, email, descricao) => {
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            expect(component.helpForm.invalid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have helpForm.invalid === true when at least one field is invalid in random combinations', () => {
      // Generate tuples where at least one field is invalid
      const atLeastOneInvalid = fc.tuple(
        fc.oneof(invalidNome, validNome),
        fc.oneof(invalidEmail, validEmail),
        fc.oneof(invalidDescricao, validDescricao)
      ).filter(([nome, email, descricao]) => isFieldCombinationInvalid(nome, email, descricao));

      fc.assert(
        fc.property(
          atLeastOneInvalid,
          ([nome, email, descricao]) => {
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            expect(component.helpForm.invalid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Mensagens de validação para entrada inválida
   * **Validates: Requirements 4.2, 4.3**
   *
   * Para qualquer string que não seja um formato de e-mail válido no campo e-mail,
   * a validação deve produzir erro. Para strings vazias, o erro 'required' deve estar presente.
   * Para strings não-vazias inválidas, o erro 'email' deve estar presente.
   */
  describe('Property 3: Mensagens de validação para entrada inválida', () => {

    // Angular's Validators.email uses a specific regex pattern.
    // We generate strings that are guaranteed to fail that validator.
    // The safest strategy: strings without '@' always fail Angular's email validator.
    const stringWithoutAt = fc.string({ minLength: 1, maxLength: 50 })
      .filter((s: string) => !s.includes('@'));

    // Known patterns that Angular's Validators.email definitively rejects
    const knownInvalidEmails = fc.constantFrom(
      'plaintext',
      '12345',
      'abc def',
      'noatsign',
      'hello world',
      'user name',
      'just-a-string',
      'missing.at.sign'
    );

    // Strings with spaces (Angular's email validator rejects these)
    const stringsWithSpaces = fc.tuple(
      fc.string({ minLength: 1, maxLength: 10 }).map((s: string) => s.replace(/\s/g, 'a')),
      fc.string({ minLength: 1, maxLength: 10 }).map((s: string) => s.replace(/\s/g, 'b'))
    ).map(([a, b]: [string, string]) => `${a} ${b}`);

    it('should produce email validation error for strings without @ character', () => {
      fc.assert(
        fc.property(
          stringWithoutAt,
          (invalidEmail) => {
            const emailControl = component.helpForm.get('email')!;
            emailControl.setValue(invalidEmail);
            emailControl.markAsTouched();
            emailControl.updateValueAndValidity();

            // Non-empty strings without @ should have the 'email' error
            expect(emailControl.hasError('email')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce required validation error for empty email string', () => {
      fc.assert(
        fc.property(
          fc.constant(''),
          (emptyEmail) => {
            const emailControl = component.helpForm.get('email')!;
            emailControl.setValue(emptyEmail);
            emailControl.markAsTouched();
            emailControl.updateValueAndValidity();

            expect(emailControl.hasError('required')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always have email control invalid for any non-email string', () => {
      fc.assert(
        fc.property(
          fc.oneof(stringWithoutAt, knownInvalidEmails, stringsWithSpaces),
          (invalidEmail) => {
            const emailControl = component.helpForm.get('email')!;
            emailControl.setValue(invalidEmail);
            emailControl.markAsTouched();
            emailControl.updateValueAndValidity();

            // The control should be invalid for any non-email string
            expect(emailControl.invalid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Falha na submissão exibe erro
   * **Validates: Requirements 5.4**
   *
   * Para qualquer submissão que resulte em erro (rede ou status HTTP não-2xx),
   * submitError deve ser true, submitSuccess deve ser false, e os dados do
   * formulário devem ser preservados (não limpos).
   */
  describe('Property 6: Falha na submissão exibe erro', () => {
    const webhookUrl = 'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

    // Generator for valid nome (minLength 2)
    const validNome = fc.string({ minLength: 2, maxLength: 50 })
      .filter((s: string) => s.length >= 2);

    // Generator for valid email
    const validEmail = fc.tuple(
      fc.string({ minLength: 2, maxLength: 10 }).map((s: string) => s.replace(/[^a-z0-9]/g, 'a') || 'ab'),
      fc.string({ minLength: 2, maxLength: 8 }).map((s: string) => s.replace(/[^a-z]/g, 'a') || 'ab')
    ).map(([local, domain]: [string, string]) => `${local}@${domain}.com`);

    // Generator for valid descricao (minLength 10)
    const validDescricao = fc.string({ minLength: 10, maxLength: 200 })
      .filter((s: string) => s.length >= 10);

    // Generator for HTTP error status codes
    const errorStatusCode = fc.constantFrom(400, 401, 403, 404, 500, 502, 503, 0);

    it('should set submitError and preserve form data on HTTP error', () => {
      fc.assert(
        fc.property(
          validNome,
          validEmail,
          validDescricao,
          errorStatusCode,
          (nome, email, descricao, errorCode) => {
            // Reset component state
            component.isSubmitting = false;
            component.submitSuccess = false;
            component.submitError = false;
            component.helpForm.reset();

            // Set valid form values
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            // Submit the form
            component.onSubmit();

            // Expect one HTTP request to the webhook URL
            const req = httpMock.expectOne(webhookUrl);
            expect(req.request.method).toBe('POST');

            // Flush with error response based on error code
            if (errorCode === 0) {
              // Network error (status 0)
              req.error(new ProgressEvent('error'));
            } else {
              req.flush('Error', { status: errorCode, statusText: 'Error' });
            }

            // Verify: submitError === true, submitSuccess === false, isSubmitting === false
            expect(component.submitError).toBe(true);
            expect(component.submitSuccess).toBe(false);
            expect(component.isSubmitting).toBe(false);

            // Verify: form data is PRESERVED (not cleared)
            expect(component.helpForm.get('nome')!.value).toBe(nome);
            expect(component.helpForm.get('email')!.value).toBe(email);
            expect(component.helpForm.get('descricao')!.value).toBe(descricao);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: Botão desabilitado durante envio
   * **Validates: Requirements 5.5**
   *
   * Para qualquer estado onde isSubmitting === true, o botão de envio deve estar
   * desabilitado e não deve ser possível disparar uma segunda submissão enquanto
   * a primeira está em andamento.
   */
  describe('Property 7: Botão desabilitado durante envio', () => {
    const webhookUrl = 'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

    // Generator for valid nome (minLength 2)
    const validNome = fc.string({ minLength: 2, maxLength: 50 })
      .filter((s: string) => s.length >= 2);

    // Generator for valid email
    const validEmail = fc.tuple(
      fc.string({ minLength: 2, maxLength: 10 }).map((s: string) => s.replace(/[^a-z0-9]/g, 'a') || 'ab'),
      fc.string({ minLength: 2, maxLength: 8 }).map((s: string) => s.replace(/[^a-z]/g, 'a') || 'ab')
    ).map(([local, domain]: [string, string]) => `${local}@${domain}.com`);

    // Generator for valid descricao (minLength 10)
    const validDescricao = fc.string({ minLength: 10, maxLength: 200 })
      .filter((s: string) => s.length >= 10);

    it('should have isSubmitting === true and prevent duplicate submissions while request is pending', () => {
      fc.assert(
        fc.property(
          validNome,
          validEmail,
          validDescricao,
          (nome, email, descricao) => {
            // Reset component state
            component.isSubmitting = false;
            component.submitSuccess = false;
            component.submitError = false;
            component.helpForm.reset();

            // Set valid form values
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            // Submit the form — starts the HTTP request
            component.onSubmit();

            // Verify: isSubmitting should be true immediately (request is pending)
            expect(component.isSubmitting).toBe(true);

            // Try calling onSubmit() again — should be a no-op because isSubmitting is true
            component.onSubmit();

            // Verify: only ONE HTTP request was made (the guard prevented a second one)
            const req = httpMock.expectOne(webhookUrl);
            expect(req.request.method).toBe('POST');

            // isSubmitting should still be true (request not yet resolved)
            expect(component.isSubmitting).toBe(true);

            // Flush the request to clean up for httpMock.verify()
            req.flush({ success: true }, { status: 200, statusText: 'OK' });

            // After flush, isSubmitting should be false
            expect(component.isSubmitting).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Submissão bem-sucedida limpa o formulário
   * **Validates: Requirements 5.3**
   *
   * Para qualquer conjunto válido de dados do formulário, quando a submissão
   * retorna status HTTP 2xx, o formulário deve ser resetado (campos limpos),
   * submitSuccess deve ser true e submitError deve ser false.
   */
  describe('Property 5: Submissão bem-sucedida limpa o formulário', () => {
    const webhookUrl = 'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

    // Generator for valid nome (minLength 2)
    const validNome = fc.string({ minLength: 2, maxLength: 50 })
      .filter((s: string) => s.length >= 2);

    // Generator for valid email
    const validEmail = fc.tuple(
      fc.string({ minLength: 2, maxLength: 10 }).map((s: string) => s.replace(/[^a-z0-9]/g, 'a') || 'ab'),
      fc.string({ minLength: 2, maxLength: 8 }).map((s: string) => s.replace(/[^a-z]/g, 'a') || 'ab')
    ).map(([local, domain]: [string, string]) => `${local}@${domain}.com`);

    // Generator for valid descricao (minLength 10)
    const validDescricao = fc.string({ minLength: 10, maxLength: 200 })
      .filter((s: string) => s.length >= 10);

    it('should reset form and set submitSuccess after successful submission', () => {
      fc.assert(
        fc.property(
          validNome,
          validEmail,
          validDescricao,
          (nome, email, descricao) => {
            // Reset component state
            component.isSubmitting = false;
            component.submitSuccess = false;
            component.submitError = false;
            component.helpForm.reset();

            // Set valid form values
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            // Submit the form
            component.onSubmit();

            // Expect one HTTP request to the webhook URL
            const req = httpMock.expectOne(webhookUrl);
            expect(req.request.method).toBe('POST');

            // Flush with success response (status 200)
            req.flush({ success: true }, { status: 200, statusText: 'OK' });

            // Verify: submitSuccess === true, submitError === false
            expect(component.submitSuccess).toBe(true);
            expect(component.submitError).toBe(false);
            expect(component.isSubmitting).toBe(false);

            // Verify: form fields are null (form was reset)
            expect(component.helpForm.get('nome')!.value).toBeNull();
            expect(component.helpForm.get('email')!.value).toBeNull();
            expect(component.helpForm.get('descricao')!.value).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: Escape fecha o formulário
   * **Validates: Requirements 6.4**
   *
   * Para qualquer estado do formulário aberto (com/sem dados preenchidos),
   * pressionar Escape deve sempre fechar o formulário (isOpen === false),
   * independente do estado dos campos.
   */
  describe('Property 9: Escape fecha o formulário', () => {
    // Generators for optional form field values
    const optionalNome = fc.option(fc.string({ minLength: 0, maxLength: 50 }));
    const optionalEmail = fc.option(fc.string({ minLength: 0, maxLength: 50 }));
    const optionalDescricao = fc.option(fc.string({ minLength: 0, maxLength: 200 }));

    it('should close the form on Escape regardless of form data state', () => {
      fc.assert(
        fc.property(
          optionalNome,
          optionalEmail,
          optionalDescricao,
          (nome, email, descricao) => {
            // Open the form
            component.isOpen = true;

            // Optionally fill in form fields with generated data
            if (nome !== null) {
              component.helpForm.get('nome')!.setValue(nome);
            }
            if (email !== null) {
              component.helpForm.get('email')!.setValue(email);
            }
            if (descricao !== null) {
              component.helpForm.get('descricao')!.setValue(descricao);
            }

            // Press Escape
            component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

            // Verify form is closed regardless of field state
            expect(component.isOpen).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should close the form on Escape even when all fields are filled with valid data', () => {
      // Generator for valid nome (minLength 2)
      const validNome = fc.string({ minLength: 2, maxLength: 50 })
        .filter((s: string) => s.length >= 2);

      // Generator for valid email
      const validEmail = fc.tuple(
        fc.string({ minLength: 2, maxLength: 10 }).map((s: string) => s.replace(/[^a-z0-9]/g, 'a') || 'ab'),
        fc.string({ minLength: 2, maxLength: 8 }).map((s: string) => s.replace(/[^a-z]/g, 'a') || 'ab')
      ).map(([local, domain]: [string, string]) => `${local}@${domain}.com`);

      // Generator for valid descricao (minLength 10)
      const validDescricao = fc.string({ minLength: 10, maxLength: 200 })
        .filter((s: string) => s.length >= 10);

      fc.assert(
        fc.property(
          validNome,
          validEmail,
          validDescricao,
          (nome, email, descricao) => {
            // Open the form
            component.isOpen = true;

            // Fill all fields with valid data
            component.helpForm.setValue({ nome, email, descricao });
            component.helpForm.updateValueAndValidity();

            // Press Escape
            component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

            // Verify form is closed
            expect(component.isOpen).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: Foco movido ao abrir formulário
   * **Validates: Requirements 6.3**
   *
   * Para qualquer transição de estado de isOpen === false para isOpen === true,
   * o foco do teclado deve ser movido para o primeiro campo do formulário (campo nome).
   */
  describe('Property 8: Foco movido ao abrir formulário', () => {
    type Action = 'open' | 'close';

    const actionArb = fc.constantFrom<Action>('open', 'close');
    const actionSequenceArb = fc.array(actionArb, { minLength: 1, maxLength: 20 });

    it('should move focus to nome field after each open action in a random sequence', fakeAsync(() => {
      fc.assert(
        fc.property(
          actionSequenceArb,
          (actions) => {
            // Reset component state
            component.isOpen = false;
            fixture.detectChanges();

            for (const action of actions) {
              if (action === 'open' && !component.isOpen) {
                component.toggle();
                fixture.detectChanges();
                tick(0); // flush the setTimeout in focusNomeField()

                // After opening, the nome input should have focus
                const nomeEl = fixture.nativeElement.querySelector('#help-nome');
                if (nomeEl) {
                  expect(document.activeElement).toBe(nomeEl);
                }
              } else if (action === 'close' && component.isOpen) {
                component.close();
                fixture.detectChanges();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    }));
  });
});
