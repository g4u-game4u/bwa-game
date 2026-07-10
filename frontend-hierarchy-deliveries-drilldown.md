# Drill-down de entregas — `hierarchy-report/deliveries`

Instruções para integração no frontend. Documento gerado a partir das melhorias de performance e contrato da API (jul/2026).

---

## Endpoint

```
GET /game/reports/organization/hierarchy-report/deliveries
```

**Roles permitidas:** `GERENTE`, `DIRETOR`, `C_LEVEL`, `ADMIN`, `SERVICE`

---

## Resumo das mudanças

| Antes (problemático) | Agora (recomendado) |
|---|---|
| `all_scoring_events=true` em produção | **Não enviar** no fluxo normal da UI |
| Sempre montar árvore `diretorias → gerencias → supervisoes` | Usar árvore só quando necessário; preferir `deliveries_flat` em listas/debug |
| Payload enorme → API caía com OOM | API retorna `400` se passar de **5.000** eventos sem dedup |
| `all_scoring_events` como param principal | Usar **`dedupe_deliveries`** (param preferido) |

---

## Query params

### Obrigatórios

| Param | Exemplo | Descrição |
|---|---|---|
| `month` | `2026-07` | Mês de referência (`YYYY-MM` ou `YYYY-MM-DD`) |
| `drilldown` | `critical_client` | KPI clicado |

Valores de `drilldown`:

- `multa_risk`
- `multa_incurred`
- `near_due`
- `overdue_pending`
- `overdue_pending_justified`
- `overdue_pending_unjustified`
- `critical_client`

### Opcionais — escopo do clique

| Param | Exemplo | Descrição |
|---|---|---|
| `node_type` | `organization` | Tipo do nó onde o usuário clicou |
| `node_id` | `bwa` | Id do nó |

> `node_type` e `node_id` devem ir **juntos** ou **nenhum**.

### Específicos de `drilldown=critical_client`

| Param | Default | Descrição |
|---|---|---|
| `company_serve_key` | — | **Obrigatório.** Mesmo valor de `critical_clients.top_clients[].company_serve_key` (CNPJ digits ou `emp_id`) |
| `issue` | `all` | `all` \| `overdue` \| `late_finish` |
| `dedupe_deliveries` | `true` | `true` = 1 linha por entrega × issue (paridade com KPI). `false` = cada `user_action` |
| `all_scoring_events` | — | **Deprecated.** Equivalente a `dedupe_deliveries=false`. **Parar de usar.** |
| `include_hierarchy` | ver regra abaixo | Controla formato da resposta |

### Regra de default de `include_hierarchy`

| Situação | Default da API |
|---|---|
| `dedupe_deliveries=true` (ou omitido) | `include_hierarchy=true` → resposta com árvore |
| `dedupe_deliveries=false` ou `all_scoring_events=true` | `include_hierarchy=false` → resposta com `deliveries_flat` |

Para forçar árvore mesmo sem dedup (caso raro):

```
&dedupe_deliveries=false&include_hierarchy=true
```

---

## URLs recomendadas por cenário

### A) Tela normal — usuário clica em cliente crítico no dashboard

**Usar esta.** Paridade com os contadores do KPI (`mtd_overdue_unjustified`, `mtd_late_finish`):

```
GET /game/reports/organization/hierarchy-report/deliveries
  ?month=2026-07
  &drilldown=critical_client
  &node_type=organization
  &node_id=bwa
  &company_serve_key=23896461000190
  &issue=all
```

Não enviar `all_scoring_events`, `dedupe_deliveries` nem `include_hierarchy`.

Renderizar a partir de `response.diretorias[]`.

---

### B) Lista/tabela plana (modal, export inline, debug)

Menor payload, mais rápido:

```
GET /game/reports/organization/hierarchy-report/deliveries
  ?month=2026-07
  &drilldown=critical_client
  &node_type=organization
  &node_id=bwa
  &company_serve_key=23896461000190
  &issue=all
  &include_hierarchy=false
```

Renderizar a partir de `response.deliveries_flat[]`.

---

### C) Debug avançado — ver cada `user_action` (somente admin/dev)

```
GET /game/reports/organization/hierarchy-report/deliveries
  ?month=2026-07
  &drilldown=critical_client
  &node_type=organization
  &node_id=bwa
  &company_serve_key=23896461000190
  &issue=all
  &dedupe_deliveries=false
```

A API retorna `deliveries_flat` por default. Cada item pode ter `user_action_id`.

> **Limite:** acima de **5.000 linhas** → `400 Bad Request` com mensagem explicativa. Tratar no front.

---

### D) Outros drill-downs (multa, near_due, overdue…)

```
GET /game/reports/organization/hierarchy-report/deliveries
  ?month=2026-07
  &drilldown=multa_risk
  &node_type=diretoria
  &node_id=<id>
```

Usar `diretorias[]` normalmente. `include_hierarchy=false` também funciona para lista plana.

---

## Formato da resposta

### Com árvore (`include_hierarchy=true`, default no fluxo normal)

```typescript
interface DeliveriesResponse {
  cache_month: string;
  mtd_start: string;
  mtd_end: string;
  drilldown: string;
  drilldown_label: string;
  ref_date: string;
  total_deliveries: number;
  include_hierarchy: true;
  diretorias: Array<{
    node_id: string;
    label: string;
    delivery_count: number;
    gerencias: Array<{
      node_id: string;
      label: string;
      delivery_count: number;
      supervisoes: Array<{
        node_id: string;
        label: string;
        delivery_count: number;
        deliveries: DeliveryItem[];
      }>;
    }>;
  }>;
  // Somente drilldown=critical_client:
  company_serve_key?: string;
  critical_client_issue?: 'all' | 'overdue' | 'late_finish';
  dedupe_deliveries?: boolean;
  all_scoring_events?: boolean; // deprecated — espelha !dedupe_deliveries
  scoring_event_counts?: {
    overdue: number;
    late_finish: number;
    total: number;
    distinct_delivery_ids: number;
  };
  kpi_expected?: {
    mtd_overdue_unjustified: number;
    mtd_late_finish: number;
    source_node_type: string;
    source_node_id: string;
  };
  kpi_parity_ok?: boolean;
}
```

### Com lista plana (`include_hierarchy=false`)

Mesma interface, mas:

- `diretorias: []`
- `deliveries_flat: DeliveryItem[]` preenchido
- `total_deliveries` = length de `deliveries_flat`

### Item de entrega

```typescript
interface DeliveryItem {
  delivery_id: string;
  delivery_title: string;       // cliente
  action_title: string | null;  // tarefa/obrigação
  client_key: string | null;
  company_serve_key: string | null;
  company_cnpj_digits: string | null;
  issue_kind: 'overdue' | 'late_finish' | null; // critical_client
  user_action_id: string | null; // só quando dedupe_deliveries=false
  dt_prazo: string | null;
  dt_atraso: string | null;
  status: string | null;
  status_calc: string | null;
  points: number | null;
  finished_at: string | null;
  is_justificada: boolean | null;
  player_email: string;
  player_name: string | null;
  team_id: string;
  team_name: string | null;
}
```

---

## Lógica sugerida no front

### Helper de fetch

```typescript
type CriticalClientDeliveriesOptions = {
  month: string;
  nodeType: string;
  nodeId: string;
  companyServeKey: string;
  issue?: 'all' | 'overdue' | 'late_finish';
  /** default: true — paridade com KPI */
  dedupeDeliveries?: boolean;
  /** default: dedupe ? true : false */
  includeHierarchy?: boolean;
};

function buildDeliveriesUrl(opts: CriticalClientDeliveriesOptions): string {
  const dedupe = opts.dedupeDeliveries !== false;
  const includeHierarchy = opts.includeHierarchy ?? dedupe;

  const params = new URLSearchParams({
    month: opts.month,
    drilldown: 'critical_client',
    node_type: opts.nodeType,
    node_id: opts.nodeId,
    company_serve_key: opts.companyServeKey,
    issue: opts.issue ?? 'all',
    dedupe_deliveries: String(dedupe),
    include_hierarchy: String(includeHierarchy),
  });

  return `/game/reports/organization/hierarchy-report/deliveries?${params}`;
}
```

### Renderização

```typescript
function getDeliveriesList(response: DeliveriesResponse): DeliveryItem[] {
  if (response.include_hierarchy === false && response.deliveries_flat) {
    return response.deliveries_flat;
  }
  return response.diretorias.flatMap((d) =>
    d.gerencias.flatMap((g) =>
      g.supervisoes.flatMap((s) => s.deliveries),
    ),
  );
}
```

### Paridade KPI (opcional)

Se `kpi_parity_ok === false`, os contadores do drill-down não batem com o cache do dashboard (`kpi_expected` vs `scoring_event_counts`). Exibir aviso discreto ou log — não bloquear a UI.

---

## O que remover do front

1. **`all_scoring_events=true`** em qualquer chamada de produção/UI normal.
2. Assumir que `user_action_id` sempre existe — só vem com `dedupe_deliveries=false`.
3. Ignorar `deliveries_flat` — passar a usá-lo quando `include_hierarchy=false`.
4. Montar árvore no client a partir de lista plana quando a API já pode entregar a árvore (cenário A).

---

## Tratamento de erros

| Status | Quando | Ação no front |
|---|---|---|
| `400` | Params inválidos ou >5.000 eventos sem dedup | Toast: "Lista muito grande; use visão resumida" |
| `404` | Cache do mês/nó não encontrado | Empty state "Dados indisponíveis para este mês" |
| `500` | Erro interno | Retry + fallback; reportar se persistir |

Mensagem típica do limite de volume:

```
Too many scoring events (5234). Use dedupe_deliveries=true (default),
narrow issue=overdue|late_finish, or include_hierarchy=false.
Max without dedup: 5000.
```

---

## Checklist de implementação

- [ ] Trocar chamadas com `all_scoring_events=true` por default (sem param) ou `dedupe_deliveries=true`
- [ ] Ao abrir drill-down de cliente crítico no dashboard: URL do cenário **A**
- [ ] Modais/tabelas: cenário **B** com `include_hierarchy=false`
- [ ] Tipar resposta com `deliveries_flat`, `scoring_event_counts`, `kpi_parity_ok`
- [ ] Exibir `issue_kind` como badge (`overdue` / `late_finish`) na lista
- [ ] Tratar `400` por volume excessivo
- [ ] Remover `all_scoring_events` do código (deprecated)

---

## Contexto — dashboard pai (`hierarchy-report`)

No endpoint principal `GET /game/reports/organization/hierarchy-report` (não `/deliveries`), a partir de **jul/2026** a meta de % no prazo passa de 90% para **95%**.

Campos novos no bloco `mtd` (e equivalentes em `prev_full` / `prev_mtd`):

| Campo | Descrição |
|---|---|
| `on_time_goal_pct` | Meta do mês (`95` a partir de jul/2026, `90` antes) |
| `on_time_gap_vs_goal` | Diferença entre `on_time_pct` e a meta |

Usar `on_time_goal_pct` dinamicamente em vez de hardcodar 90% no front.

---

## Referência rápida — mapeamento issue → UI

| `issue` param | O que lista |
|---|---|
| `all` | Pendente em atraso **e** concluída tardia |
| `overdue` | Apenas pendente em atraso (não justificada) |
| `late_finish` | Apenas concluída após o prazo |

| `issue_kind` na resposta | Label sugerido |
|---|---|
| `overdue` | Em atraso |
| `late_finish` | Concluída tardia |
