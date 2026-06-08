# Relatório organizacional hierárquico — integração frontend

Guia para consumir **`GET /game/reports/organization/hierarchy-report`**, com drill-down **Organização → Diretoria → Gerência → Supervisão → Colaborador**, comparação MTD e simulação financeira.

Relacionado: [management-dashboard-cached-frontend.md](./management-dashboard-cached-frontend.md), [management-hierarchy-demo-frontend.md](./management-hierarchy-demo-frontend.md).

---

## Endpoint

```http
GET /game/reports/organization/hierarchy-report?month=2026-06&simulation_pot_brl=100000&depth=5
Authorization: Bearer <token>
client_id: bwa
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | `YYYY-MM` ou `YYYY-MM-DD` |
| `simulation_pot_brl` | Não | Pote fictício (BRL); rateio proporcional aos pontos MTD da org |
| `depth` | Não | 1–5 (default 5). Limita profundidade da árvore |
| `node_type` | Não | Lazy drill-down: `organization` \| `diretoria` \| `gerencia` \| `supervisao` \| `player` |
| `node_id` | Não | Id do nó (`client_id`, `user_id`, `team_id` ou email) |

**Roles:** `GERENTE`, `DIRETOR`, `C_LEVEL`, `ADMIN`, `SERVICE`

| Papel | Raiz (`root`) |
|-------|----------------|
| C_LEVEL / ADMIN / SERVICE | `organization` (árvore completa) |
| DIRETOR | `diretoria` do usuário logado |
| GERENTE | `gerencia` do usuário logado |

**Fonte:** Snowflake `bwa.mart_org_hierarchy_report_cache` (requer `REPORTS_CACHE_READ_SOURCE=snowflake` ou `auto` com lake configurado).

---

## Resposta

```typescript
interface OrganizationHierarchyReportResponse {
  refreshed_at: string;
  params: {
    cache_month: string;
    mtd_start: string;
    mtd_end: string;
    prev_month: string;
    prev_mtd_start: string;
    prev_mtd_end: string;
    simulation_pot_brl?: number;
    points_per_brl?: number; // pot / pontos MTD org
  };
  root: OrgHierarchyNode;
}

interface OrgHierarchyNode {
  node_type: 'organization' | 'diretoria' | 'gerencia' | 'supervisao' | 'player';
  node_id: string;
  label: string;
  players_count: number;
  season_points_total: number;
  balance_score?: number;
  mtd: OrgMetricsWindow;
  prev_full: OrgMetricsWindow;   // mês anterior fechado
  prev_mtd: OrgMetricsWindow;    // MTD simétrico no mês anterior
  compare: {
    vs_prev_full_points: number;
    vs_prev_full_points_pct: number;
    vs_prev_mtd_points: number;
    vs_prev_mtd_points_pct: number;
  };
  simulation?: { share_pct: number; payout_brl: number; points_basis: number };
  highlights?: { destaque: HighlightItem[]; atencao: HighlightItem[] };
  finished_by_dow?: { dow: number; finished_count: number; points_total: number }[];
  top_deliveries?: { delivery_title: string; finished_count: number }[];
  children?: OrgHierarchyNode[];
}
```

### Métricas por janela (`mtd`, `prev_full`, `prev_mtd`)

| Campo | Descrição |
|-------|-----------|
| `finished` | Entregas concluídas (DONE/DELIVERED, credit_basis entrega) |
| `points_delivered` | Pontos das concluídas |
| `goal_points` | Meta (dt_prazo no período) |
| `pending_open` | Pendentes (PENDING/DOING, dt_prazo no período) |
| `multa_risk` | Pendentes com risco de multa |
| `near_due` | Pendentes com status_calc atencao/critico |
| `multa_and_near_due` | Interseção multa + proximidade vencimento |
| `overdue_pending` | Pendentes com dt_prazo &lt; hoje |
| `clients_served` | Clientes distintos atendidos (concluídas) |
| `on_time_pct` | % no prazo (exclui justificadas) |
| `clients_onboarding` | Clientes em setup/onboarding |
| `clients_classificacao_1` … `_5` | Clientes por classificação portal |

---

## UI sugerida

1. **Hero** — `root.mtd` vs `compare.vs_prev_mtd_*` e `vs_prev_full_*`
2. **Simulação** — input `simulation_pot_brl`; exibir `simulation.payout_brl` por nó
3. **Ranking diretorias** — `root.children` quando C_LEVEL; ordenar por `balance_score` ou `mtd.points_delivered`
4. **Drill-down** — accordion em `children`; ou lazy `node_type` + `node_id` + `depth=2`
5. **Riscos** — cards `mtd.multa_risk`, `near_due`, `overdue_pending`
6. **Heatmap** — `finished_by_dow` (dow ISO 1=seg … 7=dom)
7. **Destaques** — `highlights.destaque` / `highlights.atencao`

---

## Pipeline lake (ops)

Ordem de materialização no Mozart:

1. `11_int_org_hierarchy_dim` (view, após sync webhooks)
2. `12_mart_org_player_ops_metrics` (após 01c + 11)
3. `13_mart_org_hierarchy_report_cache` (**sempre após 12 e 05**)

Audit: [`audit-query-org-hierarchy-parity.sql`](./mozart-dashboard-cache-transforms/audit-query-org-hierarchy-parity.sql)

---

## Erros

| Status | Quando |
|--------|--------|
| **404** | Sem cache no mês ou usuário fora do escopo URT |
| **403** | Papel não autorizado |
| **503** | Lake indisponível |
