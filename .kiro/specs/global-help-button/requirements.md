# Documento de Requisitos

## Introdução

Este documento descreve os requisitos para um botão flutuante global de ajuda ("?") que aparece em todas as páginas da aplicação Angular 16 — desde a tela de login até todos os dashboards. Ao clicar no botão, um formulário é exibido para que o usuário descreva problemas encontrados. Ao submeter, os dados são enviados via HTTP POST para um webhook externo.

## Glossário

- **Botão_Ajuda**: Componente Angular flutuante, circular, com o símbolo "?" que permanece visível em todas as páginas da aplicação.
- **Formulário_Ajuda**: Formulário modal/overlay exibido ao clicar no Botão_Ajuda, contendo campos para o usuário descrever o problema.
- **Webhook_URL**: Endpoint externo que recebe os dados do formulário via HTTP POST: `https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6`
- **AppComponent**: Componente raiz da aplicação Angular que renderiza o `<router-outlet>` e é exibido em todas as rotas.
- **Usuário**: Qualquer pessoa que acessa a aplicação, autenticada ou não.

## Requisitos

### Requisito 1: Exibição Global do Botão de Ajuda

**User Story:** Como Usuário, eu quero ver um botão de ajuda em todas as páginas da aplicação, para que eu possa reportar problemas a qualquer momento.

#### Critérios de Aceitação

1. THE Botão_Ajuda SHALL ser renderizado como um elemento circular flutuante com o símbolo "?" posicionado no lado direito inferior da tela.
2. THE Botão_Ajuda SHALL permanecer visível e acessível em todas as rotas da aplicação, incluindo login, dashboards de gamificação, gestão de equipes e demais páginas.
3. THE Botão_Ajuda SHALL utilizar posicionamento fixo (`position: fixed`) para permanecer visível durante a rolagem da página.
4. THE Botão_Ajuda SHALL possuir um `z-index` suficientemente alto para não ser sobreposto por outros elementos da interface.

### Requisito 2: Interação com o Botão de Ajuda

**User Story:** Como Usuário, eu quero clicar no botão de ajuda para abrir um formulário de reporte, para que eu possa descrever o problema que estou enfrentando.

#### Critérios de Aceitação

1. WHEN o Usuário clicar no Botão_Ajuda, THE Formulário_Ajuda SHALL ser exibido como um overlay/painel acima do conteúdo da página.
2. WHEN o Formulário_Ajuda estiver aberto, THE Botão_Ajuda SHALL permanecer visível ou ser substituído por um botão de fechar.
3. WHEN o Usuário clicar fora do Formulário_Ajuda ou no botão de fechar, THE Formulário_Ajuda SHALL ser fechado.

### Requisito 3: Campos do Formulário de Ajuda

**User Story:** Como Usuário, eu quero preencher um formulário com informações sobre o problema, para que a equipe de suporte possa entender e resolver a questão.

#### Critérios de Aceitação

1. THE Formulário_Ajuda SHALL conter um campo de texto para o nome do Usuário.
2. THE Formulário_Ajuda SHALL conter um campo de texto para o e-mail do Usuário.
3. THE Formulário_Ajuda SHALL conter um campo de área de texto para a descrição do problema.
4. THE Formulário_Ajuda SHALL conter um botão de envio ("Enviar") para submeter os dados.
5. THE Formulário_Ajuda SHALL exibir rótulos descritivos em português para cada campo.

### Requisito 4: Validação do Formulário

**User Story:** Como Usuário, eu quero ser informado sobre campos obrigatórios antes de enviar, para que eu não submeta um formulário incompleto.

#### Critérios de Aceitação

1. THE Formulário_Ajuda SHALL exigir que os campos nome, e-mail e descrição do problema sejam preenchidos antes de permitir o envio.
2. WHEN o Usuário tentar submeter o Formulário_Ajuda com campos obrigatórios vazios, THE Formulário_Ajuda SHALL exibir mensagens de validação indicando os campos pendentes.
3. WHEN o Usuário informar um e-mail em formato inválido, THE Formulário_Ajuda SHALL exibir uma mensagem de validação indicando o formato correto.
4. WHILE o Formulário_Ajuda possuir erros de validação, THE botão de envio SHALL permanecer desabilitado.

### Requisito 5: Envio dos Dados para o Webhook

**User Story:** Como Usuário, eu quero que meu reporte seja enviado ao suporte ao clicar em "Enviar", para que a equipe possa tomar providências.

#### Critérios de Aceitação

1. WHEN o Usuário submeter o Formulário_Ajuda com dados válidos, THE Formulário_Ajuda SHALL enviar os dados via HTTP POST para a Webhook_URL.
2. THE payload do HTTP POST SHALL conter os campos: nome, e-mail e descrição do problema em formato JSON.
3. WHEN o envio for realizado com sucesso (status HTTP 2xx), THE Formulário_Ajuda SHALL exibir uma mensagem de confirmação ao Usuário e limpar os campos do formulário.
4. IF o envio falhar (erro de rede ou status HTTP diferente de 2xx), THEN THE Formulário_Ajuda SHALL exibir uma mensagem de erro informando que o envio não foi concluído.
5. WHILE o envio estiver em andamento, THE botão de envio SHALL exibir um indicador de carregamento e permanecer desabilitado para evitar envios duplicados.

### Requisito 6: Acessibilidade

**User Story:** Como Usuário com necessidades de acessibilidade, eu quero que o botão e o formulário de ajuda sejam acessíveis via teclado e leitores de tela, para que eu possa utilizá-los sem barreiras.

#### Critérios de Aceitação

1. THE Botão_Ajuda SHALL possuir um atributo `aria-label` descritivo (ex: "Abrir formulário de ajuda").
2. THE Formulário_Ajuda SHALL possuir atributo `role="dialog"` e `aria-labelledby` referenciando o título do formulário.
3. WHEN o Formulário_Ajuda for aberto, THE foco do teclado SHALL ser movido para o primeiro campo do formulário.
4. THE Formulário_Ajuda SHALL ser navegável via teclado (Tab para avançar entre campos, Escape para fechar).

### Requisito 7: Responsividade

**User Story:** Como Usuário em dispositivo móvel, eu quero que o botão e o formulário de ajuda se adaptem a diferentes tamanhos de tela, para que eu possa utilizá-los em qualquer dispositivo.

#### Critérios de Aceitação

1. THE Botão_Ajuda SHALL manter tamanho e posicionamento adequados em telas de dispositivos móveis (largura mínima de 320px).
2. THE Formulário_Ajuda SHALL adaptar sua largura para ocupar no máximo 90% da largura da tela em dispositivos móveis.
3. THE Formulário_Ajuda SHALL utilizar largura fixa de no máximo 400px em telas de desktop.
