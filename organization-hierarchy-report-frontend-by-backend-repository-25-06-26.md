# Relatório organizacional hierárquico — integração frontend

Guia para consumir **`GET /game/reports/organization/hierarchy-report`**, com drill-down **Organização → C-Level → Área → Diretoria → Gerência → Supervisor → Colaborador**, comparação MTD, ritmo preditivo, clientes críticos e simulação financeira.

Relacionado: [management-dashboard-cached-frontend.md](./management-dashboard-cached-frontend.md), [management-hierarchy-demo-frontend.md](./management-hierarchy-demo-frontend.md), [organization-hierarchy-insights-frontend.md](./organization-hierarchy-insights-frontend.md) (insights de IA com memória Supabase).

> **Versão alinhada ao redesign visual** (`organization-hierarchy-report.component.*`) + contratos API atualizados (mart 12/13, **26/jun/2026**).

### Alterações recentes (integrar no painel)

| Área | O que mudou |
|------|-------------|
| **`mtd` — % no prazo segmentado** | Novos campos por tag Acessórias (G4, risco churn, onboarding) |
| **`critical_clients`** | Lista completa em `clients` + top 15 em `top_clients` |
| **`mtd.clients_sem_classificacao`** | KPI de empresas ativas sem classificação no portal BWA |
| **Classificação Acessórias** | Null no portal conta como classificação **1** no KPI; lista separada `clients_sem_classificacao` |
| **`client_lists` (kpi-detail)** | Buckets por classificação 1–5 + sem classificação |
| **Drill-down entregas** | `company_cnpj_digits` em cada item de `deliveries[]` |
| **Export Excel** | Endpoint de clientes atendidos com coluna CNPJ |

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

interface OrgMetricsWindow {
  finished: number;
  points_delivered: number;
  goal_points: number;
  expected_points_to_date?: number;
  goal_deliveries?: number;
  expected_deliveries_to_date?: number;
  pending_open: number;
  multa_risk: number;
  multa_incurred: number;
  near_due: number;
  multa_and_near_due: number;
  overdue_pending: number;
  overdue_pending_justified: number;
  overdue_pending_unjustified: number;
  clients_served: number;
  on_time_pct: number;
  /** Somente em `mtd` — % no prazo MTD recalculado por segmento de tag (mart 13). */
  on_time_pct_acessorias_g4?: number;
  on_time_pct_acessorias_risco_de_churn?: number;
  on_time_pct_acessorias_onboarding?: number;
  clients_onboarding: number;
  clients_classificacao_1: number;
  clients_classificacao_2: number;
  clients_classificacao_3: number;
  clients_classificacao_4: number;
  clients_classificacao_5: number;
  /** Empresas ativas atendidas no MTD com classificação **nula** no portal BWA. */
  clients_sem_classificacao: number;
  clients_acessorias_risco_de_churn: number;
  clients_acessorias_onboarding: number;
  clients_acessorias_g4: number;
  // Ritmo preditivo — somente em mtd (calculado na API):
  points_gap_vs_expected?: number;
  pct_of_expected_delivered?: number;
  pace_points_per_day?: number;
  projected_points_month_end?: number;
  required_pace_points_per_day?: number;
  finished_gap_vs_expected?: number;
  pace_finished_per_day?: number;
  projected_finished_month_end?: number;
  required_pace_finished_per_day?: number;
}

interface OrgHierarchyNode {
  node_type: 'organization' | 'c_level' | 'area' | 'diretoria' | 'gerencia' | 'supervisor' | 'player';
  node_id: string;
  label: string;
  players_count: number;
  season_points_total: number;
  balance_score?: number;
  mtd: OrgMetricsWindow;
  prev_full: OrgMetricsWindow;
  prev_mtd: OrgMetricsWindow;
  compare: {
    vs_prev_full_points: number;
    vs_prev_full_points_pct: number;
    vs_prev_mtd_points: number;
    vs_prev_mtd_points_pct: number;
    /** Delta MTD vs prev_mtd simétrico por KPI (ex.: goal_points, expected_points_to_date, multa_incurred) */
    prev_mtd?: Record<string, number>;
    /** Delta MTD vs mês anterior fechado */
    prev_full?: Record<string, number>;
  };
  simulation?: { share_pct: number; payout_brl: number; points_basis: number };
  highlights?: { destaque: HighlightItem[]; atencao: HighlightItem[] };
  finished_by_dow?: { dow: number; finished_count: number; points_total: number }[];
  top_deliveries?: { delivery_title: string; finished_count: number }[];
  access?: OrgHierarchyAccess;
  prior_months_mtd?: OrgMetricsWindow;
  mtd_monthly_series?: OrgMetricsMonthlyPoint[];
  /** Calendário do mês de referência */
  month_day_count?: number;
  mtd_elapsed_days?: number;
  days_remaining_in_month?: number;
  /** Somente nós supervisor */
  team_players_mtd?: TeamPlayerMtd[];
  /** Clientes com tag churn / onboarding / G4 + score de risco */
  critical_clients?: CriticalClientsSummary;
  children?: OrgHierarchyNode[];
}

interface TeamPlayerMtd {
  player_email: string;
  player_name: string;
  points_delivered: number;
  goal_points: number;
  expected_points_to_date: number;
  finished: number;
  goal_deliveries: number;
  expected_deliveries_to_date: number;
}

interface CriticalClientsSummary {
  count: number;
  with_overdue: number;
  with_late_finish: number;
  high_risk: number;
  consecutive_2plus: number;
  avg_risk_score: number;
  max_risk_score: number;
  /** Lista completa de clientes com tag crítica (G4, onboarding ou risco de churn). */
  clients?: CriticalClientItem[];
  /** Top 15 por risk_score (resumo rápido / card). */
  top_clients?: CriticalClientItem[];
}

interface CriticalClientItem {
  company_serve_key: string;
  company_label: string;
  risk_score: number;
  risk_tier: 'critical' | 'high' | 'medium' | 'low';
  is_acessorias_risco_de_churn: boolean;
  is_acessorias_onboarding: boolean;
  is_acessorias_g4: boolean;
  mtd_overdue_unjustified: number;
  mtd_late_finish: number;
  consecutive_issue_months: number;
}

interface OrgMetricsMonthlyPoint {
  cache_month: string;
  mtd_finished: number;
  mtd_points_delivered: number;
  mtd_goal_points: number;
  mtd_expected_points_to_date?: number;
  mtd_goal_deliveries?: number;
  mtd_expected_deliveries_to_date?: number;
  mtd_pending_open: number;
  mtd_multa_risk: number;
  mtd_multa_incurred: number;
  mtd_on_time_pct: number;
  mtd_clients_served: number;
}

interface OrgHierarchyAccessMetrics {
  access_days: number;
  access_sessions: number;
  active_users: number;
  active_users_pct: number;
  avg_access_days_per_active_user: number;
}

interface OrgHierarchyAccess {
  mtd: OrgHierarchyAccessMetrics;
  prev_full: OrgHierarchyAccessMetrics;
  prev_mtd: OrgHierarchyAccessMetrics;
  compare: {
    vs_prev_mtd_active_users: number;
    vs_prev_mtd_active_users_pct: number;
    vs_prev_mtd_access_days: number;
  };
  access_by_dow?: { dow: number; access_days: number; access_sessions: number }[];
  current_streak?: number;
  longest_streak?: number;
  last_access_date?: string | null;
  accessed_today?: boolean;
}
```

### Métricas por janela (`mtd`, `prev_full`, `prev_mtd`)

| Campo | Descrição |
|-------|-----------|
| `finished` | Entregas concluídas (DONE/DELIVERED, credit_basis entrega) |
| `points_delivered` | Pontos das concluídas |
| `goal_points` | Meta do **mês cheio** (dt_prazo no mês; não é “meta MTD”) |
| `expected_points_to_date` | Pontos cuja entrega (dt_prazo) já deveria ter ocorrido até `mtd_end` |
| `goal_deliveries` | Entregas com prazo no mês (meta) |
| `expected_deliveries_to_date` | Entregas com prazo até `mtd_end` |
| `pending_open` | Pendentes (PENDING/DOING, dt_prazo no período) |
| `multa_risk` | Pendente + EntMulta + ref entre `dt_prazo` (excl.) e `dt_atraso` (incl.) |
| `multa_incurred` | Concluída no MTD com EntMulta e **`dt_entrega > dt_atraso`**, exceto justificadas |
| `near_due` | Pendente com status_calc atenção/crítico |
| `multa_and_near_due` | Interseção multa + proximidade vencimento |
| `overdue_pending` | Pendentes em atraso (total) |
| `overdue_pending_justified` / `_unjustified` | Breakdown do atraso |
| `clients_served` | Empresas distintas atendidas (CNPJ dedup) |
| `on_time_pct` | % no prazo MTD (geral; recalculado de tasks no mart 13) |
| `on_time_pct_acessorias_g4` | % no prazo MTD — clientes com tag **#G4** (somente `mtd`) |
| `on_time_pct_acessorias_risco_de_churn` | % no prazo — tag **#RISCODECHURN** (somente `mtd`) |
| `on_time_pct_acessorias_onboarding` | % no prazo — tag **#ONBOARDING** (somente `mtd`) |
| `clients_onboarding` | Clientes ativos em onboarding (portal) |
| `clients_classificacao_1` … `_5` | Empresas **ativas** por classificação portal (1 inclui null → regra abaixo) |
| `clients_sem_classificacao` | Empresas ativas com classificação **nula** no portal BWA |
| `clients_acessorias_risco_de_churn` | Empresas com tag #RISCODECHURN no MTD |
| `clients_acessorias_onboarding` | Tag #ONBOARDING |
| `clients_acessorias_g4` | Tag #G4 |

**Classificação Acessórias (regra de negócio):**

- No **KPI** `clients_classificacao_1`, empresas com `classificacao = null` no portal BWA são contadas como classificação **1**.
- Na **lista** (`client_lists.clients_sem_classificacao`), essas mesmas empresas aparecem separadas — use esse bucket para exibir “Sem classificação” no painel de classificação.
- `clients_classificacao_1` na lista contém **somente** empresas com classificação explícita `1` no portal (não inclui null).

**Nota:** `clients_classificacao_1 + … + _5 + clients_sem_classificacao` pode ser maior que `clients_served` quando há overlap de regras; para UI de classificação, prefira os buckets de `client_lists`.

### Ritmo preditivo (somente `mtd`, calculado na API)

Usar no **hero** ou card “Meta vs realizado” na aba Operacional:

| Campo | Uso no UI |
|-------|-----------|
| `expected_points_to_date` | Linha de meta parcial até hoje |
| `points_gap_vs_expected` | Delta realizado − esperado (negativo = atrasado) |
| `pct_of_expected_delivered` | Gauge ou % no hero |
| `pace_points_per_day` | Ritmo atual |
| `projected_points_month_end` | Projeção linear fim do mês |
| `required_pace_points_per_day` | Ritmo necessário para bater `goal_points` |
| `finished_gap_vs_expected` / `pace_finished_per_day` / `projected_finished_month_end` / `required_pace_finished_per_day` | Mesma lógica para **entregas** |

Calendário no nó: `month_day_count`, `mtd_elapsed_days`, `days_remaining_in_month`.

**Comparativo:** usar `compare.prev_mtd` e `compare.prev_full` para deltas de `expected_points_to_date`, `goal_deliveries`, `expected_deliveries_to_date`, etc.

### Clientes críticos (`critical_clients`)

Mart 13. Inclui **todas** as empresas com tag **#RISCODECHURN**, **#ONBOARDING** ou **#G4** (não só score alto).

| Campo agregado | Descrição |
|----------------|-----------|
| `count` | Total de clientes com tag crítica no escopo |
| `with_overdue` | Com pendências em atraso (MTD) |
| `with_late_finish` | Com entregas concluídas após prazo |
| `high_risk` | `risk_score >= 50` |
| `consecutive_2plus` | 2+ meses consecutivos com problemas |
| `avg_risk_score` / `max_risk_score` | Estatísticas do score 0–100 |
| **`clients`** | **Lista completa** (`critical_clients_list` do mart), ordenada por `risk_score` desc |
| `top_clients` | Top **15** por `risk_score` desc (card / preview) |

**Integração UI sugerida:**

- Card / KPI row: usar agregados + `top_clients` (ou primeiras linhas de `clients`).
- Modal / drawer “Ver todos”: usar `clients` (lista completa).
- Drill-down de entregas: `company_serve_key` de qualquer item de `clients` ou `top_clients`.

**Score (cap 100):** churn +35, G4 +30, onboarding +25; +12/pendência em atraso (máx. 3); +8/entrega tardia (máx. 3); +15/mês consecutivo com problema (máx. 3).

**Tiers:** `critical` ≥75 · `high` ≥50 · `medium` ≥25 · `low` <25

### % no prazo segmentado (somente `mtd`)

Exibir no bloco **Saúde operacional** ou sub-card “Performance por segmento”:

| Campo | Segmento |
|-------|----------|
| `on_time_pct` | Geral |
| `on_time_pct_acessorias_g4` | Tag #G4 |
| `on_time_pct_acessorias_risco_de_churn` | Tag #RISCODECHURN |
| `on_time_pct_acessorias_onboarding` | Tag #ONBOARDING |

Valores 0–100 (2 casas). Requer mart 13 rematerializado com `node_on_time_pct`.

### Pontos por colaborador (`team_players_mtd`)

Somente em nós **`supervisor`**. Ordenado por `points_delivered` desc. Exibir no drill-down do supervisor ou sub-aba em **Pessoas**.

### Métricas de acesso (`access`)

Fonte: Supabase `user_daily_access`. Se indisponível, nó vem sem `access`.

---

## Hierarquia (`children`)

Ordem canônica:

`organization` → `c_level` → `area` → `diretoria` → `gerencia` → `supervisor` → `player`

Ver regras de encaixe, organograma e Legalização no doc de backend [`organization-hierarchy-report-frontend.md`](./organization-hierarchy-report-frontend.md) (seção Hierarquia).

---

## Layout e UX (redesign visual)

Inspirado no protótipo **Organizational-Dashboard-BWA-Refatoracao-visual**.

### Estrutura da página

```text
HEADER · seletor de mês · sync MTD · Sair
TABS: Operacional | Acessos ao app | Simulação financeira

── Operacional ──
1. Indicadores principais (4 hero cards clicáveis)
2. Meta vs realizado / ritmo (barra ou mini-cards: esperado, gap, projeção, ritmo necessário)
3. Saúde operacional (barra empilhada + chips de risco)
4. Clientes críticos (KPIs + tabela; preview `top_clients` ou link “Ver todos” → `clients`)
5. Entregas por dia da semana (2/3) + Classificação de empresas (1/3) — incluir chip **Sem classificação**
6. Ranking de diretorias (essencial + toggle Ver detalhes)
7. Pessoas (tabs Destaques/Atenção + busca + nível hierárquico)
8. Hierarquia (colunas compactas + toggle métricas completas)
   └── supervisor: exibir team_players_mtd no painel lateral ou linha expandida

── Simulação financeira ──
Input simulation_pot_brl; payout raiz; simulação na árvore (modo completo)
```

### Consolidação (evitar redundância)

| Antes | Depois |
|-------|--------|
| Resumo MTD + Dados globais + Riscos (~26 cards) | 4 hero KPIs + ritmo + Saúde operacional + Clientes críticos |
| Simulação na sidebar | Aba Simulação financeira |
| Destaques e atenção em 2 cards | Card único Pessoas com tabs |
| Ranking com 14+ colunas | 5 essenciais + toggle |
| Árvore com todas as colunas | Modo compacto + toggle |

### Implementação Angular

| Artefato | Responsabilidade |
|----------|------------------|
| `organization-hierarchy-report.component.*` | Layout, tabs, hero, ritmo, clientes críticos |
| `org-hierarchy-tree-table.component.*` | `showAllMetrics`, colunas compactas |
| `org-hierarchy-report.mapper.ts` | `mapOrgPipelineSegments`, `ORG_RANKING_*`, `ORG_TREE_COMPACT_COLUMNS` |
| `org-hierarchy-pace.mapper.ts` (sugerido) | Formatar gap, projeção, ritmo a partir de `root.mtd` |
| `org-hierarchy-critical-clients.mapper.ts` (sugerido) | Tiers, chips de tag, ordenação `clients` / `top_clients` |
| `org-hierarchy-classificacao.mapper.ts` (sugerido) | Buckets 1–5 + sem classificação a partir de `client_lists` |

### Sugestões de binding (novos blocos)

**Hero / ritmo (`root.mtd` + calendário do nó):**

```typescript
const mtd = root.mtd;
const pct = mtd.pct_of_expected_delivered ?? 0;
const gap = mtd.points_gap_vs_expected ?? 0;
const label = gap >= 0 ? 'Acima da meta parcial' : 'Abaixo da meta parcial';
// Comparativo: root.compare.prev_mtd?.expected_points_to_date
```

**Saúde operacional (`mapOrgPipelineSegments`):**

Segmentos clicáveis → `/deliveries?drilldown=...`. Incluir `multa_incurred` com tooltip “após dt_atraso”.

**Clientes críticos:**

```typescript
const cc = root.critical_clients;
if (cc?.count) {
  // KPI row: count, with_overdue, high_risk, consecutive_2plus
  // Preview table: cc.top_clients (até 15)
  // Modal "Ver todos": cc.clients (lista completa)
  // Drill-down: company_serve_key de qualquer item
}
```

**% no prazo segmentado (`root.mtd`):**

```typescript
const segments = [
  { label: 'Geral', value: root.mtd.on_time_pct },
  { label: 'G4', value: root.mtd.on_time_pct_acessorias_g4 },
  { label: 'Risco churn', value: root.mtd.on_time_pct_acessorias_risco_de_churn },
  { label: 'Onboarding', value: root.mtd.on_time_pct_acessorias_onboarding },
].filter((s) => s.value != null);
```

**Classificação de empresas (card 1/3 ou kpi-detail):**

```typescript
// KPIs no nó: mtd.clients_classificacao_1 … _5, mtd.clients_sem_classificacao
// Listas completas: GET kpi-detail com kpi=clients_classificacao_1 | … | clients_sem_classificacao
// Exibir chip "Sem classificação" quando clients_sem_classificacao > 0
```

**Supervisor expandido:**

```typescript
if (node.node_type === 'supervisor' && node.team_players_mtd?.length) {
  // mini-table: player_name, points_delivered, expected_points_to_date, goal_points
}
```

---

## Blocos de UI

1. **Hero (4 KPIs)** — pontos MTD, % prazo, entregas, clientes (+ deltas `compare`)
2. **Ritmo / meta parcial** — `expected_points_to_date`, gap, projeção, ritmo necessário; comparar com `compare.prev_mtd`
3. **Saúde operacional** — pipeline: `pending_open`, `near_due`, `overdue_pending_*`, `multa_risk`, `multa_incurred`; opcional: mini-gauges de % segmentado
4. **Clientes críticos** — KPIs + preview `top_clients` + lista completa `clients`
5. **Classificação Acessórias** — barras/chips 1–5 + **Sem classificação** (`clients_sem_classificacao`); drill → `kpi-detail`
6. **Simulação** — aba dedicada; `simulation.payout_brl` por nó
7. **Ranking diretorias** — `% no prazo` ou pontos/colaborador; colunas progressivas
8. **Drill-down** — accordion / lazy `node_type` + `node_id` + `depth`
9. **Heatmap** — `finished_by_dow` (dow ISO 1=seg … 7=dom)
10. **Acessos ao app** — aba `access.*`
11. **Pessoas** — `highlights` + `team_players_mtd` no supervisor
12. **Insights de IA** — [organization-hierarchy-insights-frontend.md](./organization-hierarchy-insights-frontend.md)
13. **Drill-down de KPI** — histórico mensal, listas de empresas ou entregas

---

## Drill-down de KPIs

### Histórico mensal

```http
GET /game/reports/organization/hierarchy-report/kpi-detail?month=2026-06&kpi=on_time_pct&node_type=area&node_id=fiscal&months=4
```

| `kpi` | Comportamento |
|-------|---------------|
| `on_time_pct`, `finished`, `multa_*`, etc. | Histórico mensal via mart (coluna `mtd_*`) |
| `clients_served` | Histórico live + **`client_lists`** |
| `clients_acessorias_risco_de_churn` \| `clients_acessorias_onboarding` \| `clients_acessorias_g4` | Histórico live + **`client_lists`** |
| `clients_classificacao_1` … `clients_classificacao_5` | Histórico via mart + **`client_lists`** |
| `clients_sem_classificacao` | Histórico via mart + **`client_lists`** |

**`client_lists` (quando `kpi` ∈ clientes ou classificação):**

```typescript
client_lists: {
  clients_served: OrgHierarchyClientListItem[];
  clients_acessorias_g4: OrgHierarchyClientListItem[];
  clients_acessorias_onboarding: OrgHierarchyClientListItem[];
  clients_acessorias_risco_de_churn: OrgHierarchyClientListItem[];
  clients_classificacao_1: OrgHierarchyClientListItem[];
  clients_classificacao_2: OrgHierarchyClientListItem[];
  clients_classificacao_3: OrgHierarchyClientListItem[];
  clients_classificacao_4: OrgHierarchyClientListItem[];
  clients_classificacao_5: OrgHierarchyClientListItem[];
  clients_sem_classificacao: OrgHierarchyClientListItem[];  // classificacao null no portal
}

interface OrgHierarchyClientListItem {
  company_serve_key: string;       // CNPJ digits ou emp_id (chave mart)
  company_cnpj_digits?: string | null;  // CNPJ só dígitos, quando disponível
  company_name: string;
  acessorias_classificacao?: number | null;  // 1–5 ou null (sem classificação)
  is_acessorias_g4: boolean;
  is_acessorias_onboarding: boolean;
  is_acessorias_risco_de_churn: boolean;
  player_email: string | null;
  player_name: string | null;
  diretor_name: string | null;
  gerente_name: string | null;
  supervisor_name: string | null;
}
```

**Regras de contagem (`client_lists`):**

| Bucket | Filtro |
|--------|--------|
| `clients_served` | Entrega MTD (`credit_basis=entrega`) |
| `clients_acessorias_*` | `dt_prazo` no MTD + tag correspondente |
| `clients_classificacao_N` | Empresa ativa + entrega MTD + `classificacao = N` explícita no portal |
| `clients_sem_classificacao` | Empresa ativa + entrega MTD + `classificacao IS NULL` no portal |

Paridade: ao abrir `kpi-detail` com `kpi=clients_classificacao_1`, a lista relevante é `client_lists.clients_classificacao_1` (`.length` ≈ valor do histórico do mês corrente). O KPI agregado `mtd.clients_classificacao_1` **inclui** null como 1; a lista `_1` **não** — use `clients_sem_classificacao` para null.

### Export Excel — clientes atendidos

```http
GET /game/reports/organization/hierarchy-report/clients-served/export/xlsx
  ?month=2026-06&node_type=organization&node_id=bwa
```

Colunas: Empresa, **CNPJ**, Chave cliente, Diretoria, Gerência, Supervisão, Responsável, E-mail, Classificação Acessórias, tags G4/onboarding/churn, data atendimento MTD.

### Entregas por KPI operacional

```http
GET /game/reports/organization/hierarchy-report/deliveries?month=2026-06&drilldown=multa_incurred&node_type=diretoria&node_id=fiscal|user-id
```

| Campo por item em `deliveries` | Descrição |
|--------------------------------|-----------|
| `delivery_title` | Razão social / cliente (empresa) |
| `action_title` | Nome da tarefa/obrigação (ex.: DCTF, SPED) |
| `company_serve_key` | Chave mart (CNPJ digits ou emp_id) |
| `company_cnpj_digits` | CNPJ só dígitos, quando disponível (`null` se ausente) |

| `drilldown` | KPI | Regra |
|-------------|-----|-------|
| `multa_risk` | `mtd.multa_risk` | Pendente + EntMulta + ref entre prazo e atraso |
| `multa_incurred` | `mtd.multa_incurred` | Concluída MTD + EntMulta + **`dt_entrega > dt_atraso`**, exceto justificada |
| `near_due` | `mtd.near_due` | Pendente atenção/crítico |
| `overdue_pending` | `mtd.overdue_pending` | Pendente vencida |
| `overdue_pending_justified` / `_unjustified` | breakdown | |
| `critical_client` | `critical_clients.clients[]` ou `top_clients[]` | Entregas problemáticas do cliente (tag churn/onboarding/G4); requer `company_serve_key` |

**Paridade KPI ↔ drill-down:** `total_deliveries` deve bater com o KPI do nó no mesmo escopo. Multas: contagem por **`delivery_id` distinto** por jogador/time (sem dedup global que subcontava vs mart).

### Drill-down de cliente crítico

Ao clicar em uma linha de `critical_clients.clients` ou `top_clients`:

```http
GET /game/reports/organization/hierarchy-report/deliveries
  ?month=2026-06
  &drilldown=critical_client
  &company_serve_key=12345678000199
  &issue=all
  &node_type=organization
  &node_id=bwa
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `company_serve_key` | Sim | Mesmo valor de `clients[].company_serve_key` ou `top_clients[].company_serve_key` |
| `issue` | Não | `all` (default) · `overdue` · `late_finish` |

Cada delivery retorna `issue_kind` (`overdue` \| `late_finish`), `action_title`, `company_serve_key`, **`company_cnpj_digits`**, responsável e hierarquia — mesma estrutura agrupada (`diretorias → gerencias → supervisoes → deliveries`).

**Resposta (trecho):**

```typescript
deliveries: {
  delivery_id: string;
  delivery_title: string;
  action_title: string | null;
  company_serve_key?: string | null;
  company_cnpj_digits?: string | null;
  issue_kind?: 'overdue' | 'late_finish' | null;
  client_key: string | null;
  dt_prazo: string | null;
  dt_atraso: string | null;
  status?: string | null;
  status_calc?: string | null;
  points?: number | null;
  finished_at?: string | null;
  is_justificada?: boolean | null;
  player_email: string;
  player_name: string | null;
  team_id: string;
  team_name: string | null;
}[];
```

Export CSV das entregas de clientes críticos:

```http
GET /game/reports/organization/hierarchy-report/critical-clients/deliveries/export
  ?month=2026-06&company_serve_key=...&node_type=...&node_id=...
```

Legado: `GET .../multa-risk` = `drilldown=multa_risk`.

### `HighlightItem`

| Campo | Descrição |
|-------|-----------|
| `node_id` | Email do player |
| `label` | Nome |
| `team_id` / `team_label` | Supervisão |
| `mtd_points_delivered` | Destaque |
| `mtd_on_time_pct` | Destaque |
| `mtd_overdue_pending` | Atenção |
| `mtd_multa_risk` | Atenção |

---

## Pipeline lake (ops)

1. `11_int_org_hierarchy_dim`
2. `12_mart_org_player_ops_metrics`
3. `13_mart_org_hierarchy_report_cache` (**após 12 e 05**)

Rematerializar **12 → 13** após alterações de KPI (% segmentado, classificação null→1, `clients_sem_classificacao`, `critical_clients_list`). Reiniciar API após deploy.

**Checklist frontend (jun/2026):**

- [ ] Exibir `mtd.on_time_pct_acessorias_*` (3 segmentos)
- [ ] Card clientes críticos: `clients` (lista completa) + `top_clients` (preview)
- [ ] Classificação: chip/lista **Sem classificação** + drill `kpi=clients_sem_classificacao`
- [ ] Listas kpi-detail: buckets `clients_classificacao_1` … `_5` e `clients_sem_classificacao`
- [ ] Coluna CNPJ em tabelas de drill-down (`company_cnpj_digits`)
- [ ] Export XLSX clientes atendidos (botão no card de clientes)

Audit: [`audit-query-org-hierarchy-parity.sql`](./mozart-dashboard-cache-transforms/audit-query-org-hierarchy-parity.sql)

---

## Erros

| Status | Quando |
|--------|--------|
| **404** | Sem cache no mês ou usuário fora do escopo URT |
| **403** | Papel não autorizado |
| **503** | Lake indisponível |
