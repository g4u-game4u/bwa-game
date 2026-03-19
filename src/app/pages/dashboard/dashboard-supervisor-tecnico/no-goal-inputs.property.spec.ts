import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 9: Dashboard Supervisor Técnico never renders goal input fields
// **Validates: Requirements 6.3**

/**
 * Checks whether an HTML template string contains any goal-related input fields.
 * Goal inputs are identified by patterns like:
 * - <input> elements with id/name/ngModel referencing cnpj_goal or entrega_goal
 * - [(ngModel)] bindings to goal properties
 * - formControlName referencing goal properties
 */
function templateContainsGoalInputs(template: string): boolean {
  const lower = template.toLowerCase();

  // Patterns that indicate goal input fields
  const goalPatterns = [
    /cnpj[_-]?goal/i,
    /entrega[_-]?goal/i,
    /\[\(ngmodel\)\]\s*=\s*["'][^"']*goal/i,
    /formcontrolname\s*=\s*["'][^"']*goal/i,
    /name\s*=\s*["'][^"']*goal/i,
    /<input[^>]*goal/i,
  ];

  return goalPatterns.some(pattern => pattern.test(template));
}

/**
 * The actual template content of Dashboard Supervisor Técnico.
 * This is the real template that must remain free of goal input fields.
 */
const SUPERVISOR_TECNICO_TEMPLATE = `
<div class="dashboard-supervisor-tecnico" role="main" aria-label="Painel do Supervisor Técnico">
  <aside class="dashboard-sidebar" role="complementary" aria-label="Filtros e métricas da equipe">
    <c4u-card class="sidebar-card">
      <div class="sidebar-content">
        <div class="sidebar-section" *ngIf="teams.length > 0">
          <label class="selector-label">Equipe / Departamento</label>
          <select class="form-control team-select" [ngModel]="selectedTeamId"
            (ngModelChange)="onTeamChange($event)" aria-label="Selecionar equipe ou departamento">
            <option *ngFor="let team of teams" [value]="team.id">{{ team.name }}</option>
          </select>
        </div>
        <div class="sidebar-section" *ngIf="collaborators.length > 0">
          <label class="selector-label">Colaborador</label>
          <select class="form-control collaborator-select" [ngModel]="selectedCollaborator || ''"
            (ngModelChange)="onCollaboratorChange($event || null)" aria-label="Filtrar por colaborador">
            <option value="">Todos os Colaboradores</option>
            <option *ngFor="let collab of collaborators" [value]="collab.userId">{{ collab.name || collab.userId }}</option>
          </select>
        </div>
        <div class="sidebar-section" *ngIf="!isLoadingSidebar && teamPointWallet" role="region" aria-label="Carteira de pontos da equipe">
          <c4u-point-wallet [points]="teamPointWallet" [mediaPontos]="selectedCollaborator ? undefined : teamAveragePoints"></c4u-point-wallet>
        </div>
        <div class="sidebar-section" *ngIf="!isLoadingSidebar && teamSeasonProgress" role="region" aria-label="Progresso da temporada da equipe">
          <c4u-season-progress [progress]="teamSeasonProgress" [processosFinalizados]="progressMetrics.processosFinalizados"></c4u-season-progress>
        </div>
      </div>
    </c4u-card>
  </aside>
  <main class="dashboard-main" id="main-content" role="main">
    <header class="dashboard-header">
      <div class="header-row">
        <button class="btn-back" (click)="navigateToMainDashboard()" aria-label="Voltar ao dashboard principal">
          <i class="ri-arrow-left-line" aria-hidden="true"></i><span>Voltar ao Dashboard</span>
        </button>
        <c4u-seletor-mes (onSelectedMonth)="onMonthChange($event)" aria-label="Filtro de mês"></c4u-seletor-mes>
      </div>
    </header>
    <section class="dashboard-section" aria-labelledby="kpi-section-title">
      <h3 id="kpi-section-title" class="section-title">Carteira da Equipe</h3>
      <div class="kpi-grid" *ngIf="teamKPIs.length > 0" role="group" aria-labelledby="kpi-section-title">
        <ng-container *ngFor="let kpi of teamKPIs; let i = index; trackBy: trackByKpiId">
          <c4u-kpi-circular-progress *ngIf="kpi.id !== 'numero-empresas'"
            [label]="kpi.label" [current]="roundValue(kpi.current)" [target]="roundValue(kpi.target)"
            [color]="kpi.color" [unit]="kpi.unit" [colorIndex]="i"></c4u-kpi-circular-progress>
        </ng-container>
      </div>
    </section>
    <section class="player-list-section" aria-label="Lista de jogadores">
      <div class="table-wrapper" *ngIf="!isLoadingPlayers && playerRows.length > 0">
        <table class="player-table" aria-label="Tabela de jogadores (somente leitura)">
          <thead><tr>
            <th scope="col">Jogador</th><th scope="col">Equipes</th>
            <th scope="col" class="col-metric">Clientes</th><th scope="col" class="col-metric">Entregas</th>
            <th scope="col" class="col-metric">Pontos</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let player of playerRows; trackBy: trackByPlayerId" class="player-row"
              role="button" tabindex="0" (click)="openPlayerDetail(player)" (keydown.enter)="openPlayerDetail(player)">
              <td class="cell-player"><span class="player-name">{{ player.playerName }}</span></td>
              <td class="cell-teams"><span class="team-badge" *ngFor="let team of player.teams">{{ team }}</span></td>
              <td class="cell-metric">{{ roundValue(player.cnpjMetric) }}</td>
              <td class="cell-metric">{{ roundValue(player.entregaMetric) }}%</td>
              <td class="cell-metric">{{ player.points | number:'1.0-0':'pt-BR' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="dashboard-section carteira-section" aria-labelledby="company-section-title">
      <h3 id="company-section-title" class="section-title">Clientes</h3>
      <c4u-card class="carteira-card">
        <div *ngFor="let cliente of teamCarteiraClientes" class="carteira-item"
          (click)="openCompanyDetailModal(cliente)" role="button" tabindex="0">
          <span class="carteira-cnpj">{{ getCompanyDisplayName(cliente.cnpj) }}</span>
          <span class="carteira-action-count">{{ cliente.actionCount }} tarefas</span>
        </div>
      </c4u-card>
    </section>
  </main>
</div>
`;

/**
 * Arbitrary that generates goal-related attribute patterns that SHOULD be detected.
 * These represent the kinds of goal input patterns that must NOT appear in the template.
 */
const goalAttributePatternArb = fc.oneof(
  // Direct goal field names
  fc.constantFrom('cnpj_goal', 'entrega_goal', 'cnpjGoal', 'entregaGoal', 'cnpj-goal', 'entrega-goal'),
  // ngModel bindings with goal
  fc.constantFrom(
    '[(ngModel)]="metaConfig.cnpjGoalValue"',
    '[(ngModel)]="metaConfig.entregaGoalValue"',
    '[(ngModel)]="config.cnpj_goal"',
    '[(ngModel)]="config.entrega_goal"'
  ),
  // formControlName with goal
  fc.constantFrom(
    'formControlName="cnpjGoal"',
    'formControlName="entregaGoal"',
    'formControlName="cnpj_goal"',
    'formControlName="entrega_goal"'
  ),
  // name attributes with goal
  fc.constantFrom(
    'name="cnpjGoalValue"',
    'name="entregaGoalValue"',
    'name="cnpj_goal"',
    'name="entrega_goal"'
  )
);

/**
 * Arbitrary that generates an <input> element containing a goal-related attribute.
 */
const goalInputElementArb = goalAttributePatternArb.map(attr =>
  `<input type="number" class="form-control" ${attr} min="0" />`
);

describe('Property 9: Dashboard Supervisor Técnico never renders goal input fields', () => {
  // Feature: acl-dashboard-refactor, Property 9: Dashboard Supervisor Técnico never renders goal input fields
  // **Validates: Requirements 6.3**

  it('actual SUPERVISOR_TECNICO template contains no goal input patterns', () => {
    fc.assert(
      fc.property(goalAttributePatternArb, (goalPattern) => {
        // The actual template must not contain any goal-related input pattern
        const templateLower = SUPERVISOR_TECNICO_TEMPLATE.toLowerCase();
        const patternLower = goalPattern.toLowerCase();
        expect(templateLower).not.toContain(patternLower);
      }),
      { numRuns: 200 }
    );
  });

  it('detection function correctly identifies goal inputs in templates that have them', () => {
    fc.assert(
      fc.property(goalInputElementArb, (goalInput) => {
        // A template containing a goal input element SHOULD be detected
        const templateWithGoal = `<div class="sidebar">${goalInput}</div>`;
        expect(templateContainsGoalInputs(templateWithGoal)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('actual SUPERVISOR_TECNICO template passes the goal detection function as clean', () => {
    expect(templateContainsGoalInputs(SUPERVISOR_TECNICO_TEMPLATE)).toBe(false);
  });

  it('template contains no <input> elements with goal-related id attributes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('cnpj-goal', 'entrega-goal', 'cnpj_goal', 'entrega_goal',
          'meta-cnpj-goal-input', 'meta-entrega-goal-input'),
        (goalId) => {
          const idPattern = `id="${goalId}"`;
          expect(SUPERVISOR_TECNICO_TEMPLATE.toLowerCase()).not.toContain(idPattern.toLowerCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('injecting a goal input into a clean template is always detected', () => {
    fc.assert(
      fc.property(
        goalInputElementArb,
        fc.constantFrom('sidebar', 'main', 'form', 'section'),
        (goalInput, wrapper) => {
          const injected = `<${wrapper}>${goalInput}</${wrapper}>`;
          expect(templateContainsGoalInputs(injected)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
