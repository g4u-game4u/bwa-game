# Dashboard Metrics Bugfix Design

## Overview

Este documento descreve a correção de três bugs relacionados às métricas do dashboard de gamificação:

1. **Bug 1 - KPI Display**: O KPI "Entregas no Prazo" não é exibido para meses anteriores devido a uma verificação `isCurrentMonth` desnecessária
2. **Bug 2 - Tarefas Finalizadas**: A contagem mostra o total histórico ao invés do mês selecionado
3. **Bug 3 - Metas**: O cálculo usa KPIs ao invés das metas específicas do jogador (entrega_goal e cnpj_goal)

A estratégia de correção é mínima e focada: remover a verificação de mês para Bug 1, trocar o método de contagem para Bug 2, e refatorar o cálculo de metas para Bug 3.

## Glossary

- **Bug_Condition (C)**: A condição que dispara o bug - quando as métricas são calculadas incorretamente
- **Property (P)**: O comportamento desejado - métricas devem refletir os dados corretos do jogador
- **Preservation**: Comportamentos existentes que devem permanecer inalterados pela correção
- **isCurrentMonth**: Flag booleana que verifica se o mês selecionado é o mês atual
- **player.extra**: Objeto contendo dados extras do jogador (entrega, entrega_goal, cnpj_resp, cnpj_goal)
- **action_log**: Coleção do banco de dados que registra ações/tarefas do jogador
- **getPlayerKPIs**: Método em `kpi.service.ts` que retorna os KPIs do jogador
- **loadSeasonProgressDetails**: Método em `gamification-dashboard.component.ts` que carrega detalhes do progresso
- **updateMetasFromKPIs**: Método em `gamification-dashboard.component.ts` que calcula metas (será renomeado)

## Bug Details

### Bug 1: KPI Display - Entregas no Prazo não exibido

O bug manifesta quando o usuário visualiza um mês anterior (não o mês atual). O método `getPlayerKPIs` verifica `isCurrentMonth` antes de adicionar o KPI "Entregas no Prazo", fazendo com que ele não apareça para meses anteriores mesmo quando `player.extra.entrega` tem um valor válido.

**Formal Specification:**
```
FUNCTION isBugCondition_KPIDisplay(input)
  INPUT: input of type { selectedMonth: Date, currentMonth: Date, playerExtra: { entrega?: number } }
  OUTPUT: boolean
  
  RETURN input.selectedMonth.month != input.currentMonth.month
         AND input.selectedMonth.year != input.currentMonth.year
         AND input.playerExtra.entrega IS NOT NULL
         AND input.playerExtra.entrega IS NOT UNDEFINED
END FUNCTION
```

### Bug 2: Tarefas Finalizadas - Contagem incorreta

O bug manifesta sempre que a seção "Meu Progresso" é exibida. O método `loadSeasonProgressDetails` usa `getCompletedTasksCount(playerId)` que retorna a contagem total histórica, ao invés de `getAtividadesFinalizadas(playerId, selectedMonth)` que filtra pelo mês selecionado.

**Formal Specification:**
```
FUNCTION isBugCondition_TarefasFinalizadas(input)
  INPUT: input of type { playerId: string, selectedMonth: Date }
  OUTPUT: boolean
  
  // Bug sempre ocorre - implementação atual ignora selectedMonth
  RETURN true
END FUNCTION
```

### Bug 3: Metas - Cálculo incorreto

O bug manifesta sempre que as metas são calculadas. O método `updateMetasFromKPIs` conta quantos KPIs estão acima do target e mostra X/N (onde N é o número de KPIs). O correto é comparar `entrega` vs `entrega_goal` e `cnpj_resp count` vs `cnpj_goal`, mostrando X/2.

**Formal Specification:**
```
FUNCTION isBugCondition_MetasCalculation(input)
  INPUT: input of type { playerExtra: PlayerExtra, kpis: KPIData[] }
  OUTPUT: boolean
  
  // Bug sempre ocorre - implementação atual usa KPIs ao invés de player.extra goals
  RETURN true
END FUNCTION
```

### Examples

- **Bug 1**: Usuário seleciona "Março 2025" (mês anterior), `player.extra.entrega = 85`. Esperado: 2 KPIs exibidos. Atual: 1 KPI exibido (apenas "Clientes na Carteira")
- **Bug 2**: Usuário seleciona "Março 2025", tem 5 tarefas em março e 50 no total. Esperado: "5 Tarefas Finalizadas". Atual: "50 Tarefas Finalizadas"
- **Bug 3**: `entrega=95, entrega_goal=90, cnpj_resp count=8, cnpj_goal=10`. Esperado: "1/2 Metas" (apenas entrega atingida). Atual: "1/2 Metas" ou "2/2 Metas" dependendo dos KPIs

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- O KPI "Clientes na Carteira" deve continuar sendo calculado a partir de `player.extra.cnpj_resp`
- O target de "Clientes na Carteira" deve continuar usando `player.extra.cnpj_goal` (fallback: 10)
- A filtragem de action_log por userId deve continuar funcionando
- O refresh do dashboard deve continuar limpando caches e recarregando dados
- Os valores de fallback para goals devem continuar sendo usados quando não definidos (entrega_goal=90, cnpj_goal=10)
- O seasonProgress deve continuar sendo null-safe (skip update se null)

**Scope:**
Todas as funcionalidades que NÃO envolvem as condições de bug devem permanecer completamente inalteradas:
- Exibição de pontos e moedas
- Navegação entre meses
- Modal de detalhes de empresa
- Cálculo de cores dos KPIs
- Exibição do progresso de atividades e processos

## Hypothesized Root Cause

### Bug 1: KPI Display

1. **Verificação desnecessária de isCurrentMonth**: O código atual verifica `if (isCurrentMonth && playerStatus.extra?.entrega)` antes de adicionar o KPI "Entregas no Prazo". Esta verificação foi provavelmente adicionada por engano ou por uma suposição incorreta de que o valor de entrega só é válido para o mês atual.

### Bug 2: Tarefas Finalizadas

1. **Método incorreto sendo chamado**: O código usa `getCompletedTasksCount(playerId)` que não aceita parâmetro de mês, ao invés de `getAtividadesFinalizadas(playerId, selectedMonth)` que filtra pelo mês.

### Bug 3: Metas

1. **Lógica de cálculo incorreta**: O método `updateMetasFromKPIs` conta KPIs acima do target, mas o requisito é comparar valores específicos do player.extra com seus respectivos goals.
2. **Denominador incorreto**: O código usa `kpis.length` como denominador, mas deveria ser sempre 2 (duas metas fixas: entrega e cnpj).

## Correctness Properties

Property 1: Bug Condition - Entregas no Prazo KPI Always Displayed

_For any_ input where `player.extra.entrega` has a valid numeric value, the fixed `getPlayerKPIs` function SHALL include the "Entregas no Prazo" KPI in the returned array, regardless of whether the selected month is the current month or a previous month.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - Tarefas Finalizadas Monthly Count

_For any_ input where a player ID and selected month are provided, the fixed `loadSeasonProgressDetails` function SHALL set `seasonProgress.tarefasFinalizadas` to the count of action_log entries for that specific month only, not the all-time count.

**Validates: Requirements 2.3, 2.4**

Property 3: Bug Condition - Metas Goals-Based Calculation

_For any_ input where player.extra contains entrega, entrega_goal, cnpj_resp, and cnpj_goal values, the fixed `updateMetasFromPlayerGoals` function SHALL calculate metas as X/2 where X is the count of achieved goals: +1 if entrega >= entrega_goal, +1 if cnpj_resp count >= cnpj_goal.

**Validates: Requirements 2.5, 2.6**

Property 4: Preservation - Clientes na Carteira KPI Unchanged

_For any_ input, the fixed code SHALL continue to calculate "Clientes na Carteira" KPI from `player.extra.cnpj_resp` count with target from `player.extra.cnpj_goal`, preserving the existing calculation logic.

**Validates: Requirements 3.1, 3.2**

Property 5: Preservation - Action Log Filtering Unchanged

_For any_ input that queries action_log, the fixed code SHALL continue to filter by userId (player email), preserving the existing user isolation.

**Validates: Requirements 3.3, 3.4**

Property 6: Preservation - Default Goal Values Unchanged

_For any_ input where goal values are not defined in player.extra, the fixed code SHALL continue to use default fallback values (entrega_goal=90, cnpj_goal=10), preserving backward compatibility.

**Validates: Requirements 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/services/kpi.service.ts`

**Function**: `getPlayerKPIs`

**Specific Changes for Bug 1**:
1. **Remove isCurrentMonth check**: Remove the `if (isCurrentMonth && ...)` condition that wraps the "Entregas no Prazo" KPI creation
2. **Keep entrega value check**: Maintain the check for `playerStatus.extra?.entrega` to ensure we only show the KPI when data exists
3. **Apply in both branches**: The fix must be applied in both the actionLogService branch and the fallback branch

---

**File**: `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts`

**Function**: `loadSeasonProgressDetails`

**Specific Changes for Bug 2**:
1. **Replace method call**: Change from `this.actionLogService.getCompletedTasksCount(playerId)` to `this.actionLogService.getAtividadesFinalizadas(playerId, this.selectedMonth)`
2. **Ensure selectedMonth is passed**: Verify that `this.selectedMonth` is available in the method scope

---

**File**: `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts`

**Function**: `updateMetasFromKPIs` → rename to `updateMetasFromPlayerGoals`

**Specific Changes for Bug 3**:
1. **Rename method**: Change method name from `updateMetasFromKPIs` to `updateMetasFromPlayerGoals`
2. **Remove KPIs parameter**: The method should not receive KPIs array
3. **Add player.extra access**: Read values from `this.playerStatus.extra`
4. **Calculate entrega achievement**: Compare `entrega` vs `entrega_goal` (fallback: 90)
5. **Calculate cnpj achievement**: Compare `cnpj_resp count` vs `cnpj_goal` (fallback: 10)
6. **Set fixed denominator**: Always use 2 as the target (duas metas)
7. **Update caller**: Change the call site in `loadKPIData` to call the renamed method without KPIs parameter

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the bug conditions and assert the expected behavior. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Bug 1 - Previous Month KPI Test**: Call `getPlayerKPIs` with a previous month and valid `entrega` value (will fail on unfixed code - returns 1 KPI instead of 2)
2. **Bug 2 - Monthly Count Test**: Call `loadSeasonProgressDetails` and verify `tarefasFinalizadas` matches month-specific count (will fail on unfixed code - returns all-time count)
3. **Bug 3 - Metas Calculation Test**: Set player.extra with specific goal values and verify metas calculation (will fail on unfixed code - uses KPI-based calculation)

**Expected Counterexamples**:
- Bug 1: `getPlayerKPIs(playerId, previousMonth).length === 1` when it should be 2
- Bug 2: `seasonProgress.tarefasFinalizadas === 50` when it should be 5 (for selected month)
- Bug 3: `seasonProgress.metas === { current: 1, target: 2 }` when KPIs show different values

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
// Bug 1
FOR ALL input WHERE isBugCondition_KPIDisplay(input) DO
  result := getPlayerKPIs_fixed(input.playerId, input.selectedMonth)
  ASSERT result.length = 2
  ASSERT result.some(kpi => kpi.id = 'entregas-prazo')
END FOR

// Bug 2
FOR ALL input WHERE isBugCondition_TarefasFinalizadas(input) DO
  result := loadSeasonProgressDetails_fixed(input)
  expectedCount := getAtividadesFinalizadas(input.playerId, input.selectedMonth)
  ASSERT result.tarefasFinalizadas = expectedCount
END FOR

// Bug 3
FOR ALL input WHERE isBugCondition_MetasCalculation(input) DO
  result := updateMetasFromPlayerGoals_fixed(input)
  entregaAchieved := input.playerExtra.entrega >= input.playerExtra.entrega_goal
  cnpjAchieved := count(input.playerExtra.cnpj_resp) >= input.playerExtra.cnpj_goal
  expectedCurrent := (entregaAchieved ? 1 : 0) + (cnpjAchieved ? 1 : 0)
  ASSERT result.metas.current = expectedCurrent
  ASSERT result.metas.target = 2
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
// Bug 1 - Current month behavior unchanged
FOR ALL input WHERE NOT isBugCondition_KPIDisplay(input) DO
  ASSERT getPlayerKPIs_original(input) = getPlayerKPIs_fixed(input)
END FOR

// Bug 2 - Other progress data unchanged
FOR ALL input DO
  ASSERT loadSeasonProgressDetails_original(input).clientes = loadSeasonProgressDetails_fixed(input).clientes
END FOR

// Bug 3 - Default fallback values preserved
FOR ALL input WHERE input.playerExtra.entrega_goal IS UNDEFINED DO
  result := updateMetasFromPlayerGoals_fixed(input)
  ASSERT uses_default_entrega_goal_90(result)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug scenarios, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Current Month KPI Preservation**: Verify KPIs for current month continue to work correctly
2. **Clientes Count Preservation**: Verify clientes count from cnpj_resp continues to work
3. **Default Goals Preservation**: Verify fallback values (90, 10) are used when goals not defined
4. **Action Log Filter Preservation**: Verify userId filtering continues to work

### Unit Tests

- Test `getPlayerKPIs` returns 2 KPIs for previous month when entrega exists
- Test `getPlayerKPIs` returns 1 KPI when entrega is null/undefined
- Test `loadSeasonProgressDetails` uses month-filtered count
- Test `updateMetasFromPlayerGoals` calculates 0/2, 1/2, 2/2 correctly
- Test default fallback values are used when goals not defined

### Property-Based Tests

- Generate random months and verify KPI count is consistent
- Generate random player.extra configurations and verify metas calculation
- Generate random action_log entries and verify month filtering works

### Integration Tests

- Test full dashboard flow with month selection and KPI display
- Test metas update when player data changes
- Test tarefas count updates when month changes
