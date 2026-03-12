# Requirements Document

## Introduction

Refatoração das métricas e cards do dashboard para: remover todos os cards de "Processos" de todas as views, migrar todas as referências a `player.extra.cnpj` para `player.extra.cnpj_resp` exclusivamente (Clientes card, métricas, aggregate queries de player, etc.), permitir que SUPERVISOR e GESTOR configurem metas individuais (cnpj_goal e entrega_goal) via API Funifier com campos de input, alimentar essas metas dinâmicas nos componentes de métrica circular existentes (c4u-kpi-circular) que já exibem metas no dashboard do colaborador, e simplificar a contagem de atividades na tabela de clientes/carteira para contar todos os action_log ao invés de processos distintos (delivery_id). Nota: registros de action_log mantêm seu campo `attributes.cnpj` inalterado — a migração para `cnpj_resp` aplica-se apenas a dados de player.

## Glossary

- **Dashboard_Colaborador**: Tela de dashboard exibida para o colaborador individual (player), mostrando metas pessoais e progresso mensal.
- **Dashboard_Gestor**: Tela de dashboard exibida para o gestor de equipe, com abas de metas/progresso e produtividade.
- **Team_Management_Dashboard**: Dashboard de gestão de equipe usado por SUPERVISOR e GESTOR, com sidebar de filtros, KPIs circulares e tabela de clientes/carteira.
- **Processos_Card**: Card de painel de informações que exibe métricas de processos/entregas (pendentes, incompletas, finalizadas) nos dashboards.
- **Clientes_Card**: Card/KPI que exibe a quantidade de clientes na carteira do colaborador ou equipe.
- **KPI_Service**: Serviço Angular (`kpi.service.ts`) responsável por carregar e calcular KPIs do jogador.
- **Action_Log_Service**: Serviço Angular (`action-log.service.ts`) responsável por consultar dados de action_log via aggregate queries.
- **Team_Aggregate_Service**: Serviço Angular (`team-aggregate.service.ts`) responsável por consultar dados agregados de equipe.
- **Funifier_API**: API REST do Funifier em `https://service2.funifier.com` usada para ler e atualizar dados de jogadores.
- **Player_Extra**: Objeto `extra` dentro do registro do jogador no Funifier, contendo campos customizados como `cnpj_resp`, `cnpj_goal`, `entrega_goal`.
- **cnpj_resp**: Campo em `player.extra` que contém a lista de CNPJs responsáveis do colaborador. Este é o campo exclusivo para identificar CNPJs de um jogador — todo código que antes lia `extra.cnpj` deve ser migrado para `extra.cnpj_resp` sem exceção.
- **attributes.cnpj**: Campo dentro de registros de action_log que identifica o CNPJ associado a uma ação. Este campo pertence à estrutura do action_log (não ao player) e permanece inalterado.
- **cnpj_goal**: Campo em `player.extra` que armazena a meta de clientes na carteira definida pelo supervisor/gestor.
- **entrega_goal**: Campo em `player.extra` que armazena a meta de entregas no prazo definida pelo supervisor/gestor.
- **Month_Filter**: Seletor de mês no topo do dashboard que filtra todos os dados exibidos pelo mês selecionado.

## Requirements

### Requirement 1: Remove Processos Cards from All Views

**User Story:** As a user, I want the Processos cards removed from all dashboard views, so that the interface only shows relevant metrics.

#### Acceptance Criteria

1. WHEN the Dashboard_Colaborador loads, THE Dashboard_Colaborador SHALL display only the Ações (quest) panel info and SHALL omit the Processos_Card panel info in the "Meu Progresso" section.
2. WHEN the Dashboard_Gestor loads the "Metas e Progresso" tab, THE Dashboard_Gestor SHALL display only the Ações panel info and SHALL omit the Processos_Card panel info in the progress section.
3. WHEN the dados-mes-atual component renders, THE dados-mes-atual component SHALL render only the `questInfo` panel and SHALL omit the `processInfo` panel.
4. WHEN the dados-mes-anterior component renders, THE dados-mes-anterior component SHALL render only the `questInfo` panel and SHALL omit the `processInfo` panel.
5. WHEN the Team_Management_Dashboard loads the "Progresso da Equipe" section, THE Team_Management_Dashboard SHALL display activity metrics and SHALL omit process metrics from the c4u-activity-progress component.

### Requirement 2: Migrate Clientes Data Source from cnpj to cnpj_resp

**User Story:** As a product owner, I want the Clientes card and all player CNPJ lookups to use `player.extra.cnpj_resp` exclusively, so that the client portfolio reflects the responsible CNPJ assignments.

#### Acceptance Criteria

1. WHEN the KPI_Service loads the "Clientes na Carteira" KPI for a player, THE KPI_Service SHALL read the company list exclusively from `player.extra.cnpj_resp`, removing all references to `player.extra.cnpj`.
2. WHEN the KPI_Service counts the number of companies for the "Clientes na Carteira" KPI, THE KPI_Service SHALL split the `cnpj_resp` string by comma or semicolon, trim whitespace, filter empty entries, and count the resulting items.
3. WHEN the Company_Service fetches the company list for a player, THE Company_Service SHALL read company IDs exclusively from `player.extra.cnpj_resp`, removing all references to `player.extra.cnpj` and `player.extra.companies`.
4. IF the `player.extra.cnpj_resp` field is null or empty, THEN THE KPI_Service SHALL return a company count of zero for the "Clientes na Carteira" KPI.
5. THE KPI_Service, Company_Service, and all other services SHALL contain zero references to `player.extra.cnpj` after migration — `cnpj_resp` is the sole source for player CNPJ data.

### Requirement 3: Migrate All Metrics and Player Lookups to Use cnpj_resp Exclusively

**User Story:** As a product owner, I want every place in the application that looks up which CNPJs belong to a player to use `player.extra.cnpj_resp` exclusively, so that data is consistent across the entire application.

#### Acceptance Criteria

1. WHEN the Team_Management_Dashboard loads team KPIs, THE Team_Management_Dashboard SHALL read `cnpj_resp` from player_status extra data instead of `cnpj` to calculate the "Clientes na Carteira" metric.
2. WHEN the Action_Log_Service queries action_log records, THE Action_Log_Service SHALL use `attributes.cnpj` as the field name in action_log query filters, since `attributes.cnpj` is the field name within the action_log record structure and is unrelated to the player extra field migration.
3. WHEN the Team_Aggregate_Service queries action_log aggregate data, THE Team_Aggregate_Service SHALL use `attributes.cnpj` as the field name in action_log aggregate query filters, since `attributes.cnpj` is the field name within the action_log record structure and is unrelated to the player extra field migration.
4. WHEN any service needs to determine which CNPJs belong to a player (to then query action_log or other data), THE service SHALL read the CNPJ list from `player.extra.cnpj_resp` exclusively, removing all references to `player.extra.cnpj`.
5. THE application SHALL contain zero references to `player.extra.cnpj` after migration — every player CNPJ lookup uses `cnpj_resp`, while action_log records retain their own `attributes.cnpj` field unchanged.

### Requirement 4: Goal Setting for SUPERVISOR and GESTOR Views

**User Story:** As a supervisor or gestor, I want to set metric goals (cnpj_goal and entrega_goal) for each collaborator, so that the values feed into the existing colored circle metric components (c4u-kpi-circular) that already display goals on the collaborator dashboard.

#### Acceptance Criteria

1. WHEN the Team_Management_Dashboard loads for a SUPERVISOR or GESTOR user, THE Team_Management_Dashboard SHALL display input fields for cnpj_goal and entrega_goal per collaborator, allowing the supervisor/gestor to set goal values that will be consumed by the existing metric circle components.
2. WHEN the SUPERVISOR or GESTOR submits a cnpj_goal value for a collaborator, THE Team_Management_Dashboard SHALL send a PUT request to `https://service2.funifier.com/v3/player/{playerId}` with body `{"extra": {"cnpj_goal": value}}`.
3. WHEN the SUPERVISOR or GESTOR submits an entrega_goal value for a collaborator, THE Team_Management_Dashboard SHALL send a PUT request to `https://service2.funifier.com/v3/player/{playerId}` with body `{"extra": {"entrega_goal": value}}`.
4. WHEN the SUPERVISOR or GESTOR selects "Todos os Colaboradores" and submits the goal form, THE Team_Management_Dashboard SHALL send individual PUT requests for each collaborator in the team with the specified cnpj_goal and entrega_goal values.
5. IF the PUT request to update a player goal fails, THEN THE Team_Management_Dashboard SHALL display an error message indicating which collaborator update failed.
6. WHEN the goal is saved successfully, THE Team_Management_Dashboard SHALL display a success message confirming the goal was saved.
7. THE Team_Management_Dashboard goal form SHALL validate that cnpj_goal is a non-negative integer and entrega_goal is a number between 0 and 100.

### Requirement 5: Feed Dynamic Goals into Existing Metric Circle Components

**User Story:** As a collaborator, I want the existing colored circle metric components (c4u-kpi-circular) on my dashboard to use the goals set by my supervisor, so that the target values shown are dynamic instead of hardcoded.

#### Acceptance Criteria

1. WHEN the KPI_Service loads the "Clientes na Carteira" KPI for a player, THE KPI_Service SHALL read the target value from `player.extra.cnpj_goal` instead of any hardcoded or static value, and pass it to the existing c4u-kpi-circular component which already renders the goal display.
2. WHEN the KPI_Service loads the "Entregas no Prazo" KPI for a player, THE KPI_Service SHALL read the target value from `player.extra.entrega_goal` instead of the hardcoded value of 90, and pass it to the existing c4u-kpi-circular component which already renders the goal display.
3. IF the `player.extra.cnpj_goal` field is null or undefined, THEN THE KPI_Service SHALL use a default target of 10 for the "Clientes na Carteira" KPI.
4. IF the `player.extra.entrega_goal` field is null or undefined, THEN THE KPI_Service SHALL use a default target of 90 for the "Entregas no Prazo" KPI.
5. WHEN the Team_Management_Dashboard loads team KPIs, THE Team_Management_Dashboard SHALL sum `cnpj_goal` values from all team members to calculate the team-level "Clientes na Carteira" target.
6. WHEN the Team_Management_Dashboard loads team KPIs, THE Team_Management_Dashboard SHALL average `entrega_goal` values from all team members to calculate the team-level "Entregas no Prazo" target.
7. THE existing c4u-kpi-circular component SHALL continue to be used as-is for rendering goals — no new goal display UI is created.

### Requirement 6: Simplify Activity Count in Clientes/Carteira Table

**User Story:** As a user, I want the activity count in the clientes/carteira table to show the total number of action_log entries per CNPJ, so that the metric is simpler and more accurate.

#### Acceptance Criteria

1. WHEN the Action_Log_Service queries the activity count for a CNPJ in the carteira table, THE Action_Log_Service SHALL count all action_log entries matching that CNPJ instead of counting distinct delivery_id values.
2. WHEN the Team_Aggregate_Service queries the team CNPJ list with counts, THE Team_Aggregate_Service SHALL return the total action_log count per CNPJ as the activity count.
3. WHEN the carteira table displays the activity count for a CNPJ, THE Team_Management_Dashboard SHALL display the label "tarefas" next to the total action_log count.
4. THE Action_Log_Service SHALL remove the separate processCount query that counts distinct delivery_id values per CNPJ from the `getPlayerCnpjListWithCount` method.
5. THE Team_Aggregate_Service SHALL remove the `uniqueProcesses` addToSet and `processCount` size projection from the `getTeamCnpjListWithCount` method.
6. WHILE the Month_Filter is active, THE Action_Log_Service SHALL filter all CNPJ action_log counts by the selected month date range.
