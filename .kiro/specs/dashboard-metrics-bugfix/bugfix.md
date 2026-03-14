# Bugfix Requirements Document

## Introduction

Este documento descreve três bugs relacionados às métricas do dashboard de gamificação que precisam ser corrigidos:

1. **Bug 1 - KPI Display**: Apenas 1 KPI está sendo exibido ao invés de 2
2. **Bug 2 - Tarefas Finalizadas**: Contagem mostra total histórico ao invés do mês selecionado
3. **Bug 3 - Metas**: Cálculo incorreto baseado em KPIs ao invés de métricas específicas do jogador

Estes bugs afetam a seção "Meu Progresso" e a exibição de KPIs no dashboard principal.

## Bug Analysis

### Bug 1: KPI Display - Apenas 1 KPI exibido

#### Current Behavior (Defect)

1.1 WHEN the dashboard loads KPIs for a player THEN the system only displays 1 KPI ("Clientes na Carteira") instead of 2

1.2 WHEN player.extra.entrega contains a valid value THEN the system does not display the "Entregas no Prazo" KPI for non-current months

#### Expected Behavior (Correct)

2.1 WHEN the dashboard loads KPIs for a player THEN the system SHALL display 2 KPIs: "Clientes na Carteira" and "Entregas no Prazo"

2.2 WHEN player.extra.entrega contains a valid value THEN the system SHALL display the "Entregas no Prazo" KPI with the value from player.extra.entrega regardless of the selected month

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN player.extra.cnpj_resp contains CNPJ values THEN the system SHALL CONTINUE TO calculate "Clientes na Carteira" count correctly

3.2 WHEN player.extra.cnpj_goal is defined THEN the system SHALL CONTINUE TO use it as the target for "Clientes na Carteira"

---

### Bug 2: Tarefas Finalizadas - Contagem incorreta

#### Current Behavior (Defect)

1.3 WHEN the "Tarefas Finalizadas" card is displayed in "Meu Progresso" section THEN the system shows all-time count from action_log (using getCompletedTasksCount without date filter)

1.4 WHEN the user changes the selected month THEN the "Tarefas Finalizadas" count does not update to reflect the selected month

#### Expected Behavior (Correct)

2.3 WHEN the "Tarefas Finalizadas" card is displayed in "Meu Progresso" section THEN the system SHALL count action_log entries registered for that player in the SELECTED MONTH only

2.4 WHEN the user changes the selected month THEN the "Tarefas Finalizadas" count SHALL update to show only entries from the newly selected month

#### Unchanged Behavior (Regression Prevention)

3.3 WHEN action_log entries are queried THEN the system SHALL CONTINUE TO filter by userId (player email)

3.4 WHEN the dashboard refreshes THEN the system SHALL CONTINUE TO clear caches and reload data

---

### Bug 3: Metas - Cálculo incorreto

#### Current Behavior (Defect)

1.5 WHEN the "Metas" count is calculated THEN the system counts KPIs where current >= target (using updateMetasFromKPIs method)

1.6 WHEN KPIs array has N items THEN the system shows Metas as X/N where X is count of KPIs above target

#### Expected Behavior (Correct)

2.5 WHEN the "Metas" count is calculated THEN the system SHALL compare:
  - player.extra.entrega (current) vs player.extra.entrega_goal (target) for "Entregas no Prazo"
  - count of player.extra.cnpj_resp (current) vs player.extra.cnpj_goal (target) for "Clientes na Carteira"

2.6 WHEN calculating Metas THEN the system SHALL show X/2 where X is the number of goals achieved (0, 1, or 2):
  - +1 if entrega >= entrega_goal
  - +1 if cnpj_resp count >= cnpj_goal

#### Unchanged Behavior (Regression Prevention)

3.5 WHEN player.extra does not contain goal values THEN the system SHALL CONTINUE TO use default fallback values (entrega_goal=90, cnpj_goal=10)

3.6 WHEN seasonProgress is null THEN the system SHALL CONTINUE TO skip metas update

---

## Bug Condition Analysis

### Bug 1: KPI Display

```pascal
FUNCTION isBugCondition_KPIDisplay(X)
  INPUT: X of type { selectedMonth: Date, currentMonth: Date, playerExtra: PlayerExtra }
  OUTPUT: boolean
  
  // Bug occurs when viewing non-current month and entrega value exists
  RETURN X.selectedMonth.month != X.currentMonth.month AND X.playerExtra.entrega != null
END FUNCTION

// Property: Fix Checking - Entregas no Prazo KPI should always display
FOR ALL X WHERE isBugCondition_KPIDisplay(X) DO
  result ← getPlayerKPIs'(X)
  ASSERT result.length = 2 AND result.some(kpi => kpi.id = 'entregas-prazo')
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_KPIDisplay(X) DO
  ASSERT getPlayerKPIs(X) = getPlayerKPIs'(X)
END FOR
```

### Bug 2: Tarefas Finalizadas

```pascal
FUNCTION isBugCondition_TarefasFinalizadas(X)
  INPUT: X of type { playerId: string, selectedMonth: Date }
  OUTPUT: boolean
  
  // Bug always occurs - current implementation ignores selectedMonth
  RETURN true
END FUNCTION

// Property: Fix Checking - Count should be filtered by selected month
FOR ALL X WHERE isBugCondition_TarefasFinalizadas(X) DO
  result ← loadSeasonProgressDetails'(X)
  ASSERT result.tarefasFinalizadas = countActionLogEntriesForMonth(X.playerId, X.selectedMonth)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_TarefasFinalizadas(X) DO
  ASSERT loadSeasonProgressDetails(X) = loadSeasonProgressDetails'(X)
END FOR
```

### Bug 3: Metas Calculation

```pascal
FUNCTION isBugCondition_MetasCalculation(X)
  INPUT: X of type { playerExtra: PlayerExtra, kpis: KPIData[] }
  OUTPUT: boolean
  
  // Bug always occurs - current implementation uses KPIs instead of player.extra goals
  RETURN true
END FUNCTION

// Property: Fix Checking - Metas should be based on player.extra goals
FOR ALL X WHERE isBugCondition_MetasCalculation(X) DO
  result ← updateMetasFromKPIs'(X)
  entregaAchieved ← X.playerExtra.entrega >= X.playerExtra.entrega_goal
  cnpjAchieved ← count(X.playerExtra.cnpj_resp) >= X.playerExtra.cnpj_goal
  expectedCurrent ← (entregaAchieved ? 1 : 0) + (cnpjAchieved ? 1 : 0)
  ASSERT result.metas.current = expectedCurrent AND result.metas.target = 2
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_MetasCalculation(X) DO
  ASSERT updateMetasFromKPIs(X) = updateMetasFromKPIs'(X)
END FOR
```

## Affected Files

| File | Method/Location | Bug |
|------|-----------------|-----|
| `src/app/services/kpi.service.ts` | `getPlayerKPIs` | Bug 1 |
| `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts` | `loadSeasonProgressDetails` | Bug 2 |
| `src/app/services/action-log.service.ts` | `getAtividadesFinalizadas` | Bug 2 |
| `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts` | `updateMetasFromKPIs` | Bug 3 |
