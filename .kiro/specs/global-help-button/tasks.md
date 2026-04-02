# Plano de Implementação: Botão Global de Ajuda

## Visão Geral

Este plano cobre a criação de um botão flutuante global de ajuda ("?") na aplicação Angular 16. O componente standalone será adicionado ao `AppComponent`, visível em todas as rotas. Ao clicar, exibe um formulário overlay para reportar problemas, enviando os dados via HTTP POST para um webhook externo do n8n.

## Tarefas

- [x] 1. Criar o HelpService com envio HTTP e construção de payload
  - [x] 1.1 Criar o HelpService
    - Criar `src/app/services/help.service.ts`
    - Definir a interface `HelpReportPayload` com campos: nome, email, descricao, pagina, timestamp
    - Implementar `submitReport(payload)` que faz HTTP POST para a webhook URL
    - Implementar `buildPayload(formValue)` que adiciona `pagina` (URL atual) e `timestamp` (ISO 8601)
    - Registrar o serviço com `providedIn: 'root'`
    - _Requisitos: 5.1, 5.2_

  - [x] 1.2 Escrever testes unitários para o HelpService
    - Criar `src/app/services/help.service.spec.ts`
    - Testar que `submitReport()` faz POST para a URL correta com o payload correto
    - Testar que `buildPayload()` inclui nome, email e descricao do input
    - Testar que `buildPayload()` adiciona campo `pagina` com a URL atual
    - Testar que `buildPayload()` gera `timestamp` em formato ISO 8601
    - _Requisitos: 5.1, 5.2_

  - [x] 1.3 Escrever teste property-based para round-trip de construção do payload
    - Criar `src/app/services/help.service.pbt.spec.ts`
    - **Propriedade 10: Round-trip de construção do payload**
    - Gerar objetos de formulário válidos aleatórios com fast-check
    - Verificar que `buildPayload()` preserva nome, email e descricao, e adiciona pagina e timestamp não-vazios
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 5.2**

  - [x] 1.4 Escrever teste property-based para submissão válida envia payload correto
    - **Propriedade 4: Submissão válida envia payload correto**
    - Gerar nomes, e-mails e descrições válidos aleatórios
    - Verificar que o payload enviado via POST contém todos os campos com os valores corretos
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 5.1, 5.2**

- [x] 2. Checkpoint - Verificar implementação do HelpService
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 3. Criar o HelpButtonComponent standalone com formulário e lógica de estado
  - [x] 3.1 Criar a estrutura do componente
    - Criar `src/app/components/c4u-help-button/c4u-help-button.component.ts`
    - Criar `src/app/components/c4u-help-button/c4u-help-button.component.html`
    - Criar `src/app/components/c4u-help-button/c4u-help-button.component.scss`
    - Configurar como componente standalone importando `CommonModule` e `ReactiveFormsModule`
    - Usar seletor `c4u-help-button`
    - Implementar propriedades de estado: `isOpen`, `isSubmitting`, `submitSuccess`, `submitError`
    - Inicializar `FormGroup` com campos `nome`, `email`, `descricao` e validadores (required, minLength, email)
    - _Requisitos: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1_

  - [x] 3.2 Implementar template do botão flutuante e formulário overlay
    - Renderizar botão circular "?" com `position: fixed`, canto inferior direito
    - Adicionar `aria-label` e `aria-expanded` ao botão
    - Renderizar overlay com `role="dialog"` e `aria-labelledby` quando `isOpen === true`
    - Incluir campos com rótulos em português: "Nome", "E-mail", "Descrição do Problema"
    - Incluir botão "Enviar" desabilitado quando formulário inválido ou `isSubmitting`
    - Exibir mensagens de validação para campos inválidos após interação (touched)
    - Exibir mensagem de sucesso quando `submitSuccess === true`
    - Exibir mensagem de erro quando `submitError === true`
    - Exibir texto "Enviando..." no botão quando `isSubmitting === true`
    - _Requisitos: 1.1, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.3, 5.4, 5.5, 6.1, 6.2_

  - [x] 3.3 Implementar lógica de interação do componente
    - Implementar `toggle()` para alternar `isOpen`
    - Implementar `close()` para fechar o formulário
    - Implementar `onOverlayClick(event)` para fechar ao clicar fora do formulário
    - Implementar `onKeydown(event)` para fechar com Escape
    - Implementar gerenciamento de foco: mover foco para o campo nome ao abrir
    - Implementar `onSubmit()` com chamada ao `HelpService`, tratamento de sucesso (reset do form) e erro (preservar dados)
    - _Requisitos: 2.1, 2.3, 5.1, 5.3, 5.4, 5.5, 6.3, 6.4_

  - [x] 3.4 Implementar estilos SCSS do componente
    - Estilizar botão flutuante circular com `position: fixed`, `bottom: 24px`, `right: 24px`, `z-index` alto
    - Estilizar overlay com fundo semi-transparente
    - Estilizar container do formulário com largura máxima de 400px em desktop
    - Adicionar media query para dispositivos móveis: largura máxima 90% da tela, mínimo 320px
    - Usar variáveis SCSS do projeto (`$primary-electric-blue`, `$bg-secondary`, etc.)
    - Estilizar estados de validação, sucesso e erro
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3_

- [x] 4. Checkpoint - Verificar implementação do HelpButtonComponent
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 5. Integrar o componente no AppComponent e AppModule
  - [x] 5.1 Adicionar o componente ao AppComponent
    - Importar `HelpButtonComponent` no array `imports` do `AppModule`
    - Adicionar `<c4u-help-button></c4u-help-button>` no template `app.component.html` após o `<router-outlet>`
    - _Requisitos: 1.2, 1.3_

- [x] 6. Escrever testes unitários e property-based para o HelpButtonComponent
  - [x] 6.1 Escrever testes unitários do HelpButtonComponent
    - Criar `src/app/components/c4u-help-button/c4u-help-button.component.spec.ts`
    - Testar que o botão "?" é renderizado quando formulário fechado
    - Testar que clicar no botão abre o formulário
    - Testar que clicar no botão de fechar fecha o formulário
    - Testar que clicar fora do formulário fecha o formulário
    - Testar que o formulário contém campos nome, e-mail e descrição com rótulos em português
    - Testar que botão de envio está desabilitado quando formulário inválido
    - Testar que mensagens de validação são exibidas para campos vazios
    - Testar que mensagem de validação é exibida para e-mail inválido
    - Testar que sucesso no envio limpa o formulário e exibe mensagem
    - Testar que erro no envio preserva dados e exibe mensagem de erro
    - Testar que botão "?" possui `aria-label`
    - Testar que formulário possui `role="dialog"` e `aria-labelledby`
    - Testar que foco move para primeiro campo ao abrir
    - Testar que Escape fecha o formulário
    - _Requisitos: 1.1, 2.1, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 6.2 Escrever teste property-based para round-trip de abertura/fechamento
    - Criar `src/app/components/c4u-help-button/c4u-help-button.component.pbt.spec.ts`
    - **Propriedade 1: Round-trip de abertura/fechamento**
    - Gerar sequências aleatórias de ações (abrir, fechar, clicar fora, Escape)
    - Verificar que o estado final é consistente com as ações aplicadas
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 2.1, 2.3**

  - [x] 6.3 Escrever teste property-based para formulário inválido mantém botão desabilitado
    - **Propriedade 2: Formulário inválido mantém botão desabilitado**
    - Gerar combinações aleatórias de valores para os 3 campos (incluindo strings vazias, whitespace, e-mails inválidos)
    - Verificar que quando qualquer campo é inválido, `helpForm.invalid === true`
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 4.1, 4.4**

  - [x] 6.4 Escrever teste property-based para mensagens de validação
    - **Propriedade 3: Mensagens de validação para entrada inválida**
    - Gerar strings aleatórias para o campo e-mail (incluindo strings sem @, sem domínio)
    - Verificar que strings que não são e-mails válidos produzem erro de validação
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 4.2, 4.3**

  - [x] 6.5 Escrever teste property-based para submissão bem-sucedida limpa o formulário
    - **Propriedade 5: Submissão bem-sucedida limpa o formulário**
    - Gerar dados válidos aleatórios, simular resposta 2xx
    - Verificar que o formulário é resetado após sucesso
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 5.3**

  - [x] 6.6 Escrever teste property-based para falha na submissão exibe erro
    - **Propriedade 6: Falha na submissão exibe erro**
    - Gerar dados válidos aleatórios, simular erros HTTP variados (400, 500, 0, timeout)
    - Verificar que `submitError === true` e dados do formulário preservados
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 5.4**

  - [x] 6.7 Escrever teste property-based para botão desabilitado durante envio
    - **Propriedade 7: Botão desabilitado durante envio**
    - Gerar dados válidos, iniciar submissão sem resolver o Observable
    - Verificar que `isSubmitting === true` e botão desabilitado
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 5.5**

  - [x] 6.8 Escrever teste property-based para foco movido ao abrir formulário
    - **Propriedade 8: Foco movido ao abrir formulário**
    - Gerar sequências aleatórias de abrir/fechar
    - Verificar que após cada abertura, o foco está no campo nome
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 6.3**

  - [x] 6.9 Escrever teste property-based para Escape fecha o formulário
    - **Propriedade 9: Escape fecha o formulário**
    - Gerar estados aleatórios do formulário (com/sem dados preenchidos)
    - Verificar que Escape sempre fecha independente do estado do formulário
    - Usar fast-check com mínimo de 100 iterações
    - **Valida: Requisitos 6.4**

- [x] 7. Checkpoint final - Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes property-based validam propriedades universais de corretude usando fast-check
- Testes unitários validam exemplos específicos e casos extremos
- A implementação usa TypeScript seguindo as práticas do Angular 16 (componente standalone)
