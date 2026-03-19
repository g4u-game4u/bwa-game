# Requirements Document

## Introduction

Refatoração completa do sistema de ACL (Access Control List) e dos dashboards para os perfis SUPERVISOR, GESTOR, DIRETOR e o novo perfil SUPERVISOR TÉCNICO. O sistema atual determina perfis exclusivamente por membership em teams do Funifier. O novo sistema utiliza Virtual Goods do Funifier como chaves de permissão/visibilidade, mantendo teams apenas para definir o papel (Role) do usuário (Jogador Regular vs Usuário Administrativo). Cada equipe operacional possui um Virtual Good correspondente com IDs sincronizados (team _id = virtual good _id), eliminando tabelas de conversão. Além disso, os dashboards de SUPERVISOR e SUPERVISOR TÉCNICO serão redesenhados com novas views (Card View, Table View, modais de detalhe de jogador) e o SUPERVISOR TÉCNICO terá um dashboard secundário somente-leitura (sem inputs de meta).

## Glossary

- **ACL_Service**: Serviço Angular responsável por verificar permissões de acesso do usuário consultando Virtual Goods via API Funifier.
- **Virtual_Good**: Item do catálogo "acla" no Funifier que funciona como chave de permissão. Cada Virtual Good corresponde a uma equipe operacional com IDs sincronizados.
- **Catalog_Items**: Objeto retornado pela API `GET /v3/player/:id/status` contendo os Virtual Goods que o jogador possui, com campo `quantity` indicando posse.
- **Role_Team**: Team especial/administrativo do Funifier que define o papel do usuário no sistema (não confundir com equipe operacional).
- **Operational_Team**: Equipe operacional do Funifier à qual jogadores pertencem para fins de trabalho e métricas.
- **ACL_Metadata**: Coleção customizada `acl__c` no Funifier que correlaciona team_name, team_id, virtual_good_name e virtual_good_id.
- **Zero_Mapping**: Arquitetura onde team _id = virtual good _id, eliminando necessidade de tabelas de conversão.
- **Player_Status_API**: Endpoint `GET /v3/player/:id/status` do Funifier que retorna dados do jogador incluindo catalog_items.
- **Dashboard_Supervisor**: Dashboard principal do SUPERVISOR com Card View e Table View dos jogadores de suas equipes.
- **Dashboard_Supervisor_Tecnico**: Dashboard secundário do SUPERVISOR TÉCNICO, similar ao GESTOR/DIRETOR mas sem inputs de meta.
- **Dashboard_Gestor**: Dashboard de gestão de equipe para GESTOR, com KPIs, metas e tabela de clientes.
- **Dashboard_Diretor**: Dashboard de gestão de equipe para DIRETOR, com visão de todas as equipes.
- **Card_View**: Visualização padrão do Dashboard_Supervisor mostrando cards individuais por jogador.
- **Table_View**: Visualização alternativa do Dashboard_Supervisor mostrando jogadores em formato tabular.
- **Player_Detail_Modal**: Modal aberto ao clicar em um jogador (card ou linha), exibindo dados detalhados, CNPJs e ações.
- **Month_Filter**: Seletor de mês no topo do dashboard que filtra todos os dados exibidos.
- **Funifier_API**: API REST do Funifier em `https://service2.funifier.com` usada para ler e atualizar dados.
- **UserProfile**: Enum que define os perfis de usuário: JOGADOR, SUPERVISOR, GESTOR, DIRETOR, SUPERVISOR_TECNICO.
- **empid_cnpj__c**: Coleção customizada no Funifier que mapeia company name e cnpj__c para métricas individuais de empresa.
- **Action_Log**: Coleção de registros de ações realizadas por jogadores, contendo attributes.acao, attributes.cnpj, achievements, etc.
- **cnpj_resp**: Campo no player status que contém a lista de CNPJs (clientes) sob responsabilidade do jogador.
- **pontos_supervisor**: Campo específico no player object usado para armazenar os pontos do perfil SUPERVISOR, distinto do campo `points` usado pelos demais perfis.

## Data Schemas

### Player Status API Response (catalog_items)

```json
{
  "catalog_items": {
    "VIRTUAL_GOOD_ID_1": {
      "quantity": 1,
      "item": "VIRTUAL_GOOD_ID_1"
    },
    "VIRTUAL_GOOD_ID_2": {
      "quantity": 0,
      "item": "VIRTUAL_GOOD_ID_2"
    }
  }
}
```

**Regras de posse:**
- `quantity > 0` = jogador possui o item (acesso concedido)
- `quantity <= 0` ou item ausente = acesso revogado
- IDs são case-sensitive

### ACL Metadata Collection (acl__c)

```json
{
  "team_name": "Departamento Pessoal",
  "team_id": "ABC123",
  "virtual_good_name": "ACL - Departamento Pessoal",
  "virtual_good_id": "ABC123"
}
```

### Role Teams (Special/Administrative)

| Role | Team ID | Team Name |
|------|---------|-----------|
| Diretor | FkmdhZ9 | DIREÇÃO |
| Gestor | FkmdnFU | GESTÃO |
| Supervisor | Fkmdmko | SUPERVISÃO |
| Supervisor Técnico | Fn2lrg3 | SUPERVISÃO TÉCNICA |


## Requirements

### Requirement 1: Virtual Goods-Based ACL Verification

**User Story:** As a system administrator, I want the ACL system to use Funifier Virtual Goods instead of team membership for determining data visibility, so that permissions can be granted and revoked granularly without changing team assignments.

#### Acceptance Criteria

1. WHEN the ACL_Service checks a user's data access permissions, THE ACL_Service SHALL call `GET /v3/player/:id/status` and inspect the `catalog_items` object for Virtual Good possession.
2. WHEN a Virtual Good entry exists in `catalog_items` with `quantity > 0`, THE ACL_Service SHALL consider the user as having access to the corresponding Operational_Team's data.
3. WHEN a Virtual Good entry exists in `catalog_items` with `quantity <= 0`, THE ACL_Service SHALL consider the user's access to the corresponding Operational_Team's data as revoked.
4. WHEN a Virtual Good entry is absent from `catalog_items`, THE ACL_Service SHALL consider the user as not having access to the corresponding Operational_Team's data.
5. THE ACL_Service SHALL treat Virtual Good IDs as case-sensitive when performing lookups in `catalog_items`.
6. THE ACL_Service SHALL use the Zero_Mapping architecture where the Operational_Team `_id` is identical to the Virtual Good `_id`, requiring no conversion tables.

### Requirement 2: Role Determination via Role Teams

**User Story:** As a system administrator, I want user roles (JOGADOR, SUPERVISOR, GESTOR, DIRETOR, SUPERVISOR_TECNICO) to be determined by membership in Role Teams, so that role assignment remains simple and team-based.

#### Acceptance Criteria

1. WHEN the UserProfile is determined for a user, THE ACL_Service SHALL check the user's teams array for Role_Team IDs: FkmdhZ9 (Diretor), FkmdnFU (Gestor), Fkmdmko (Supervisor), Fn2lrg3 (Supervisor Técnico).
2. WHEN a user belongs to Role_Team Fn2lrg3 and does not belong to any higher-priority Role_Team (Fkmdmko, FkmdnFU, FkmdhZ9), THE ACL_Service SHALL assign the SUPERVISOR_TECNICO profile.
3. WHEN a user belongs to Role_Team Fkmdmko, THE ACL_Service SHALL assign the SUPERVISOR profile with priority over SUPERVISOR_TECNICO.
4. WHEN a user belongs to Role_Team FkmdnFU, THE ACL_Service SHALL assign the GESTOR profile with priority over SUPERVISOR and SUPERVISOR_TECNICO.
5. WHEN a user belongs to Role_Team FkmdhZ9, THE ACL_Service SHALL assign the DIRETOR profile with highest priority.
6. WHEN a user does not belong to any Role_Team, THE ACL_Service SHALL assign the JOGADOR profile.
7. THE ACL_Service SHALL determine accessible teams by reading Virtual Goods from `catalog_items` instead of inferring them from team membership.

### Requirement 3: ACL Metadata Lookup

**User Story:** As a developer, I want to access ACL metadata that correlates team names, team IDs, virtual good names, and virtual good IDs, so that the UI can display human-readable names for permissions.

#### Acceptance Criteria

1. THE ACL_Service SHALL fetch ACL metadata from the `acl__c` custom collection via the Funifier_API.
2. WHEN displaying team access information in the UI, THE ACL_Service SHALL use the `team_name` and `virtual_good_name` fields from ACL_Metadata for human-readable labels.
3. WHEN correlating a Virtual Good to an Operational_Team, THE ACL_Service SHALL use the `virtual_good_id` field from ACL_Metadata, which matches the `team_id` field (Zero_Mapping).
4. IF the `acl__c` collection is unavailable or returns an error, THEN THE ACL_Service SHALL fall back to displaying raw IDs and log the error.

### Requirement 4: GESTOR and DIRETOR Dashboard Access

**User Story:** As a GESTOR or DIRETOR, I want to keep the current team management dashboard with metric goal inputs, so that I can continue managing teams and setting goals for collaborators.

#### Acceptance Criteria

1. WHEN a GESTOR user accesses the team management dashboard, THE Dashboard_Gestor SHALL display the existing team management interface with KPIs, metric goal inputs, and client/portfolio tables.
2. WHEN a DIRETOR user accesses the team management dashboard, THE Dashboard_Diretor SHALL display the existing team management interface with access to all teams.
3. WHEN the Dashboard_Gestor or Dashboard_Diretor loads team data, THE dashboard SHALL determine visible teams by checking which Virtual Goods the user possesses with `quantity > 0` in `catalog_items`.
4. WHEN the Dashboard_Gestor or Dashboard_Diretor loads team member data, THE dashboard SHALL display players belonging to the Operational_Teams for which the user has Virtual Good access.
5. WHEN a GESTOR or DIRETOR sets metric goals (cnpj_goal, entrega_goal) for a collaborator, THE dashboard SHALL send a PUT request to update the player's extra fields via Funifier_API.

### Requirement 5: SUPERVISOR TÉCNICO Profile and Main Dashboard

**User Story:** As a SUPERVISOR TÉCNICO, I want my main dashboard to be the regular player dashboard showing my own progress, so that I can track my personal metrics as a regular team member.

#### Acceptance Criteria

1. WHEN a SUPERVISOR_TECNICO user logs in, THE system SHALL display the regular player dashboard (Dashboard_Colaborador) as the main view.
2. THE Dashboard_Colaborador for a SUPERVISOR_TECNICO SHALL show the user's own KPIs, points, progress, and client portfolio identical to a JOGADOR user.
3. WHEN the main dashboard loads for a SUPERVISOR_TECNICO, THE system SHALL display a navigation button to access the secondary management dashboard (Dashboard_Supervisor_Tecnico).
4. THE SUPERVISOR_TECNICO user SHALL belong to a regular Operational_Team and be treated as a regular player on that team for metrics and ranking purposes.

### Requirement 6: SUPERVISOR TÉCNICO Secondary Dashboard

**User Story:** As a SUPERVISOR TÉCNICO, I want a secondary dashboard similar to GESTOR/DIRETOR to see how users under my guidance are doing, so that I can monitor team performance without setting goals.

#### Acceptance Criteria

1. WHEN a SUPERVISOR_TECNICO clicks the management dashboard button, THE system SHALL navigate to the Dashboard_Supervisor_Tecnico view.
2. THE Dashboard_Supervisor_Tecnico SHALL display team KPIs, player lists, and performance data for teams the user has Virtual Good access to.
3. THE Dashboard_Supervisor_Tecnico SHALL NOT display metric goal input fields (cnpj_goal, entrega_goal) — the view is read-only for metrics.
4. WHEN the Dashboard_Supervisor_Tecnico loads team data, THE dashboard SHALL determine visible teams by checking which Virtual Goods the user possesses with `quantity > 0`.
5. THE Dashboard_Supervisor_Tecnico SHALL provide a button to return to the main player dashboard (Dashboard_Colaborador).
6. WHEN the Dashboard_Supervisor_Tecnico displays player data, THE dashboard SHALL show the same KPI and progress information as the GESTOR dashboard, excluding goal-setting controls.

### Requirement 7: SUPERVISOR Main Dashboard — Card View (Default)

**User Story:** As a SUPERVISOR, I want a redesigned main dashboard with a Card View showing each player on my teams, so that I can quickly see individual player status at a glance.

#### Acceptance Criteria

1. WHEN a SUPERVISOR user logs in, THE Dashboard_Supervisor SHALL display the Card View as the default view.
2. THE Card View SHALL display one card per player from all Operational_Teams the SUPERVISOR has Virtual Good access to.
3. WHEN a player belongs to multiple teams visible to the SUPERVISOR, THE Card View SHALL show that player once with all assigned teams listed on the card.
4. EACH player card SHALL display: player name, current metrics and goals, current assigned teams, and current points total.
5. WHILE the Month_Filter is set to a specific month, THE Card View SHALL filter all player metrics and points by the selected month's date range.
6. WHEN the Month_Filter is set to "Toda temporada", THE Card View SHALL display unfiltered season-wide data for all players.

### Requirement 8: SUPERVISOR Main Dashboard — Table View

**User Story:** As a SUPERVISOR, I want an alternative Table View of my team players, so that I can compare player metrics side by side in a compact format.

#### Acceptance Criteria

1. WHEN the SUPERVISOR selects the Table View toggle, THE Dashboard_Supervisor SHALL switch from Card View to a tabular layout.
2. THE Table View SHALL display one row per player with columns for: player name, current metrics, current goals, and current points total.
3. WHEN a player row is clicked in the Table View, THE Dashboard_Supervisor SHALL open the same Player_Detail_Modal as clicking a card in Card View.
4. THE Table View SHALL use the same data source and Month_Filter as the Card View.
5. WHEN the SUPERVISOR switches between Card View and Table View, THE Dashboard_Supervisor SHALL preserve the current Month_Filter selection and loaded data.

### Requirement 9: Player Detail Modal

**User Story:** As a SUPERVISOR, I want to click on a player card or row to see detailed data including CNPJs and actions, so that I can drill down into individual player performance.

#### Acceptance Criteria

1. WHEN a SUPERVISOR clicks a player card (Card View) or player row (Table View), THE Dashboard_Supervisor SHALL open the Player_Detail_Modal for that player.
2. THE Player_Detail_Modal SHALL display a first tab with detailed player data and a table of all CNPJs (from `cnpj_resp`) the player has acted on, with current metrics per CNPJ.
3. WHEN a CNPJ row is clicked in the Player_Detail_Modal, THE modal SHALL display the same detailed CNPJ view as clicking a CNPJ in the Clientes/Carteira table (company detail modal).
4. THE Player_Detail_Modal SHALL display a second tab listing all actions performed by the player, with columns: action name (`attributes.acao` from Action_Log), company (cross-referencing `attributes.cnpj` with `empid_cnpj__c` for company name and `cnpj__c` for individual metrics), metrics, date, and points (achievements from that Action_Log entry).
5. WHILE the Month_Filter is active, THE Player_Detail_Modal SHALL filter displayed CNPJs and actions by the selected month's date range.
6. WHEN the Month_Filter is set to "Toda temporada", THE Player_Detail_Modal SHALL display unfiltered season-wide data.
7. WHEN the user clicks the close button or outside the modal, THE Player_Detail_Modal SHALL close and return to the Card View or Table View.

### Requirement 10: SUPERVISOR Left Info Card

**User Story:** As a SUPERVISOR, I want to see my own current metrics and points on the dashboard, so that I can track my personal performance alongside my team's.

#### Acceptance Criteria

1. THE Dashboard_Supervisor SHALL display a left-side card showing the SUPERVISOR's own current metrics, points (from `pontos_supervisor` field), coins (from `coins` field), and goals.
2. THE left info card SHALL fetch the SUPERVISOR's data from the Player_Status_API, using the same data source as regular player dashboards.
3. WHILE the Month_Filter is active, THE left info card SHALL filter the SUPERVISOR's metrics by the selected month's date range.
4. THE left info card SHALL display: SUPERVISOR name, current metrics (KPIs), current points total (from `pontos_supervisor`), current coins (from `coins`), and current goals.
5. THE left info card SHALL fetch the SUPERVISOR's own cnpj metric from `extra.cnpj_sup` and entrega metric from `extra.entrega_sup` on the player object, instead of the regular `extra.cnpj` and `extra.entrega` fields.

### Requirement 11: SUPERVISOR Access to Legacy Management Dashboard

**User Story:** As a SUPERVISOR, I want a button to access the current GESTOR/DIRETOR-style management dashboard with metric goal inputs, so that I can still set goals for collaborators.

#### Acceptance Criteria

1. THE Dashboard_Supervisor SHALL display a navigation button to access the legacy team management dashboard (Dashboard_Gestor style).
2. WHEN the SUPERVISOR clicks the legacy dashboard button, THE system SHALL navigate to the existing team management dashboard with full metric goal input capabilities.
3. THE legacy management dashboard for SUPERVISOR SHALL use Virtual Good-based ACL to determine visible teams, consistent with the new ACL system.
4. THE legacy management dashboard for SUPERVISOR SHALL provide a button to return to the new Dashboard_Supervisor (Card/Table View).

### Requirement 12: SUPERVISOR Metrics Calculation Logic

**User Story:** As a product owner, I want SUPERVISOR metrics to be calculated as the average of their team players' metrics, so that the SUPERVISOR's performance reflects their team's collective output.

#### Acceptance Criteria

1. WHEN the Dashboard_Supervisor calculates the SUPERVISOR's points, THE Dashboard_Supervisor SHALL compute the arithmetic mean of all players' points across the SUPERVISOR's accessible teams.
2. WHEN the Dashboard_Supervisor calculates the SUPERVISOR's KPI metrics, THE Dashboard_Supervisor SHALL compute the arithmetic mean of all players' KPI values across the SUPERVISOR's accessible teams.
3. WHEN a team has zero players with data for the selected period, THE Dashboard_Supervisor SHALL exclude that team from the average calculation to avoid division by zero.
4. WHILE the Month_Filter is active, THE Dashboard_Supervisor SHALL calculate averages using only data from the selected month's date range.
5. WHEN displaying the SUPERVISOR's own cnpj metric, THE Dashboard_Supervisor SHALL read from `extra.cnpj_sup` on the SUPERVISOR's player object instead of `extra.cnpj`.
6. WHEN displaying the SUPERVISOR's own entrega metric, THE Dashboard_Supervisor SHALL read from `extra.entrega_sup` on the SUPERVISOR's player object instead of `extra.entrega`.

### Requirement 13: Month Filter with "Toda Temporada" Option

**User Story:** As any user, I want a month selector that includes a "Toda temporada" option, so that I can view data for a specific month or the entire season.

#### Acceptance Criteria

1. THE Month_Filter component SHALL display month navigation (previous/next) and a "Toda temporada" (whole season) option.
2. WHEN the user selects a specific month, THE Month_Filter SHALL emit the selected month's start and end date range for all dashboard components to filter by.
3. WHEN the user selects "Toda temporada", THE Month_Filter SHALL emit a null or season-wide date range indicating no month filtering.
4. WHEN the dashboard loads, THE Month_Filter SHALL default to the current month.
5. THE Month_Filter SHALL be displayed at the top of the Dashboard_Supervisor, Dashboard_Supervisor_Tecnico, Dashboard_Gestor, Dashboard_Diretor, and Dashboard_Colaborador views.
6. WHEN a JOGADOR user views the Dashboard_Colaborador, THE Month_Filter SHALL provide the same "Toda temporada" option available to management profiles.

### Requirement 14: Dashboard Routing and Navigation

**User Story:** As a developer, I want clear routing rules for all dashboard types based on user profile, so that each user is directed to the correct dashboard automatically.

#### Acceptance Criteria

1. WHEN a JOGADOR user navigates to the dashboard, THE system SHALL display the regular player dashboard (Dashboard_Colaborador).
2. WHEN a SUPERVISOR user navigates to the dashboard, THE system SHALL display the new Dashboard_Supervisor (Card/Table View) as the default.
3. WHEN a SUPERVISOR_TECNICO user navigates to the dashboard, THE system SHALL display the regular player dashboard (Dashboard_Colaborador) with a button to access Dashboard_Supervisor_Tecnico.
4. WHEN a GESTOR user navigates to the dashboard, THE system SHALL display the Dashboard_Gestor (existing team management dashboard).
5. WHEN a DIRETOR user navigates to the dashboard, THE system SHALL display the Dashboard_Diretor (existing team management dashboard with all-teams access).
6. WHEN a user without a valid session navigates to any dashboard, THE system SHALL redirect to the login page.
7. WHEN a JOGADOR user attempts to access a management dashboard URL directly, THE system SHALL redirect to the regular player dashboard.

### Requirement 15: Error Handling for ACL Verification

**User Story:** As a user, I want the system to handle ACL verification failures gracefully, so that I can still use the application even when permission checks encounter issues.

#### Acceptance Criteria

1. IF the Player_Status_API call fails during ACL verification, THEN THE ACL_Service SHALL log the error and deny access to management features, redirecting to the regular player dashboard.
2. IF the `catalog_items` field is missing or malformed in the Player_Status_API response, THEN THE ACL_Service SHALL treat the user as having no Virtual Good access and log a warning.
3. IF the `acl__c` metadata collection query fails, THEN THE ACL_Service SHALL continue operating with raw IDs and log the error.
4. WHEN an ACL verification error occurs, THE system SHALL display a user-friendly notification explaining that permission data could not be loaded.
5. THE ACL_Service SHALL cache successful ACL verification results for 5 minutes to reduce API calls and improve resilience against transient failures.

### Requirement 16: Points and Coins Field Differentiation by Profile

**User Story:** As a product owner, I want each user profile to read points from the correct field on the player object, so that SUPERVISOR points are tracked separately from regular player points.

#### Acceptance Criteria

1. WHEN displaying points for a SUPERVISOR user, THE system SHALL read from the `pontos_supervisor` field on the player object.
2. WHEN displaying points for a JOGADOR, GESTOR, DIRETOR, or SUPERVISOR_TECNICO user, THE system SHALL read from the `points` field on the player object.
3. WHEN displaying coins ("moedas") for any UserProfile, THE system SHALL read from the `coins` field on the player object.
4. THE system SHALL NOT display locked points ("pontos bloqueados") on any dashboard for any UserProfile.

### Requirement 17: SUPERVISOR Dashboard — Client List Section

**User Story:** As a SUPERVISOR, I want to see my own client list on my dashboard, so that I can track my personal portfolio alongside my team's performance.

#### Acceptance Criteria

1. THE Dashboard_Supervisor SHALL display a client list section showing the SUPERVISOR's own clients fetched from the `cnpj_resp` field on the SUPERVISOR's player status.
2. THE client list section SHALL be positioned as the lowest section on the Dashboard_Supervisor, below the team player cards (Card View) or table (Table View).
3. WHEN the client list loads, THE Dashboard_Supervisor SHALL fetch the SUPERVISOR's `cnpj_resp` data from the Player_Status_API and cross-reference with `empid_cnpj__c` for company names and individual metrics.
4. WHILE the Month_Filter is active, THE client list section SHALL filter displayed client data by the selected month's date range.
5. WHEN the Month_Filter is set to "Toda temporada", THE client list section SHALL display unfiltered season-wide client data.
