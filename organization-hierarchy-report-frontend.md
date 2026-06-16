# Relatório organizacional hierárquico — integração frontend

Guia para consumir **`GET /game/reports/organization/hierarchy-report`**, com drill-down **Organização → C-Level → Área → Diretoria → Gerência → Supervisor → Colaborador**, comparação MTD e simulação financeira.

Relacionado: [management-dashboard-cached-frontend.md](./management-dashboard-cached-frontend.md), [management-hierarchy-demo-frontend.md](./management-hierarchy-demo-frontend.md), [organization-hierarchy-insights-frontend.md](./organization-hierarchy-insights-frontend.md) (insights de IA com memória Supabase).

---

## Endpoint

```http
GET /game/reports/organization/hierarchy-report?month=2026-06&simulation_pot_brl=100000&depth=7
Authorization: Bearer <token>
client_id: bwa
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | `YYYY-MM` ou `YYYY-MM-DD` |
| `simulation_pot_brl` | Não | Pote fictício (BRL); rateio proporcional aos pontos MTD da org |
| `depth` | Não | 1–7 (default **7** = inclui players). Por tipo: 1=org, 2=c_level, 3=area, 4=diretoria, 5=gerencia, 6=supervisor, 7=player. Com lazy drill-down (`node_type`+`node_id`), soma níveis **abaixo** do nó |
| `node_type` | Não | Lazy drill-down: `organization` \| `c_level` \| `area` \| `diretoria` \| `gerencia` \| `supervisor` \| `player` |
| `node_id` | Não | Id do nó (`client_id`, `area_key`, `{area}\|{user_id}`, `team_id` ou email) |

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
  node_type: 'organization' | 'c_level' | 'area' | 'diretoria' | 'gerencia' | 'supervisor' | 'player';
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
  highlights?: { destaque: HighlightItem[]; atencao: HighlightItem[] }; // top 10 cada
  finished_by_dow?: { dow: number; finished_count: number; points_total: number }[];
  top_deliveries?: { delivery_title: string; finished_count: number }[]; // top 5 MTD
  children?: OrgHierarchyNode[];
}
```

### Métricas por janela (`mtd`, `prev_full`, `prev_mtd`)

| Campo | Descrição |
|-------|-----------|
| `finished` | Entregas concluídas (DONE/DELIVERED, credit_basis entrega) |
| `points_delivered` | Pontos das concluídas |
| `goal_points` | Meta do **mês cheio** (dt_prazo dentro de `cache_month..LAST_DAY(cache_month)`; não é “meta MTD”) |
| `pending_open` | Pendentes (PENDING/DOING, dt_prazo no período) |
| `multa_risk` | Pendentes com `EntMulta = S` **e** data de referência entre `dt_prazo` (exclusivo) e `dt_atraso` (inclusivo) |
| `near_due` | Pendentes com status_calc atencao/critico |
| `multa_and_near_due` | Interseção multa + proximidade vencimento |
| `overdue_pending` | Pendentes com dt_prazo &lt; hoje |
| `clients_served` | Clientes distintos atendidos (concluídas) |
| `on_time_pct` | % no prazo (inclui Ent. justificada; atraso justificado é pendente) |
| `clients_onboarding` | Clientes em setup/onboarding |
| `clients_classificacao_1` … `_5` | Clientes por classificação portal |

---

## Hierarquia (`children`)

Ordem canônica de **níveis**:

`organization` → `c_level` (andre.adolfo) → `c_level` (pedro.barros) → `area` (Fiscal / Contábil / Departamento Pessoal) → `diretoria` → `gerencia` → `supervisor` → `player`

### Fonte da árvore (prioridade)

1. **`organograma-bwa-09-06-2026.json`** — define área (`setor_portal_name`), diretor, gerente e supervisor por `team_name` / player (seed em `organogram_bwa_hierarchy_seed.sql` → `11_int_org_hierarchy_dim`).
2. **`user_role_team_month`** — fallback quando o time não está no organograma.
3. **`bwa_player_roster`** — define quais colaboradores entram como `player` e em qual `team_id` (validação de supervisão).
4. **`user_team_client` / `team.leader_id`** — fallback de supervisor quando organograma não cobre o time.

O mart `13` materializa `parent_node_type` / `parent_node_id` por nó; a API monta `children` recursivamente a partir desses links.

### Regras de encaixe

- **Board C-Level:** andre.adolfo (topo) e pedro.barros (operacional). Todos os ramos operacionais partem de **pedro.barros**.
- **Áreas** (filhas de pedro.barros, sempre nesta ordem): `fiscal` (Fiscal), `contabil` (Contábil), `pessoal` (Departamento Pessoal). Classificação pelo prefixo do nome do time (`Fiscal -`, `Contábil -`, `Pessoal -`); demais times → fiscal.
- **Diretorias canônicas** (filhas de cada área): Daniel Viana, Thales Furtado, Augusto Santana (`node_type: diretoria`, `node_id` = `{area_key}|{user_id}`).
- **Sem diretoria:** nó sintético por área `node_id: {area_key}|__sem_diretoria__`, `label: Sem diretoria` — gerentes/ramos **sem diretor no URT** e no escopo operacional do pedro (não inclui times com diretor board/não canônico, ex. marcio.guendler).
- **Legalização** (times 63–68): players sob supervisor `ellem.sampaio`; gerente na árvore = `klijda.karielly`.
- **Escopo pedro.barros:** só entram gerentes/times com diretor canônico (Daniel/Thales/Augusto) ou sem diretor no URT; ramos de outros diretores são excluídos.
- **Contas demo/fake excluídas da árvore:** `demo.diretor.hierarquia`, `demo.gerente.*`, `klijda.fake`, `ellem.fake`. Filhos remapeados: fake Klijda/Ellem → gerente real; demo diretor → bucket **Sem diretoria**.
- **Gerência no URT sem players diretos:** nó `gerencia` ainda aparece (ex.: gestor com supervisões abaixo) e recebe roll-up dos filhos.
- **Skip de nível:** se supervisor/gerente/diretor não existir, o filho liga ao elo seguinte (ex.: sem diretor → `__sem_diretoria__`).
- **`supervisor`:** pessoa (`user_id`), não time. Players ficam abaixo do supervisor quando existir.
- **Irmãos (mesmo pai):** ordenados por tipo de nó, depois pontos MTD desc, depois nome — espelhando pares de gestão do portal (ex.: Nicoly e Wendya sob o mesmo diretor).

### Exemplo Pessoal / Recife

Quando o URT estiver alinhado ao organograma Bitrix:

- **Daniel Viana** (`diretoria`) → filhos **`gerencia`**: Wendya, Nicoly, Caio, … (irmãos).
- **Nicoly Costa** (`gerencia`) → filhos **`supervisor`**: Juliane Borges, Rayna Nascimento.
- Supervisões → **`player`** do roster nos times 34 / 36.

Se Juliane/Rayna estiverem com GERENTE errado no URT (ex.: Wendya em vez de Nicoly), a árvore refletirá o URT — corrigir `user_role_team_month` e rematerializar 11→12→13.

---

1. **Hero** — `root.mtd` vs `compare.vs_prev_mtd_*` e `vs_prev_full_*`
2. **Simulação** — input `simulation_pot_brl`; exibir `simulation.payout_brl` por nó
3. **Ranking diretorias** — `root.children` quando C_LEVEL; ordenar por `balance_score` ou `mtd.points_delivered`
4. **Drill-down** — accordion em `children`; ou lazy `node_type` + `node_id` + `depth=2`
5. **Riscos** — cards `mtd.multa_risk`, `near_due`, `overdue_pending`
6. **Heatmap** — `finished_by_dow` (dow ISO 1=seg … 7=dom)
7. **Destaques** — `highlights.destaque` / `highlights.atencao` (top 10 por nó)
8. **Insights de IA** — seção opcional via [organization-hierarchy-insights-frontend.md](./organization-hierarchy-insights-frontend.md) (`GET` cache + `POST` para gerar)
9. **Drill-down de KPI** — ao clicar em um KPI MTD, abrir modal com histórico mensal ou lista de entregas (ver abaixo)

---

## Drill-down de KPIs

### Histórico mensal (gráfico / tabela)

Ao clicar em KPIs como `on_time_pct`, `clients_served`, `finished`, etc.:

```http
GET /game/reports/organization/hierarchy-report/kpi-detail?month=2026-06&kpi=on_time_pct&node_type=area&node_id=fiscal&months=4
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | Mês de referência (último ponto da série) |
| `kpi` | Sim | `on_time_pct` \| `clients_served` \| `finished` \| `points_delivered` \| `pending_open` \| `near_due` \| `overdue_pending` \| `multa_risk` |
| `node_type` | Sim | Tipo do nó clicado |
| `node_id` | Sim | Id do nó clicado |
| `months` | Não | Quantidade de meses (default **4**, ex.: mar/abr/mai/jun) |

**Resposta:**

```typescript
interface OrganizationHierarchyKpiDetailResponse {
  kpi: string;
  kpi_label: string; // ex.: "Entregas no prazo (MTD)"
  node_type: string;
  node_id: string;
  node_label: string;
  history: {
    cache_month: string;   // '2026-03-01'
    month_label: string;   // '2026-03'
    mtd_start: string;
    mtd_end: string;       // MTD simétrico (hoje no mês corrente)
    value: number | null;  // null se cache não materializado
  }[];
}
```

**UX sugerida:** gráfico de barras ou linha com `month_label` no eixo X e `value` no eixo Y. Exibir `mtd_start`–`mtd_end` no tooltip.

### Entregas com risco de multa (lista hierárquica)

Ao clicar em `mtd.multa_risk`:

```http
GET /game/reports/organization/hierarchy-report/multa-risk?month=2026-06&node_type=diretoria&node_id=fiscal|thales-user-id
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | Mês de referência |
| `node_type` | Não | Escopo do clique (omitir = organização inteira no escopo do usuário) |
| `node_id` | Não | Id do nó (obrigatório se `node_type` informado) |

**Resposta:**

```typescript
interface OrganizationHierarchyMultaRiskResponse {
  cache_month: string;
  mtd_start: string;
  mtd_end: string;
  total_deliveries: number;
  diretorias: {
    node_id: string;
    label: string;
    delivery_count: number;
    gerencias: {
      node_id: string;
      label: string;
      delivery_count: number;
      supervisoes: {
        node_id: string;
        label: string;
        delivery_count: number;
        deliveries: {
          delivery_id: string;
          delivery_title: string;
          client_key: string | null;
          dt_prazo: string | null;
          dt_atraso: string | null;
          player_email: string;
          player_name: string | null;
          team_id: string;
          team_name: string | null;
        }[];
      }[];
    }[];
  }[];
}
```

**UX sugerida:** accordion `diretoria → gerência → supervisão → tabela de entregas`. Mesmas regras de escopo JWT do relatório principal.

**Nota:** o histórico mensal exige cache materializado em `mart_org_hierarchy_report_cache` para cada mês da série (mar–jun). A lista de multa consulta `user_actions` + `int_org_hierarchy_dim` em tempo real com a mesma regra do mart 12 (`mtd_end` como data de referência na janela técnico→legal).

---

### `HighlightItem`

| Campo | Descrição |
|-------|-----------|
| `node_id` | Email do colaborador (chave do nó `player`) |
| `label` | Nome do colaborador |
| `team_id` | Id do time (supervisão) |
| `team_label` | Nome do time |
| `mtd_points_delivered` | Pontos MTD (destaque) |
| `mtd_on_time_pct` | % no prazo MTD |
| `mtd_overdue_pending` | Pendentes vencidas (atenção) |
| `mtd_multa_risk` | Risco de multa na janela técnico→legal (atenção) |

---

## Pipeline lake (ops)

Ordem de materialização no Mozart:

0. `npx ts-node scripts/generate-organogram-hierarchy-seed.ts` (após atualizar `docs/organograma-bwa/organograma-bwa-09-06-2026.json`)
1. `11_int_org_hierarchy_dim` (view, após sync webhooks + seed organograma)
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
